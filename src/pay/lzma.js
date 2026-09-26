// Minimal raw LZMA1 encoder (lc=3, lp=0, pb=2) as required by PAY by square.
// It emits literals only (no match search) — a fully valid LZMA stream that any
// decoder reads; compression comes from the adaptive order-1 literal model.
// The 13-byte .lzma header is NOT emitted (PAY by square omits it).

const TOP = 2 ** 24;
const BIT_MODEL_TOTAL = 1 << 11;
const MOVE_BITS = 5;

class RangeEncoder {
  constructor() {
    this.low = 0; // may exceed 2^32 transiently (carry)
    this.range = 0xffffffff;
    this.cache = 0;
    this.cacheSize = 1;
    this.out = [];
  }

  shiftLow() {
    if (this.low < 0xff000000 || this.low >= 2 ** 32) {
      const carry = this.low >= 2 ** 32 ? 1 : 0;
      let temp = this.cache;
      do {
        this.out.push((temp + carry) & 0xff);
        temp = 0xff;
      } while (--this.cacheSize !== 0);
      this.cache = Math.floor(this.low / TOP) & 0xff;
    }
    this.cacheSize++;
    this.low = (this.low % TOP) * 256;
  }

  encodeBit(probs, i, bit) {
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    if (bit === 0) {
      this.range = bound;
      probs[i] = p + ((BIT_MODEL_TOTAL - p) >>> MOVE_BITS);
    } else {
      this.low += bound;
      this.range = (this.range - bound) >>> 0;
      probs[i] = p - (p >>> MOVE_BITS);
    }
    while (this.range < TOP) {
      this.range = (this.range * 256) >>> 0;
      this.shiftLow();
    }
  }

  flush() {
    for (let i = 0; i < 5; i++) this.shiftLow();
    return Uint8Array.from(this.out);
  }
}

/**
 * Compress bytes into a raw LZMA body (without header, without end marker).
 * @param {Uint8Array} data
 */
export function lzmaCompressRaw(data) {
  const lc = 3;
  const pb = 2;
  const rc = new RangeEncoder();
  const isMatch = new Uint16Array(12 << 4).fill(BIT_MODEL_TOTAL >>> 1);
  const literal = new Uint16Array(0x300 << lc).fill(BIT_MODEL_TOTAL >>> 1);
  const state = 0; // literal-only stream stays in state 0
  let prev = 0;
  for (let pos = 0; pos < data.length; pos++) {
    const posState = pos & ((1 << pb) - 1);
    rc.encodeBit(isMatch, (state << 4) + posState, 0);
    const base = 0x300 * (prev >>> (8 - lc));
    const b = data[pos];
    let sym = 1;
    for (let i = 7; i >= 0; i--) {
      const bit = (b >>> i) & 1;
      rc.encodeBit(literal, base + sym, bit);
      sym = (sym << 1) | bit;
    }
    prev = b;
  }
  return rc.flush();
}
