// Arbitrary-precision decimal arithmetic on BigInt (value = int / 10^scale).
// Used for money math (never floats) and for xs:decimal in the XPath engine.

const DEC_RE = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/;

export class Decimal {
  /** @param {bigint} int @param {number} scale */
  constructor(int, scale) {
    this.int = int;
    this.scale = scale;
  }

  static parse(s) {
    const d = Decimal.tryParse(s);
    if (!d) throw new RangeError(`Neplatné číslo "${s}"`);
    return d;
  }

  /** Returns null for anything that is not a plain decimal literal. */
  static tryParse(s) {
    if (s instanceof Decimal) return s;
    if (typeof s === 'bigint') return new Decimal(s, 0);
    if (typeof s === 'number') return Decimal.fromNumber(s);
    if (typeof s !== 'string') return null;
    const m = DEC_RE.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
    const frac = m[3] || '';
    let int = BigInt((m[2] || '0') + frac);
    if (m[1] === '-') int = -int;
    return new Decimal(int, frac.length).normalize();
  }

  static fromNumber(n) {
    if (!Number.isFinite(n)) throw new RangeError(`Nekonečné číslo ${n}`);
    // Shortest round-trip representation, expanded out of exponent form.
    let s = String(n);
    if (/e/i.test(s)) s = expandExponent(s);
    return Decimal.parse(s);
  }

  /** Exact binary expansion of a double (like Java's new BigDecimal(double)). */
  static fromDoubleExact(n) {
    if (!Number.isFinite(n)) throw new RangeError(`Nekonečné číslo ${n}`);
    if (n === 0) return new Decimal(0n, 0);
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, n);
    const hi = view.getUint32(0);
    const lo = view.getUint32(4);
    const sign = hi >>> 31 ? -1n : 1n;
    const expBits = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let exp;
    if (expBits === 0) exp = -1074;
    else {
      mant |= 1n << 52n;
      exp = expBits - 1075;
    }
    if (exp >= 0) return new Decimal(sign * (mant << BigInt(exp)), 0);
    const k = -exp;
    return new Decimal(sign * mant * 5n ** BigInt(k), k).normalize();
  }

  static of(x) {
    return x instanceof Decimal ? x : Decimal.parse(String(x));
  }

  normalize() {
    let { int, scale } = this;
    while (scale > 0 && int % 10n === 0n) {
      int /= 10n;
      scale--;
    }
    return scale === this.scale ? this : new Decimal(int, scale);
  }

  _align(other) {
    const o = Decimal.of(other);
    if (this.scale === o.scale) return [this.int, o.int, this.scale];
    if (this.scale > o.scale) return [this.int, o.int * 10n ** BigInt(this.scale - o.scale), this.scale];
    return [this.int * 10n ** BigInt(o.scale - this.scale), o.int, o.scale];
  }

  add(o) {
    const [a, b, s] = this._align(o);
    return new Decimal(a + b, s).normalize();
  }

  sub(o) {
    const [a, b, s] = this._align(o);
    return new Decimal(a - b, s).normalize();
  }

  mul(o) {
    o = Decimal.of(o);
    return new Decimal(this.int * o.int, this.scale + o.scale).normalize();
  }

  /** Division with `digits` fractional digits, rounded half-up (away from zero). */
  div(o, digits = 18) {
    o = Decimal.of(o);
    if (o.int === 0n) throw new RangeError('Delenie nulou');
    // (a/10^sa) / (b/10^sb) = a*10^(sb-sa) / b ; compute with extra digit
    const shift = digits + 1 + o.scale - this.scale;
    let num = this.int;
    let den = o.int;
    if (shift >= 0) num *= 10n ** BigInt(shift);
    else den *= 10n ** BigInt(-shift);
    const q = num / den; // truncated, scale digits+1
    return new Decimal(roundInt(q, 1, 'half-away'), digits).normalize();
  }

  /** XPath-style integer division helper (truncating). */
  idiv(o) {
    const [a, b] = this._align(o);
    if (b === 0n) throw new RangeError('Delenie nulou');
    return new Decimal(a / b, 0);
  }

  mod(o) {
    const [a, b, s] = this._align(o);
    if (b === 0n) throw new RangeError('Delenie nulou');
    return new Decimal(a % b, s).normalize();
  }

  neg() {
    return new Decimal(-this.int, this.scale);
  }

  abs() {
    return this.int < 0n ? this.neg() : this;
  }

  sign() {
    return this.int > 0n ? 1 : this.int < 0n ? -1 : 0;
  }

  isZero() {
    return this.int === 0n;
  }

  cmp(o) {
    const [a, b] = this._align(o);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  eq(o) {
    return this.cmp(o) === 0;
  }

  /**
   * Round to `digits` fractional digits.
   * mode: 'half-up' (XPath fn:round: .5 toward +Infinity), 'half-away' (commercial),
   * 'half-even', 'floor', 'ceiling', 'trunc'.
   */
  round(digits = 0, mode = 'half-away') {
    if (this.scale <= digits) return this;
    const drop = this.scale - digits;
    return new Decimal(roundInt(this.int, drop, mode), digits).normalize();
  }

  floor() {
    return this.round(0, 'floor');
  }

  ceiling() {
    return this.round(0, 'ceiling');
  }

  /** Number of fractional digits as written (after normalisation). */
  fractionDigits() {
    return this.normalize().scale;
  }

  toNumber() {
    return Number(this.toString());
  }

  /** Plain string; pads to `minScale` fractional digits when given. */
  toString(minScale = 0) {
    let { int, scale } = this;
    if (scale < minScale) {
      int *= 10n ** BigInt(minScale - scale);
      scale = minScale;
    }
    const neg = int < 0n;
    let digits = (neg ? -int : int).toString();
    if (scale > 0) {
      digits = digits.padStart(scale + 1, '0');
      digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    }
    return (neg ? '-' : '') + digits;
  }

  /** Fixed number of fractional digits (rounds half-away). */
  toFixed(n) {
    return this.round(n).toString(n);
  }
}

function roundInt(int, drop, mode) {
  const p = 10n ** BigInt(drop);
  const q = int / p; // truncated toward zero
  const r = int - q * p; // remainder carries the sign of int
  if (r === 0n) return q;
  const neg = r < 0n;
  const twice = (neg ? -r : r) * 2n;
  const away = neg ? q - 1n : q + 1n;
  switch (mode) {
    case 'trunc':
      return q;
    case 'floor':
      return neg ? q - 1n : q;
    case 'ceiling':
      return neg ? q : q + 1n;
    case 'half-up': // ties toward +Infinity (XPath fn:round)
      if (twice > p) return away;
      if (twice === p) return neg ? q : q + 1n;
      return q;
    case 'half-even':
      return twice > p || (twice === p && q % 2n !== 0n) ? away : q;
    default: // half-away from zero (commercial rounding)
      return twice >= p ? away : q;
  }
}

function expandExponent(s) {
  const m = /^([+-]?)(\d+)(?:\.(\d*))?e([+-]?\d+)$/i.exec(s);
  if (!m) return s;
  const [, sign, ip, fp = '', ex] = m;
  let digits = ip + fp;
  let point = ip.length + Number(ex);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

export const D = (x) => Decimal.of(x);
export const ZERO = new Decimal(0n, 0);

/** Sum a list of decimals / decimal strings. */
export function dsum(list) {
  let acc = ZERO;
  for (const x of list) if (x !== undefined && x !== null && x !== '') acc = acc.add(Decimal.of(x));
  return acc;
}
