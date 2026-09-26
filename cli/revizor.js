#!/usr/bin/env node
// Revízor CLI – validate, render, convert and create payment QR codes.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createNodeValidator, readInvoice, writeUbl, renderInvoiceDocument, payBySquare, epcQr, qrSvg, decodeXml } from '../src/node.js';

const HELP = `Revízor – e-faktúry podľa EN 16931 / Peppol BIS 3.0

Použitie:
  revizor validate <súbor.xml>... [--json] [--no-sk]   kontrola oficiálnymi pravidlami (exit 1 pri chybe)
  revizor render <súbor.xml> [-o faktura.html]          čitateľná HTML podoba faktúry s QR kódom
  revizor convert <cii.xml> [-o ubl.xml]                prevod CII (ZUGFeRD/XRechnung) → Peppol UBL
  revizor qr --iban SK.. --amount 12.30 [--vs 123] [--name "Firma"] [--due 2026-10-15] [--epc] [-o qr.svg]
`;

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('-') && !(i > 0 && arr[i - 1].startsWith('-') && !['--json', '--no-sk', '--epc'].includes(arr[i - 1])));
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const readXml = (f) => decodeXml(new Uint8Array(readFileSync(f)));

async function main() {
  switch (cmd) {
    case 'validate': {
      if (!positional.length) throw new Error('Chýba súbor.');
      const v = createNodeValidator({ sk: !flag('--no-sk') });
      let bad = 0;
      const results = [];
      for (const f of positional) {
        const r = await v.validate(readXml(f));
        delete r.doc;
        if (!r.ok) bad++;
        results.push({ file: f, ...r });
        if (!flag('--json')) {
          const fatal = r.issues.filter((i) => i.flag === 'fatal');
          const w = r.issues.length - fatal.length;
          console.log(`${r.ok ? '✓ PLATNÁ  ' : '✗ NEPLATNÁ'} ${f}  (${r.syntax || '?'}, ${fatal.length} ${plural(fatal.length, 'chyba', 'chyby', 'chýb')}, ${w} ${plural(w, 'pripomienka', 'pripomienky', 'pripomienok')}, ${r.ms} ms)`);
          for (const i of r.issues) console.log(`   ${i.flag === 'fatal' ? '✗' : i.flag === 'warning' ? '!' : 'i'} ${i.id}  ${i.messageSk || i.message}${i.line ? `  [riadok ${i.line}]` : ''}`);
        }
      }
      if (flag('--json')) console.log(JSON.stringify(results, null, 2));
      process.exitCode = bad ? 1 : 0;
      break;
    }
    case 'render': {
      const f = positional[0];
      if (!f) throw new Error('Chýba súbor.');
      const html = renderInvoiceDocument(readInvoice(readXml(f)));
      const out = opt('-o') || `${basename(f).replace(/\.xml$/i, '')}.html`;
      writeFileSync(out, html);
      console.log(`Uložené: ${out}`);
      break;
    }
    case 'convert': {
      const f = positional[0];
      if (!f) throw new Error('Chýba súbor.');
      const xml = writeUbl(readInvoice(readXml(f)), { recalculate: false });
      const out = opt('-o');
      if (out) {
        writeFileSync(out, xml);
        console.log(`Uložené: ${out}`);
      } else process.stdout.write(xml);
      break;
    }
    case 'qr': {
      const p = { iban: opt('--iban'), amount: opt('--amount'), variableSymbol: opt('--vs'), beneficiaryName: opt('--name') || '', dueDate: opt('--due'), note: opt('--note'), currency: opt('--currency') || 'EUR' };
      if (!p.iban) throw new Error('Chýba --iban.');
      const text = flag('--epc') ? epcQr({ name: p.beneficiaryName, iban: p.iban, amount: p.amount, text: p.note || (p.variableSymbol ? `VS ${p.variableSymbol}` : '') }) : payBySquare(p);
      const out = opt('-o');
      if (out) {
        writeFileSync(out, qrSvg(text, { ecc: 'M' }));
        console.log(`Uložené: ${out}`);
      } else console.log(text);
      break;
    }
    default:
      process.stdout.write(HELP);
      process.exitCode = cmd && cmd !== '--help' && cmd !== 'help' ? 2 : 0;
  }
}

main().catch((e) => {
  console.error(`Chyba: ${e.message}`);
  process.exitCode = 2;
});
