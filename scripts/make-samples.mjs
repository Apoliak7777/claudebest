#!/usr/bin/env node
// Generates the sample invoices in samples/ (fictitious companies and numbers).
import { writeFileSync, mkdirSync } from 'node:fs';
import { writeUbl } from '../src/model/write-ubl.js';

const seller = {
  name: 'Horáreň Digital s.r.o.',
  legalId: { id: '54120781' },
  vatId: 'SK2023456710',
  endpoint: { id: '2023456710', scheme: '0245' },
  additionalLegalInfo: 'Zapísaná v OR OS Žilina, oddiel Sro, vložka 81234/L',
  address: { line1: 'Framborská 12', city: 'Žilina', postalCode: '010 01', country: 'SK' },
  contact: { name: 'Mgr. Eva Kováčová', phone: '+421 900 123 456', email: 'fakturacia@horaren.example' },
};
const buyer = {
  name: 'Pekáreň Pod Hradom s.r.o.',
  legalId: { id: '51987309' },
  vatId: 'SK2120987605',
  endpoint: { id: '2120987605', scheme: '0245' },
  address: { line1: 'Mierové námestie 7', city: 'Trenčín', postalCode: '911 01', country: 'SK' },
  contact: { name: 'Ján Horváth', email: 'uctaren@pekaren.example' },
};

const base = {
  kind: 'invoice',
  id: '2026090042',
  issueDate: '2026-09-24',
  dueDate: '2026-10-08',
  taxPointDate: '2026-08-31',
  typeCode: '380',
  currency: 'EUR',
  buyerReference: 'OBJ-2026-117',
  orderReference: 'OBJ-2026-117',
  notes: ['Ďakujeme za spoluprácu. Faktúra slúži zároveň ako dodací list.'],
  seller,
  buyer,
  invoicePeriod: { start: '2026-08-01', end: '2026-08-31' },
  paymentMeans: [{ code: '30', text: 'Bankový prevod', remittanceInfo: '2026090042', accounts: [{ id: 'SK6811000000002629871234', bic: 'TATRSKBX', name: 'Horáreň Digital s.r.o.' }] }],
  paymentTerms: 'Splatnosť 14 dní. Pri omeškaní úrok z omeškania podľa Obchodného zákonníka.',
  lines: [
    { id: '1', item: { name: 'Implementácia e-fakturácie (Peppol BIS 3.0)', description: 'Analýza, nastavenie číselných radov, napojenie na digitálneho poštára', sellersId: 'IMPL-EF' }, quantity: '24', unit: 'HUR', price: { amount: '65.00' }, vat: { category: 'S', rate: '23' } },
    { id: '2', item: { name: 'Školenie účtovníčok – e-faktúra 2027', sellersId: 'SKOL-01' }, quantity: '1', unit: 'C62', price: { amount: '390.00' }, vat: { category: 'S', rate: '23' }, allowances: [{ amount: '39.00', reason: 'Zľava 10 % – verný zákazník', reasonCode: '95' }] },
    { id: '3', item: { name: 'Mesačná podpora a monitoring', description: 'Obdobie 08/2026' }, quantity: '1', unit: 'MON', price: { amount: '149.00' }, vat: { category: 'S', rate: '23' }, period: { start: '2026-08-01', end: '2026-08-31' } },
    { id: '4', item: { name: 'Príručka „E-faktúra v praxi“ (tlačená kniha)', standardId: { id: '9788099912344', scheme: '0160' } }, quantity: '3', unit: 'C62', price: { amount: '18.90' }, vat: { category: 'S', rate: '5' } },
  ],
};

const credit = {
  ...base,
  kind: 'creditnote',
  id: 'D2026090007',
  typeCode: '381',
  issueDate: '2026-09-25',
  dueDate: '2026-10-09',
  notes: ['Dobropis k faktúre 2026090042 – reklamácia hodín implementácie.'],
  precedingInvoices: [{ id: '2026090042', issueDate: '2026-09-24' }],
  paymentMeans: [{ code: '30', remittanceInfo: '2026090042', accounts: [{ id: 'SK6811000000002629871234', bic: 'TATRSKBX' }] }],
  lines: [{ id: '1', item: { name: 'Dobropis – 3 hodiny implementácie' }, quantity: '3', unit: 'HUR', price: { amount: '65.00' }, vat: { category: 'S', rate: '23' } }],
};

mkdirSync(new URL('../samples/', import.meta.url), { recursive: true });
const ok = writeUbl(base);
writeFileSync(new URL('../samples/faktura-ok.xml', import.meta.url), ok);
writeFileSync(new URL('../samples/dobropis.xml', import.meta.url), writeUbl(credit));

// The "broken" sample: typical real-world mistakes, injected on purpose.
let bad = writeUbl({
  ...base,
  id: '2026090043',
  seller: { ...seller, endpoint: undefined },
  paymentMeans: [{ code: '30', remittanceInfo: 'FA 2026/9/43', accounts: [{ id: 'SK6811000000002629871235' }] }],
  lines: base.lines.map((l) => (l.id === '4' ? { ...l, vat: { category: 'S', rate: '20' } } : l)),
});
bad = bad.replace(/<cbc:TaxInclusiveAmount currencyID="EUR">([\d.]+)<\/cbc:TaxInclusiveAmount>/, (_, v) => `<cbc:TaxInclusiveAmount currencyID="EUR">${(Number(v) + 0.1).toFixed(2)}</cbc:TaxInclusiveAmount>`);
bad = bad.replace('<cbc:BuyerReference>OBJ-2026-117</cbc:BuyerReference>\n', '').replace(/<cac:OrderReference>[\s\S]*?<\/cac:OrderReference>\n/, '');
writeFileSync(new URL('../samples/faktura-chyby.xml', import.meta.url), bad);
console.log('samples written');
