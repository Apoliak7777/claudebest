// QR Code Model 2 encoder (ISO/IEC 18004), versions 1–40, ECC L/M/Q/H,
// numeric / alphanumeric / byte (UTF-8) modes. Zero dependencies.
// Output: boolean matrix + SVG renderer.

const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT_BITS = [1, 0, 3, 2];

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function numRawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
}

// ---- Reed–Solomon over GF(2^8), primitive polynomial 0x11D ----
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return result;
}

// ---- segments ----
function utf8(s) {
  return Array.from(new TextEncoder().encode(s));
}

function makeSegment(text) {
  if (/^\d*$/.test(text)) {
    const bits = [];
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      pushBits(bits, Number(chunk), chunk.length * 3 + 1);
    }
    return { mode: 0x1, ccBits: [10, 12, 14], count: text.length, bits };
  }
  if ([...text].every((c) => ALNUM.includes(c))) {
    const bits = [];
    for (let i = 0; i + 1 < text.length; i += 2) pushBits(bits, ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
    if (text.length % 2) pushBits(bits, ALNUM.indexOf(text[text.length - 1]), 6);
    return { mode: 0x2, ccBits: [9, 11, 13], count: text.length, bits };
  }
  const bytes = utf8(text);
  const bits = [];
  for (const b of bytes) pushBits(bits, b, 8);
  return { mode: 0x4, ccBits: [8, 16, 16], count: bytes.length, bits };
}

function pushBits(arr, val, len) {
  for (let i = len - 1; i >= 0; i--) arr.push((val >>> i) & 1);
}

const ccIndex = (ver) => (ver <= 9 ? 0 : ver <= 26 ? 1 : 2);

/**
 * Encode text into a QR matrix.
 * @param {string} text
 * @param {{ecc?: 'L'|'M'|'Q'|'H', minVersion?: number, maxVersion?: number, mask?: number, boostEcc?: boolean}} [opts]
 * @returns {{version: number, ecc: string, mask: number, size: number, modules: boolean[][]}}
 */
export function encodeQr(text, opts = {}) {
  let ecl = ECL[opts.ecc || 'M'];
  const seg = makeSegment(String(text));
  let version;
  let usedBits;
  for (version = opts.minVersion || 1; version <= (opts.maxVersion || 40); version++) {
    const cc = seg.ccBits[ccIndex(version)];
    if (seg.count >= 1 << cc) continue;
    usedBits = 4 + cc + seg.bits.length;
    if (usedBits <= numDataCodewords(version, ecl) * 8) break;
  }
  if (version > (opts.maxVersion || 40)) throw new RangeError('Dáta sú príliš dlhé pre QR kód');
  if (opts.boostEcc !== false) {
    for (const e of [1, 2, 3]) if (e > ecl && usedBits <= numDataCodewords(version, e) * 8) ecl = e;
  }
  const bits = [];
  pushBits(bits, seg.mode, 4);
  pushBits(bits, seg.count, seg.ccBits[ccIndex(version)]);
  for (const b of seg.bits) bits.push(b);
  const capacity = numDataCodewords(version, ecl) * 8;
  pushBits(bits, 0, Math.min(4, capacity - bits.length));
  pushBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) pushBits(bits, pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  const codewords = addEccAndInterleave(data, version, ecl);
  return buildMatrix(codewords, version, ecl, opts.mask);
}

function addEccAndInterleave(data, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
  return result;
}

function buildMatrix(codewords, ver, ecl, forcedMask) {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };
  // timing
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  // finders
  const finder = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // alignment
  const al = alignmentPositions(ver, size);
  const last = al.length - 1;
  al.forEach((ax, i) => {
    al.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });
  const drawFormat = (mask) => {
    const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // reserve
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      setFn(a, c, b);
      setFn(c, a, b);
    }
  }
  // data
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFn[y][x]) continue;
        let inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (inv) modules[y][x] = !modules[y][x];
      }
    }
  };
  let mask = forcedMask;
  if (mask === undefined) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      const p = penalty(modules, size);
      if (p < best) {
        best = p;
        mask = m;
      }
      applyMask(m); // undo (XOR)
    }
  }
  applyMask(mask);
  drawFormat(mask);
  return { version: ver, ecc: 'LMQH'[ecl], mask, size, modules };
}

function penalty(m, size) {
  let result = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    // N1: runs
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) result += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: finder-like patterns 1:1:3:1:1 with 4 light modules on one side
    for (let i = 0; i + 11 <= size; i++) {
      const s = line.slice(i, i + 11).map((b) => (b ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') result += 40;
    }
  }
  // N2: 2x2 blocks
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
    }
  }
  // N4: dark ratio
  let dark = 0;
  for (const row of m) for (const b of row) if (b) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * 10;
}

/**
 * Render a QR matrix as an SVG string.
 * @param {{size:number, modules:boolean[][]}} qr
 * @param {{margin?: number, dark?: string, light?: string, title?: string}} [opts]
 */
export function qrToSvg(qr, { margin = 4, dark = '#000', light = '#fff', title } = {}) {
  const dim = qr.size + margin * 2;
  let path = '';
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < qr.size && qr.modules[y][x + w]) w++;
      path += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w;
    }
  }
  const t = title ? `<title>${String(title).replace(/[<&]/g, '')}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img">${t}<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

/** Convenience: text -> SVG */
export function qrSvg(text, opts = {}) {
  return qrToSvg(encodeQr(text, opts), opts);
}
