// Slovak / EU identifier checks (IBAN, BIC, IČO, DIČ, IČ DPH, Peppol ID).
// Algorithms cross-checked against python-stdnum (sk.dph, cz.dic).

const clean = (s) => String(s || '').replace(/[\s-]/g, '').toUpperCase();

const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22,
  VG: 24, XK: 20,
};

/** IBAN validity (ISO 13616 mod-97 + country length). */
export function isValidIban(iban) {
  const s = clean(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const len = IBAN_LENGTHS[s.slice(0, 2)];
  if (len && s.length !== len) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const v = ch >= 'A' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    rem = v > 9 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
  }
  return rem === 1;
}

export function formatIban(iban) {
  return clean(iban).replace(/(.{4})/g, '$1 ').trim();
}

export function isValidBic(bic) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean(bic));
}

/** Slovak/Czech IČO (8 digits, mod-11 check digit). */
export function isValidIco(ico) {
  const s = clean(ico);
  if (!/^\d{6,8}$/.test(s)) return false;
  const n = s.padStart(8, '0');
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (8 - i) * Number(n[i]);
  const check = (11 - (sum % 11)) % 11;
  return String((check || 1) % 10) === n[7];
}

/** Slovak IČ DPH (SK + 10 digits, divisible by 11). Accepts with or without SK prefix. */
export function isValidSkVat(vat) {
  let s = clean(vat);
  if (s.startsWith('SK')) s = s.slice(2);
  if (!/^\d{10}$/.test(s)) return false;
  if (s[0] === '0' || !'234789'.includes(s[2])) return false;
  return BigInt(s) % 11n === 0n;
}

/** Slovak DIČ (10 digits). Returns 'ok' | 'format' | 'checksum'. */
export function checkSkDic(dic) {
  const s = clean(dic);
  if (!/^\d{10}$/.test(s)) return 'format';
  return BigInt(s) % 11n === 0n ? 'ok' : 'checksum';
}

/** Peppol participant id for a Slovak DIČ: 0245:<DIČ> */
export function skPeppolId(dic) {
  return `0245:${clean(dic).replace(/^SK/, '')}`;
}

/** Remove diacritics (for payment QR fields that banks may not render). */
export function deburr(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[Łł]/g, (c) => (c === 'Ł' ? 'L' : 'l'))
    .replace(/[Đđ]/g, (c) => (c === 'Đ' ? 'D' : 'd'))
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ');
}
