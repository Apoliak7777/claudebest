// PAY by square (Slovak Banking Association payment QR standard) encoder.
// Payload layout mirrors the reference implementation github.com/xseman/bysquare
// (Apache-2.0) and is verified against its decoder in the test suite.
import { lzmaCompressRaw } from './lzma.js';
import { deburr } from '../sk/ident.js';

const BASE32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

let CRC_TABLE;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function base32hex(bytes) {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = ((buffer << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32HEX[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32HEX[(buffer << (5 - bits)) & 31];
  return out;
}

const tabsafe = (v) => (v === undefined || v === null ? '' : String(v).replace(/\t/g, ' '));
const decimal = (n) => (n === undefined || n === null || n === '' ? '' : String(Number(Number(n).toFixed(8))));

export const VERSION = { '1.0.0': 0, '1.1.0': 1, '1.2.0': 2 };

/**
 * Encode a single payment order as a PAY by square string (put it into a QR code).
 * @param {object} p
 * @param {number|string} p.amount
 * @param {string} [p.currency='EUR']
 * @param {string} p.iban
 * @param {string} [p.bic]
 * @param {string} [p.variableSymbol] max 10 digits
 * @param {string} [p.constantSymbol] max 4 digits
 * @param {string} [p.specificSymbol] max 10 digits
 * @param {string} [p.reference] originator's reference (e.g. SEPA end-to-end id)
 * @param {string} [p.note] payment note (max 140)
 * @param {string} [p.dueDate] YYYY-MM-DD
 * @param {string} p.beneficiaryName required since v1.2
 * @param {string} [p.beneficiaryStreet]
 * @param {string} [p.beneficiaryCity]
 * @param {string} [p.invoiceId]
 * @param {{version?: string, deburr?: boolean}} [opts]
 */
export function payBySquare(p, opts = {}) {
  const version = VERSION[opts.version || '1.2.0'];
  const strip = opts.deburr !== false ? deburr : (s) => s;
  if (!p.iban) throw new Error('PAY by square: chýba IBAN');
  const due = p.dueDate ? String(p.dueDate).replace(/-/g, '') : '';
  const fields = [
    tabsafe(p.invoiceId),
    '1', // payments count
    '1', // payment type: payment order
    decimal(p.amount),
    tabsafe(p.currency || 'EUR'),
    tabsafe(due),
    tabsafe(p.variableSymbol),
    tabsafe(p.constantSymbol),
    tabsafe(p.specificSymbol),
    tabsafe(p.reference),
    tabsafe(strip(p.note || '')),
    '1', // bank accounts count
    tabsafe(String(p.iban).replace(/\s+/g, '').toUpperCase()),
    tabsafe(p.bic),
    '0', // standing order extension
    '0', // direct debit extension
    tabsafe(strip(p.beneficiaryName || '')),
    tabsafe(strip(p.beneficiaryStreet || '')),
    tabsafe(strip(p.beneficiaryCity || '')),
  ];
  const payload = new TextEncoder().encode(fields.join('\t'));
  const crc = crc32(payload);
  const withCrc = new Uint8Array(4 + payload.length);
  new DataView(withCrc.buffer).setUint32(0, crc, true);
  withCrc.set(payload, 4);
  if (withCrc.length >= 131072) throw new Error('PAY by square: príliš veľa dát');
  const body = lzmaCompressRaw(withCrc);
  const out = new Uint8Array(4 + body.length);
  out[0] = (0 << 4) | version; // bysquare type 0 (PAY), version
  out[1] = 0; // document type 0, reserved 0
  out[2] = withCrc.length & 0xff;
  out[3] = (withCrc.length >>> 8) & 0xff;
  out.set(body, 4);
  return base32hex(out);
}

/**
 * EPC QR ("GiroCode", SEPA credit transfer) payload, version 002.
 * @param {{name: string, iban: string, bic?: string, amount?: number|string, currency?: string, purpose?: string, reference?: string, text?: string, info?: string}} p
 */
export function epcQr(p) {
  const amount = p.amount !== undefined && p.amount !== '' ? `${p.currency || 'EUR'}${Number(p.amount).toFixed(2)}` : '';
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    p.bic || '',
    String(p.name || '').slice(0, 70),
    String(p.iban).replace(/\s+/g, '').toUpperCase(),
    amount,
    p.purpose || '',
    p.reference ? String(p.reference).slice(0, 35) : '',
    p.reference ? '' : String(p.text || '').slice(0, 140),
    String(p.info || '').slice(0, 70),
  ];
  while (lines.length > 8 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}
