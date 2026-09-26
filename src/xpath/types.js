// XPath 2.0 atomic values, casting, comparison and arithmetic semantics
// (non-schema-aware processor: node content atomizes to xs:untypedAtomic).
import { Decimal } from '../model/decimal.js';
import { ELEMENT, ATTRIBUTE, TEXT, DOCUMENT, COMMENT, PI, stringValue } from '../xml/parser.js';

export class XPathError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'XPathError';
    this.code = code;
  }
}

export const STR = 'xs:string';
export const UNT = 'xs:untypedAtomic';
export const BOOL = 'xs:boolean';
export const INT = 'xs:integer';
export const DEC = 'xs:decimal';
export const DBL = 'xs:double';
export const DATE = 'xs:date';

export const isNode = (x) => x !== null && typeof x === 'object' && typeof x.kind === 'number';
export const isNumeric = (a) => a.t === INT || a.t === DEC || a.t === DBL;

export const str = (v) => ({ t: STR, v });
export const unt = (v) => ({ t: UNT, v });
export const TRUE = Object.freeze({ t: BOOL, v: true });
export const FALSE = Object.freeze({ t: BOOL, v: false });
export const bool = (b) => (b ? TRUE : FALSE);
export const int = (v) => ({ t: INT, v: v instanceof Decimal ? v : Decimal.of(v) });
export const dec = (v) => ({ t: DEC, v: v instanceof Decimal ? v : Decimal.of(v) });
export const dbl = (v) => ({ t: DBL, v });

export function atomize(seq) {
  const out = [];
  for (const it of seq) out.push(isNode(it) ? unt(stringValue(it)) : it);
  return out;
}

export function atomizeItem(it) {
  return isNode(it) ? unt(stringValue(it)) : it;
}

// ---------- string conversion ----------

export function doubleToString(v) {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'INF';
  if (v === -Infinity) return '-INF';
  if (v === 0) return Object.is(v, -0) ? '-0' : '0';
  const a = Math.abs(v);
  if (a >= 1e-6 && a < 1e6) {
    // decimal notation without trailing zeros
    return Decimal.fromNumber(v).toString();
  }
  // canonical E notation: mantissa with at least one fractional digit
  let [m, e] = v.toExponential().split('e');
  if (!m.includes('.')) m += '.0';
  return `${m}E${Number(e)}`;
}

export function atomicToString(a) {
  switch (a.t) {
    case STR:
    case UNT:
      return a.v;
    case BOOL:
      return a.v ? 'true' : 'false';
    case INT:
    case DEC:
      return a.v.toString();
    case DBL:
      return doubleToString(a.v);
    case DATE:
      return a.v.lexical;
    default:
      return String(a.v);
  }
}

export function itemToString(it) {
  return isNode(it) ? stringValue(it) : atomicToString(it);
}

// ---------- casting ----------

const DEC_LEX = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const INT_LEX = /^[+-]?\d+$/;
const DBL_LEX = /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|[+-]?INF|NaN)$/;
const DATE_LEX = /^(-?\d{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/;

function castErr(v, type) {
  return new XPathError('FORG0001', `Hodnotu "${v}" nemožno previesť na ${type}`);
}

function parseDate(s) {
  const m = DATE_LEX.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return null;
  // comparable key: days from epoch (ignores timezone offsets beyond date part)
  const key = Date.UTC(y, mo - 1, d) / 86400000;
  return { y, m: mo, d, tz: m[4] || null, key, lexical: s };
}

export function castAs(a, type) {
  if (a.t === type) return a;
  const s = a.t === STR || a.t === UNT ? a.v.trim() : null;
  switch (type) {
    case STR:
      return str(atomicToString(a));
    case UNT:
      return unt(atomicToString(a));
    case DEC: {
      if (s !== null) {
        if (!DEC_LEX.test(s)) throw castErr(a.v, type);
        return dec(Decimal.parse(s));
      }
      if (a.t === INT) return dec(a.v);
      if (a.t === DBL) {
        if (!Number.isFinite(a.v)) throw castErr(a.v, type);
        // Saxon converts via new BigDecimal(double): exact binary expansion
        return dec(Decimal.fromDoubleExact(a.v));
      }
      if (a.t === BOOL) return dec(a.v ? 1 : 0);
      throw castErr(atomicToString(a), type);
    }
    case INT: {
      if (s !== null) {
        if (!INT_LEX.test(s)) throw castErr(a.v, type);
        return int(Decimal.parse(s));
      }
      if (a.t === DEC) return int(a.v.round(0, 'trunc'));
      if (a.t === DBL) {
        if (!Number.isFinite(a.v)) throw castErr(a.v, type);
        return int(Decimal.fromNumber(Math.trunc(a.v)));
      }
      if (a.t === BOOL) return int(a.v ? 1 : 0);
      throw castErr(atomicToString(a), type);
    }
    case DBL: {
      if (s !== null) {
        if (!DBL_LEX.test(s)) throw castErr(a.v, type);
        if (s.endsWith('INF')) return dbl(s.startsWith('-') ? -Infinity : Infinity);
        return dbl(s === 'NaN' ? NaN : Number(s));
      }
      if (a.t === INT || a.t === DEC) return dbl(a.v.toNumber());
      if (a.t === BOOL) return dbl(a.v ? 1 : 0);
      throw castErr(atomicToString(a), type);
    }
    case BOOL: {
      if (s !== null) {
        if (s === 'true' || s === '1') return TRUE;
        if (s === 'false' || s === '0') return FALSE;
        throw castErr(a.v, type);
      }
      if (a.t === DBL) return bool(!(a.v === 0 || Number.isNaN(a.v)));
      if (a.t === INT || a.t === DEC) return bool(!a.v.isZero());
      throw castErr(atomicToString(a), type);
    }
    case DATE: {
      if (s !== null) {
        const d = parseDate(s);
        if (!d) throw castErr(a.v, type);
        return { t: DATE, v: d };
      }
      throw castErr(atomicToString(a), type);
    }
    default:
      throw new XPathError('XPST0051', `Nepodporovaný typ ${type}`);
  }
}

export function castable(a, type) {
  try {
    castAs(a, type);
    return true;
  } catch (e) {
    if (e instanceof XPathError) return false;
    throw e;
  }
}

/** number() semantics: never throws, returns xs:double (NaN on failure). */
export function toNumber(a) {
  if (!a) return NaN;
  try {
    return castAs(a, DBL).v;
  } catch {
    return NaN;
  }
}

// ---------- effective boolean value ----------

export function ebv(seq) {
  if (seq.length === 0) return false;
  const f = seq[0];
  if (isNode(f)) return true;
  if (seq.length > 1) throw new XPathError('FORG0006', 'Efektívna logická hodnota sekvencie viacerých atomických hodnôt');
  switch (f.t) {
    case BOOL:
      return f.v;
    case STR:
    case UNT:
      return f.v.length > 0;
    case INT:
    case DEC:
      return !f.v.isZero();
    case DBL:
      return !(f.v === 0 || Number.isNaN(f.v));
    default:
      throw new XPathError('FORG0006', `EBV nie je definovaná pre ${f.t}`);
  }
}

// ---------- numeric promotion & arithmetic ----------

function numericRank(t) {
  return t === INT ? 0 : t === DEC ? 1 : 2;
}

export function toNumericOperand(a) {
  if (a.t === UNT) return castAs(a, DBL);
  if (isNumeric(a)) return a;
  throw new XPathError('XPTY0004', `Aritmetika s hodnotou typu ${a.t}`);
}

export function arithmetic(op, a, b) {
  a = toNumericOperand(a);
  b = toNumericOperand(b);
  const rank = Math.max(numericRank(a.t), numericRank(b.t));
  if (rank === 2) {
    const x = a.t === DBL ? a.v : a.v.toNumber();
    const y = b.t === DBL ? b.v : b.v.toNumber();
    switch (op) {
      case '+':
        return dbl(x + y);
      case '-':
        return dbl(x - y);
      case '*':
        return dbl(x * y);
      case 'div':
        return dbl(x / y);
      case 'mod':
        return dbl(x % y);
      case 'idiv': {
        if (y === 0 || Number.isNaN(x) || Number.isNaN(y) || !Number.isFinite(x)) throw new XPathError('FOAR0002', 'idiv chyba');
        return int(Decimal.fromNumber(Math.trunc(x / y)));
      }
      default:
        break;
    }
  } else {
    const x = a.v;
    const y = b.v;
    const mk = rank === 0 ? int : dec;
    switch (op) {
      case '+':
        return mk(x.add(y));
      case '-':
        return mk(x.sub(y));
      case '*':
        return mk(x.mul(y));
      case 'div': {
        if (y.isZero()) throw new XPathError('FOAR0001', 'Delenie nulou');
        return dec(x.div(y, Math.max(18, x.scale, y.scale)));
      }
      case 'mod':
        if (y.isZero()) throw new XPathError('FOAR0001', 'Delenie nulou');
        return mk(x.mod(y));
      case 'idiv':
        if (y.isZero()) throw new XPathError('FOAR0001', 'Delenie nulou');
        return int(x.idiv(y));
      default:
        break;
    }
  }
  throw new XPathError('XPST0003', `Neznámy operátor ${op}`);
}

export function negate(a) {
  a = toNumericOperand(a);
  if (a.t === DBL) return dbl(-a.v);
  return { t: a.t, v: a.v.neg() };
}

// ---------- comparisons ----------

function cmpNumbers(a, b) {
  const rank = Math.max(numericRank(a.t), numericRank(b.t));
  if (rank === 2) {
    const x = a.t === DBL ? a.v : a.v.toNumber();
    const y = b.t === DBL ? b.v : b.v.toNumber();
    if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a.v.cmp(b.v);
}

function cmpStrings(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Compare two atomics already converted to comparable types. Returns -1/0/1 or NaN. */
function compareTyped(a, b) {
  if (isNumeric(a) && isNumeric(b)) return cmpNumbers(a, b);
  if ((a.t === STR || a.t === UNT) && (b.t === STR || b.t === UNT)) return cmpStrings(a.v, b.v);
  if (a.t === BOOL && b.t === BOOL) return a.v === b.v ? 0 : a.v ? 1 : -1;
  if (a.t === DATE && b.t === DATE) return a.v.key < b.v.key ? -1 : a.v.key > b.v.key ? 1 : 0;
  throw new XPathError('XPTY0004', `Nemožno porovnať ${a.t} s ${b.t}`);
}

function applyOp(op, c) {
  if (Number.isNaN(c)) return op === '!=' || op === 'ne';
  switch (op) {
    case '=':
    case 'eq':
      return c === 0;
    case '!=':
    case 'ne':
      return c !== 0;
    case '<':
    case 'lt':
      return c < 0;
    case '<=':
    case 'le':
      return c <= 0;
    case '>':
    case 'gt':
      return c > 0;
    case '>=':
    case 'ge':
      return c >= 0;
    default:
      throw new XPathError('XPST0003', `Neznámy operátor ${op}`);
  }
}

/** General comparison of two atomics (XPath 2.0 rules for untypedAtomic). */
export function generalCompareAtomic(op, a, b) {
  if (a.t === UNT && b.t === UNT) return applyOp(op, cmpStrings(a.v, b.v));
  if (a.t === UNT) a = convertUntypedFor(a, b);
  else if (b.t === UNT) b = convertUntypedFor(b, a);
  return applyOp(op, compareTyped(a, b));
}

function convertUntypedFor(u, other) {
  if (isNumeric(other)) return castAs(u, DBL);
  if (other.t === STR) return str(u.v);
  return castAs(u, other.t);
}

export function valueCompare(op, a, b) {
  if (a.t === UNT) a = str(a.v);
  if (b.t === UNT) b = str(b.v);
  return applyOp(op, compareTyped(a, b));
}

/** Equality used by distinct-values / index-of. */
export function atomicEquals(a, b) {
  try {
    const x = a.t === UNT ? str(a.v) : a;
    const y = b.t === UNT ? str(b.v) : b;
    return compareTyped(x, y) === 0;
  } catch {
    return false;
  }
}

// ---------- node helpers ----------

export function nodeName(n) {
  if (n.kind === ELEMENT || n.kind === ATTRIBUTE) return n.name;
  if (n.kind === PI) return n.target;
  return '';
}

export function nodeLocalName(n) {
  if (n.kind === ELEMENT || n.kind === ATTRIBUTE) return n.local;
  if (n.kind === PI) return n.target;
  return '';
}

export { ELEMENT, ATTRIBUTE, TEXT, DOCUMENT, COMMENT, PI };
