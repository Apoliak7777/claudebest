// XPath 2.0 function library (the subset used by EN16931/Peppol rules and a bit more).
import {
  XPathError, isNode, atomize, atomizeItem, ebv, castAs, toNumber, atomicToString, itemToString, atomicEquals,
  str, dbl, int, dec, bool, TRUE, FALSE, STR, UNT, INT, DEC, DBL, DATE, isNumeric, arithmetic, nodeName, nodeLocalName,
  ELEMENT, ATTRIBUTE, DOCUMENT,
} from './types.js';
import { Decimal } from '../model/decimal.js';
import { stringValue } from '../xml/parser.js';

const cps = (s) => Array.from(s);

function optString(seq, fname) {
  if (seq.length === 0) return '';
  if (seq.length > 1) throw new XPathError('XPTY0004', `${fname}(): očakávaný jeden reťazec, nájdených ${seq.length}`);
  return itemToString(seq[0]);
}

function oneAtomic(seq, fname) {
  const a = atomize(seq);
  if (a.length > 1) throw new XPathError('XPTY0004', `${fname}(): očakávaná jedna hodnota, nájdených ${a.length}`);
  return a[0];
}

function contextString(ctx) {
  const it = ctx.item;
  if (it === undefined || it === null) throw new XPathError('XPDY0002', 'Chýba kontextová položka');
  return itemToString(it);
}

function numericArg(seq, fname) {
  const a = oneAtomic(seq, fname);
  if (a === undefined) return undefined;
  if (a.t === UNT) return castAs(a, DBL);
  if (!isNumeric(a)) throw new XPathError('XPTY0004', `${fname}(): očakávané číslo`);
  return a;
}

// ---- XSD regular expressions -> JS ----
const regexCache = new Map();
function toRegex(pattern, flags = '', global = false) {
  const key = `${pattern}\u0000${flags}\u0000${global}`;
  let re = regexCache.get(key);
  if (re) return re;
  let p = pattern;
  if (flags.includes('x')) p = p.replace(/[\s]/g, '');
  // XSD multi-char escapes not in JS
  p = p
    .replace(/\\i/g, '[A-Za-z_:\\u00C0-\\uFFFF]')
    .replace(/\\I/g, '[^A-Za-z_:\\u00C0-\\uFFFF]')
    .replace(/\\c/g, '[A-Za-z0-9._:\\-\\u00B7\\u00C0-\\uFFFF]')
    .replace(/\\C/g, '[^A-Za-z0-9._:\\-\\u00B7\\u00C0-\\uFFFF]');
  let jsFlags = 'u';
  if (flags.includes('i')) jsFlags += 'i';
  if (flags.includes('s')) jsFlags += 's';
  if (flags.includes('m')) jsFlags += 'm';
  if (global) jsFlags += 'g';
  try {
    re = new RegExp(p, jsFlags);
  } catch (e) {
    throw new XPathError('FORX0002', `Neplatný regulárny výraz "${pattern}": ${e.message}`);
  }
  regexCache.set(key, re);
  return re;
}

function sumAtomics(list, zero) {
  if (list.length === 0) return zero;
  let acc = list[0].t === UNT ? castAs(list[0], DBL) : list[0];
  if (!isNumeric(acc)) throw new XPathError('FORG0006', 'sum(): nenumerická hodnota');
  for (let i = 1; i < list.length; i++) acc = arithmetic('+', acc, list[i]);
  return [acc];
}

function roundNumeric(a, mode) {
  if (a.t === DBL) {
    const v = a.v;
    if (!Number.isFinite(v)) return a;
    switch (mode) {
      case 'round':
        return dbl(Math.floor(v + 0.5));
      case 'floor':
        return dbl(Math.floor(v));
      case 'ceiling':
        return dbl(Math.ceil(v));
      case 'half-even': {
        const f = Math.floor(v);
        const diff = v - f;
        if (diff > 0.5) return dbl(f + 1);
        if (diff < 0.5) return dbl(f);
        return dbl(f % 2 === 0 ? f : f + 1);
      }
      default:
        return a;
    }
  }
  const m = { round: 'half-up', floor: 'floor', ceiling: 'ceiling', 'half-even': 'half-even' }[mode];
  return { t: a.t, v: a.v.round(0, m) };
}

const F = Object.create(null);
const def = (names, fn, raw = false) => {
  for (const n of [].concat(names)) {
    F[n] = { fn, raw };
    if (!n.includes(':')) F[`fn:${n}`] = { fn, raw };
  }
};

// ---- accessors / context ----
def('position', (a, ctx) => [int(ctx.pos)]);
def('last', (a, ctx) => [int(ctx.size)]);
def('true', () => [TRUE]);
def('false', () => [FALSE]);
def('not', ([s]) => [bool(!ebv(s))]);
def('boolean', ([s]) => [bool(ebv(s))]);
def('exists', ([s]) => [bool(s.length > 0)]);
def('empty', ([s]) => [bool(s.length === 0)]);
def('count', ([s]) => [int(s.length)]);
def('data', ([s]) => atomize(s));
def('root', (args, ctx) => {
  let n = args.length ? args[0][0] : ctx.item;
  if (!n) return [];
  while (n.parent) n = n.parent;
  return [n];
});
def('name', (args, ctx) => {
  const n = args.length ? args[0][0] : ctx.item;
  return [str(n && isNode(n) ? nodeName(n) : '')];
});
def('local-name', (args, ctx) => {
  const n = args.length ? args[0][0] : ctx.item;
  return [str(n && isNode(n) ? nodeLocalName(n) : '')];
});
def('namespace-uri', (args, ctx) => {
  const n = args.length ? args[0][0] : ctx.item;
  return [str(n && isNode(n) && (n.kind === ELEMENT || n.kind === ATTRIBUTE) ? n.ns : '')];
});

// ---- strings ----
def('string', (args, ctx) => [str(args.length ? optString(args[0], 'string') : contextString(ctx))]);
def('normalize-space', (args, ctx) => {
  const s = args.length ? optString(args[0], 'normalize-space') : contextString(ctx);
  return [str(s.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, ''))];
});
def('string-length', (args, ctx) => {
  const s = args.length ? optString(args[0], 'string-length') : contextString(ctx);
  return [int(cps(s).length)];
});
def('upper-case', ([s]) => [str(optString(s, 'upper-case').toUpperCase())]);
def('lower-case', ([s]) => [str(optString(s, 'lower-case').toLowerCase())]);
def('contains', ([a, b]) => [bool(optString(a, 'contains').includes(optString(b, 'contains')))]);
def('starts-with', ([a, b]) => [bool(optString(a, 'starts-with').startsWith(optString(b, 'starts-with')))]);
def('ends-with', ([a, b]) => [bool(optString(a, 'ends-with').endsWith(optString(b, 'ends-with')))]);
def('substring-before', ([a, b]) => {
  const s = optString(a, 'substring-before');
  const t = optString(b, 'substring-before');
  const i = s.indexOf(t);
  return [str(i < 0 ? '' : s.slice(0, i))];
});
def('substring-after', ([a, b]) => {
  const s = optString(a, 'substring-after');
  const t = optString(b, 'substring-after');
  const i = s.indexOf(t);
  return [str(i < 0 ? '' : s.slice(i + t.length))];
});
def('substring', ([a, b, c]) => {
  const chars = cps(optString(a, 'substring'));
  const startA = numericArg(b, 'substring');
  const start = roundNumeric(startA.t === DBL ? startA : castAs(startA, DBL), 'round').v;
  let end = Infinity;
  if (c) {
    const lenA = numericArg(c, 'substring');
    const len = roundNumeric(lenA.t === DBL ? lenA : castAs(lenA, DBL), 'round').v;
    end = start + len;
  }
  if (Number.isNaN(start) || Number.isNaN(end)) return [str('')];
  let out = '';
  for (let p = 1; p <= chars.length; p++) if (p >= start && p < end) out += chars[p - 1];
  return [str(out)];
});
def('concat', (args) => [str(args.map((s) => optString(s, 'concat')).join(''))]);
def('string-join', ([seq, sep]) => [str(atomize(seq).map(atomicToString).join(sep ? optString(sep, 'string-join') : ''))]);
def('translate', ([a, b, c]) => {
  const s = cps(optString(a, 'translate'));
  const from = cps(optString(b, 'translate'));
  const to = cps(optString(c, 'translate'));
  let out = '';
  for (const ch of s) {
    const i = from.indexOf(ch);
    if (i < 0) out += ch;
    else if (i < to.length) out += to[i];
  }
  return [str(out)];
});
def('string-to-codepoints', ([a]) => {
  const s = optString(a, 'string-to-codepoints');
  return cps(s).map((ch) => int(new Decimal(BigInt(ch.codePointAt(0)), 0)));
});
def('codepoints-to-string', ([seq]) => [str(atomize(seq).map((x) => String.fromCodePoint(Number(atomicToString(x)))).join(''))]);
def('matches', ([a, p, f]) => [bool(toRegex(optString(p, 'matches'), f ? optString(f, 'matches') : '').test(optString(a, 'matches')))]);
def('replace', ([a, p, r, f]) => {
  const re = toRegex(optString(p, 'replace'), f ? optString(f, 'replace') : '', true);
  // XPath uses $N and \$ ; JS uses $N and $$
  const repl = optString(r, 'replace').replace(/\\\$/g, '$$$$').replace(/\\\\/g, '\\');
  return [str(optString(a, 'replace').replace(re, repl))];
});
def('tokenize', ([a, p, f]) => {
  const s = optString(a, 'tokenize');
  if (s === '') return [];
  const re = toRegex(optString(p, 'tokenize'), f ? optString(f, 'tokenize') : '', true);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m[0] === '') throw new XPathError('FORX0003', 'tokenize(): regulárny výraz zodpovedá prázdnemu reťazcu');
    out.push(str(s.slice(last, m.index)));
    last = m.index + m[0].length;
  }
  out.push(str(s.slice(last)));
  return out;
});

// ---- numbers ----
def('number', (args, ctx) => {
  const a = args.length ? atomize(args[0])[0] : atomizeItem(ctx.item);
  return [dbl(toNumber(a))];
});
def('abs', ([s]) => {
  const a = numericArg(s, 'abs');
  if (a === undefined) return [];
  return [a.t === DBL ? dbl(Math.abs(a.v)) : { t: a.t, v: a.v.abs() }];
});
def('round', ([s]) => {
  const a = numericArg(s, 'round');
  return a === undefined ? [] : [roundNumeric(a, 'round')];
});
def('floor', ([s]) => {
  const a = numericArg(s, 'floor');
  return a === undefined ? [] : [roundNumeric(a, 'floor')];
});
def('ceiling', ([s]) => {
  const a = numericArg(s, 'ceiling');
  return a === undefined ? [] : [roundNumeric(a, 'ceiling')];
});
def('round-half-to-even', ([s, p]) => {
  const a = numericArg(s, 'round-half-to-even');
  if (a === undefined) return [];
  const prec = p ? Number(atomicToString(oneAtomic(p))) : 0;
  if (a.t === DBL) {
    const d = Decimal.fromNumber(a.v).round(prec, 'half-even');
    return [dbl(d.toNumber())];
  }
  return [{ t: a.t, v: a.v.round(prec, 'half-even') }];
});
def('sum', ([s, z]) => sumAtomics(atomize(s), z ? z : [int(0)]));
def('avg', ([s]) => {
  const a = atomize(s);
  if (!a.length) return [];
  const total = sumAtomics(a, [])[0];
  return [arithmetic('div', total, int(a.length))];
});
function minmax(seq, sign) {
  const a = atomize(seq).map((x) => (x.t === UNT ? castAs(x, DBL) : x));
  if (!a.length) return [];
  let best = a[0];
  for (const x of a.slice(1)) {
    const cmp = isNumeric(x) && isNumeric(best) ? arithmetic('-', x, best) : null;
    const v = cmp ? (cmp.t === DBL ? cmp.v : cmp.v.sign()) : atomicToString(x) < atomicToString(best) ? -1 : 1;
    if (v * sign > 0) best = x;
  }
  return [best];
}
def('min', ([s]) => minmax(s, -1));
def('max', ([s]) => minmax(s, 1));

// ---- sequences ----
def('reverse', ([s]) => s.slice().reverse());
def('distinct-values', ([s]) => {
  const out = [];
  for (const a of atomize(s)) if (!out.some((b) => atomicEquals(a, b))) out.push(a.t === UNT ? str(a.v) : a);
  return out;
});
def('index-of', ([s, v]) => {
  const target = oneAtomic(v, 'index-of');
  const out = [];
  atomize(s).forEach((a, i) => {
    if (atomicEquals(a, target)) out.push(int(i + 1));
  });
  return out;
});
def('subsequence', ([s, st, len]) => {
  const start = Math.round(toNumber(oneAtomic(st)));
  const l = len ? Math.round(toNumber(oneAtomic(len))) : Infinity;
  return s.filter((_, i) => i + 1 >= start && i + 1 < start + l);
});
def('insert-before', ([s, pos, ins]) => {
  const p = Math.max(1, Math.round(toNumber(oneAtomic(pos))));
  return [...s.slice(0, p - 1), ...ins, ...s.slice(p - 1)];
});
def('remove', ([s, pos]) => {
  const p = Math.round(toNumber(oneAtomic(pos)));
  return s.filter((_, i) => i + 1 !== p);
});
def('exactly-one', ([s]) => {
  if (s.length !== 1) throw new XPathError('FORG0005', 'exactly-one()');
  return s;
});
def('zero-or-one', ([s]) => {
  if (s.length > 1) throw new XPathError('FORG0003', 'zero-or-one()');
  return s;
});
def('one-or-more', ([s]) => {
  if (!s.length) throw new XPathError('FORG0004', 'one-or-more()');
  return s;
});

// ---- dates ----
def('current-date', () => {
  const d = new Date();
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [castAs(str(s), DATE)];
});

// ---- constructor functions ----
for (const t of ['xs:string', 'xs:decimal', 'xs:integer', 'xs:double', 'xs:boolean', 'xs:date', 'xs:untypedAtomic']) {
  def(t, ([s]) => {
    const a = oneAtomic(s, t);
    return a === undefined ? [] : [castAs(a, t)];
  });
}

// error()
def('error', (args) => {
  throw new XPathError('FOER0000', args.length > 1 ? optString(args[1], 'error') : 'error()');
});

export const FUNCTIONS = F;
export { toRegex };
