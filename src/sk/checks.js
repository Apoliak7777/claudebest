// Revízor's own Slovak practice checks (not part of the official rule sets).
// They catch mistakes that pass EN 16931 but hurt in Slovakia: wrong IČ DPH,
// broken IBAN, obsolete VAT rate, Peppol ID not in the 0245:DIČ form, …
import { readInvoice } from '../model/read.js';
import { isValidIban, isValidIco, isValidSkVat, checkSkDic } from './ident.js';

export const SK_VAT_RATES = ['23', '19', '5'];

const num = (v) => (v === undefined ? NaN : Number(v));

/**
 * @param {object} doc parsed XML document
 * @returns {Array<{id, flag, message, messageSk, location, source}>}
 */
export function skChecks(doc, { today = new Date() } = {}) {
  let m;
  try {
    m = readInvoice(doc);
  } catch {
    return [];
  }
  const out = [];
  const add = (id, flag, messageSk, location = null) => out.push({ id, flag, message: messageSk, messageSk, location, source: 'Revízor SK' });

  for (const [role, p, label] of [
    ['seller', m.seller, 'predávajúceho'],
    ['buyer', m.buyer, 'kupujúceho'],
  ]) {
    if (!p) continue;
    const isSk = p.address?.country === 'SK' || /^SK/i.test(p.vatId || '');
    if (p.vatId && /^SK/i.test(p.vatId) && !isValidSkVat(p.vatId)) {
      add('RV-SK-01', 'warning', `IČ DPH ${label} „${p.vatId}“ nie je platné slovenské IČ DPH (SK + 10 číslic deliteľných 11).`, role);
    }
    if (p.endpoint?.scheme === '0245') {
      const r = checkSkDic(p.endpoint.id);
      if (r === 'format') add('RV-SK-02', 'warning', `Peppol ID ${label} v schéme 0245 musí byť 10-miestne DIČ bez predpony SK (je „${p.endpoint.id}“).`, role);
      else if (r === 'checksum') add('RV-SK-02', 'warning', `Peppol ID ${label} 0245:${p.endpoint.id} nevyzerá ako platné DIČ (nie je deliteľné 11). Overte DIČ.`, role);
    } else if (isSk && p.endpoint && p.endpoint.scheme !== '9950') {
      add('RV-SK-03', 'info', `Slovenské firmy sú v sieti Peppol adresované ako 0245:DIČ. Elektronická adresa ${label} je ${p.endpoint.scheme}:${p.endpoint.id}.`, role);
    }
    if (isSk && p.legalId && /^\d{6,8}$/.test(p.legalId.id) && !isValidIco(p.legalId.id)) {
      add('RV-SK-04', 'warning', `IČO ${label} „${p.legalId.id}“ nemá platný kontrolný súčet.`, role);
    }
  }

  (m.paymentMeans || []).forEach((pm, i) => {
    for (const a of pm.accounts || []) {
      if (a.id && /^[A-Z]{2}\d{2}/.test(a.id.replace(/\s/g, '').toUpperCase()) && !isValidIban(a.id)) {
        add('RV-SK-05', 'warning', `IBAN „${a.id}“ nemá platný kontrolný súčet – platba na tento účet zlyhá.`, `paymentMeans[${i + 1}]`);
      }
    }
    if (m.seller?.address?.country === 'SK' && pm.remittanceInfo && !/^\d{1,10}$/.test(pm.remittanceInfo) && ['30', '58', '42'].includes(pm.code)) {
      add('RV-SK-06', 'info', `Platobná referencia „${pm.remittanceInfo}“ nie je číslo do 10 číslic – slovenské banky ju neprevezmú ako variabilný symbol.`, `paymentMeans[${i + 1}]`);
    }
  });

  if (m.seller?.address?.country === 'SK') {
    const rates = new Set();
    for (const v of m.vatBreakdown || []) if (v.category === 'S' && v.rate !== undefined) rates.add(String(num(v.rate)));
    for (const r of rates) {
      if (!SK_VAT_RATES.includes(r)) {
        add('RV-SK-07', 'warning', r === '20' || r === '10'
          ? `Sadzba DPH ${r} % platila na Slovensku do 31. 12. 2024. Od 1. 1. 2025 sú sadzby 23 %, 19 % a 5 %.`
          : `Sadzba DPH ${r} % nie je slovenská sadzba (23 %, 19 %, 5 %). Pri dodaní do zahraničia skontrolujte kategóriu DPH.`);
      }
    }
  }

  if (m.issueDate && m.dueDate && m.dueDate < m.issueDate) {
    add('RV-SK-08', 'warning', `Dátum splatnosti ${m.dueDate} je skôr ako dátum vystavenia ${m.issueDate}.`);
  }
  if (m.issueDate) {
    const limit = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    if (m.issueDate > limit) add('RV-SK-09', 'info', `Dátum vystavenia ${m.issueDate} je v budúcnosti.`);
  }
  return out;
}
