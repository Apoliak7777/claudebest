import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { decode as decodeBysquare } from 'bysquare/pay';
import {
  createNodeValidator, readInvoice, writeUbl, calculate, renderInvoiceHtml, payBySquare, epcQr, encodeQr,
  isValidIban, isValidIco, isValidSkVat, checkSkDic, translateRule, readZip, writeZip, decodeXml,
} from '../src/node.js';

const sample = (n) => readFileSync(new URL(`../samples/${n}`, import.meta.url), 'utf8');
const validator = createNodeValidator();

test('samples: valid invoice and credit note pass, broken one fails with the expected rules', async () => {
  for (const n of ['faktura-ok.xml', 'dobropis.xml']) {
    const r = await validator.validate(sample(n));
    assert.equal(r.ok, true, `${n}: ${r.issues.map((i) => i.id).join(',')}`);
    assert.equal(r.issues.filter((i) => i.flag !== 'info').length, 0);
  }
  const bad = await validator.validate(sample('faktura-chyby.xml'));
  assert.equal(bad.ok, false);
  const ids = bad.issues.map((i) => i.id);
  for (const id of ['BR-CO-15', 'BR-CO-16', 'PEPPOL-EN16931-R003', 'PEPPOL-EN16931-R020', 'RV-SK-05', 'RV-SK-07']) assert.ok(ids.includes(id), id);
  assert.match(bad.issues.find((i) => i.id === 'BR-CO-15').messageSk, /Celkom s DPH/);
  assert.ok(bad.issues.find((i) => i.id === 'PEPPOL-EN16931-R020').line > 1);
});

test('non-invoice and malformed input produce a readable report, not an exception', async () => {
  const a = await validator.validate('<html><body/></html>');
  assert.equal(a.ok, false);
  assert.equal(a.issues[0].id, 'DOC');
  const b = await validator.validate('<Invoice><cbc:ID>');
  assert.equal(b.issues[0].id, 'XML');
});

test('model: read → write round trip keeps a valid Peppol invoice valid', async () => {
  const m = readInvoice(sample('faktura-ok.xml'));
  assert.equal(m.id, '2026090042');
  assert.equal(m.seller.endpoint.scheme, '0245');
  assert.equal(m.lines.length, 4);
  assert.equal(m.totals.payable, '2593.34');
  const again = await validator.validate(writeUbl(m, { recalculate: false }));
  assert.equal(again.ok, true);
  const recalculated = await validator.validate(writeUbl(m));
  assert.equal(recalculated.ok, true);
});

test('calculation follows EN 16931: per-line rounding, VAT per rate, allowances', () => {
  const m = calculate({
    lines: [
      { quantity: '3', price: { amount: '0.333' }, vat: { category: 'S', rate: '23' } },
      { quantity: '1', price: { amount: '100' }, vat: { category: 'S', rate: '23' }, allowances: [{ percent: '10', reason: 'zľava' }] },
      { quantity: '2', price: { amount: '9.99' }, vat: { category: 'S', rate: '5' } },
      { quantity: '1', price: { amount: '50' }, vat: { category: 'E' } },
    ],
    charges: [{ amount: '5', reason: 'doprava', vatCategory: 'S', vatRate: '23' }],
  });
  assert.deepEqual(m.lines.map((l) => l.net), ['1.00', '90.00', '19.98', '50.00']);
  const v = Object.fromEntries(m.vatBreakdown.map((x) => [`${x.category}${Number(x.rate)}`, [x.taxable, x.tax]]));
  assert.deepEqual(v.S23, ['96.00', '22.08']);
  assert.deepEqual(v['S5'], ['19.98', '1.00']);
  assert.deepEqual(v.E0, ['50.00', '0.00']);
  assert.equal(m.totals.taxExclusive, '165.98');
  assert.equal(m.totals.payable, '189.06');
});

test('CII → UBL conversion yields Peppol identifiers', () => {
  const cii = `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>INV-7</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20260915</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
  const m = readInvoice(cii);
  assert.equal(m.syntax, 'CII');
  assert.equal(m.issueDate, '2026-09-15');
  const ubl = writeUbl(m, { recalculate: false });
  assert.match(ubl, /urn:cen\.eu:en16931:2017#compliant#urn:fdc:peppol\.eu:2017:poacc:billing:3\.0/);
  assert.match(ubl, /<cbc:ID>INV-7<\/cbc:ID>/);
});

test('renderer escapes hostile content (received invoices are untrusted)', () => {
  const m = readInvoice(sample('faktura-ok.xml'));
  m.seller.name = '<img src=x onerror=alert(1)>';
  m.lines[0].item.name = '"><script>alert(2)</script>';
  m.attachments = [{ id: 'a', uri: 'javascript:alert(3)' }];
  const html = renderInvoiceHtml(m);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="javascript:'));
});

function decodeQr(qr) {
  const scale = 3;
  const margin = 4;
  const dim = (qr.size + margin * 2) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * dim + (x + margin) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(px, dim, dim)?.data ?? null;
}

test('QR encoder output decodes (all ECC levels, alphanumeric and UTF-8)', () => {
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    for (const text of ['0804Q000CO3GK44Q92OTTHTP5248D7VSNIKVJ71CFF', 'Faktúra č. 2026090042 – ďakujeme!', '1234567890'.repeat(12)]) {
      const qr = encodeQr(text, { ecc, boostEcc: false });
      assert.equal(decodeQr(qr), text, `${ecc} v${qr.version}`);
    }
  }
});

test('PAY by square decodes with the reference implementation', () => {
  const s = payBySquare({ amount: '2593.34', iban: 'SK6811000000002629871234', bic: 'TATRSKBX', variableSymbol: '2026090042', dueDate: '2026-10-08', note: 'Faktúra 2026090042', beneficiaryName: 'Horáreň Digital s.r.o.' });
  const d = decodeBysquare(s);
  const p = d.payments[0];
  assert.equal(p.amount, 2593.34);
  assert.equal(p.bankAccounts[0].iban, 'SK6811000000002629871234');
  assert.equal(p.variableSymbol, '2026090042');
  assert.equal(p.paymentDueDate, '20261008');
  assert.equal(p.beneficiary.name, 'Horaren Digital s.r.o.');
  assert.equal(decodeQr(encodeQr(s, { ecc: 'M' })), s);
});

test('EPC QR payload', () => {
  const t = epcQr({ name: 'Firma', iban: 'SK68 1100 0000 0026 2987 1234', amount: 12.3, text: 'VS 123' });
  assert.equal(t.split('\n')[0], 'BCD');
  assert.ok(t.includes('SK6811000000002629871234'));
  assert.ok(t.includes('EUR12.30'));
});

test('Slovak identifiers', () => {
  assert.equal(isValidIban('SK68 1100 0000 0026 2987 1234'), true);
  assert.equal(isValidIban('SK68 1100 0000 0026 2987 1235'), false);
  assert.equal(isValidIco('54120781'), true);
  assert.equal(isValidIco('54120782'), false);
  assert.equal(isValidSkVat('SK2023456710'), true);
  assert.equal(isValidSkVat('SK2023456711'), false);
  assert.equal(checkSkDic('2023456710'), 'ok');
  assert.equal(checkSkDic('20234567'), 'format');
});

test('Slovak rule translations cover the core business rules', () => {
  for (const id of ['BR-01', 'BR-CO-10', 'BR-CO-15', 'BR-S-08', 'BR-AE-10', 'BR-DEC-12', 'PEPPOL-EN16931-R010']) assert.ok(translateRule(id, '(BT-109)'), id);
});

test('ZIP round trip and XML encoding detection', async () => {
  const zip = writeZip([{ name: 'a.xml', data: '<a>č</a>' }, { name: 'b/c.xml', data: '<b/>' }]);
  const files = await readZip(zip);
  assert.deepEqual(files.map((f) => f.name), ['a.xml', 'b/c.xml']);
  assert.equal(decodeXml(files[0].data), '<a>č</a>');
  const cp1250 = Uint8Array.from([...Buffer.from('<?xml version="1.0" encoding="windows-1250"?><a>'), 0xe8, ...Buffer.from('</a>')]);
  assert.equal(decodeXml(cp1250).endsWith('<a>č</a>'), true);
});
