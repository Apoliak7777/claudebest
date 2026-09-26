// Human-readable visualisation of an invoice model (Slovak), safe for
// untrusted input: every value is HTML-escaped, links are limited to http(s).
import { BT_SK, INVOICE_TYPES_SK, PAYMENT_MEANS_SK, UNITS_SK } from '../i18n/terms-sk.js';
import { VAT_CATEGORIES } from '../model/calc.js';
import { payBySquare, epcQr } from '../pay/bysquare.js';
import { encodeQr, qrToSvg } from '../pay/qr.js';
import { formatIban, isValidIban } from '../sk/ident.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

export function money(v, currency = 'EUR') {
  if (!has(v)) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return esc(v);
  try {
    return new Intl.NumberFormat('sk-SK', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function number(v, maxFrac = 4) {
  if (!has(v)) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return esc(v);
  return new Intl.NumberFormat('sk-SK', { maximumFractionDigits: maxFrac }).format(n);
}

export function date(v) {
  if (!has(v)) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : esc(v);
}

const bt = (code, showCodes) => (showCodes ? `<span class="rv-bt" title="${esc(BT_SK[code] || code)}">${code}</span>` : '');

function address(a) {
  if (!a) return '';
  const lines = [a.line1, a.line2, a.line3, [a.postalCode, a.city].filter(has).join(' '), a.subdivision, a.country].filter(has);
  return lines.map((l) => `<div>${esc(l)}</div>`).join('');
}

function partyBlock(title, p, codes, prefix) {
  if (!p) return `<section class="rv-party"><h3>${title}</h3><p class="rv-missing">neuvedené</p></section>`;
  const ids = [];
  if (p.legalId) ids.push(['IČO', p.legalId.id, prefix === 's' ? 'BT-30' : 'BT-47']);
  if (p.vatId) ids.push(['IČ DPH', p.vatId, prefix === 's' ? 'BT-31' : 'BT-48']);
  if (p.taxRegId) ids.push(['DIČ / daňové č.', p.taxRegId, 'BT-32']);
  if (p.endpoint) ids.push(['Peppol ID', `${p.endpoint.scheme ? `${p.endpoint.scheme}:` : ''}${p.endpoint.id}`, prefix === 's' ? 'BT-34' : 'BT-49']);
  for (const i of p.identifiers || []) ids.push(['Identifikátor', `${i.scheme ? `${i.scheme}:` : ''}${i.id}`, prefix === 's' ? 'BT-29' : 'BT-46']);
  const c = p.contact || {};
  return `<section class="rv-party">
    <h3>${title}</h3>
    <div class="rv-party-name">${esc(p.name)}${bt(prefix === 's' ? 'BT-27' : 'BT-44', codes)}</div>
    ${p.tradingName ? `<div class="rv-muted">${esc(p.tradingName)}</div>` : ''}
    <div class="rv-addr">${address(p.address)}</div>
    <dl class="rv-ids">${ids.map(([k, v, code]) => `<dt>${k}${bt(code, codes)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${c.name || c.phone || c.email ? `<div class="rv-contact">${[c.name, c.phone, c.email].filter(has).map(esc).join(' · ')}</div>` : ''}
    ${p.additionalLegalInfo ? `<div class="rv-legal">${esc(p.additionalLegalInfo)}</div>` : ''}
  </section>`;
}

/** Payment QR (PAY by square for EUR, EPC otherwise) as SVG string, or ''. */
export function paymentQr(m, kind = 'auto') {
  const pm = (m.paymentMeans || []).find((p) => (p.accounts || []).some((a) => has(a.id)));
  const acc = pm?.accounts?.find((a) => has(a.id));
  const payable = Number(m.totals?.payable);
  if (!acc || !isValidIban(acc.id) || !(payable > 0) || m.kind === 'creditnote') return null;
  const vs = /^\d{1,10}$/.test(pm.remittanceInfo || '') ? pm.remittanceInfo : undefined;
  const useBsq = kind === 'bysquare' || (kind === 'auto' && (m.currency || 'EUR') === 'EUR');
  let text;
  let label;
  try {
    if (useBsq) {
      text = payBySquare({
        amount: m.totals.payable,
        currency: m.currency || 'EUR',
        iban: acc.id,
        bic: acc.bic,
        variableSymbol: vs,
        note: vs ? `Faktura ${m.id}` : `${pm.remittanceInfo || `Faktura ${m.id}`}`.slice(0, 140),
        dueDate: m.dueDate,
        beneficiaryName: (acc.name || m.payee?.name || m.seller?.name || '').slice(0, 70),
        invoiceId: m.id,
      });
      label = 'PAY by square';
    } else {
      text = epcQr({ name: acc.name || m.payee?.name || m.seller?.name, iban: acc.id, bic: acc.bic, amount: m.totals.payable, currency: m.currency, text: pm.remittanceInfo || `Invoice ${m.id}` });
      label = 'EPC QR (SEPA)';
    }
    const svg = qrToSvg(encodeQr(text, { ecc: 'M' }), { margin: 2, title: label });
    return { svg, label, text, iban: acc.id, bic: acc.bic, vs, reference: pm.remittanceInfo };
  } catch {
    return null;
  }
}

/**
 * Render an invoice model to an HTML fragment (wrap in .rv-inv, style with INVOICE_CSS).
 * @param {object} m invoice model (readInvoice)
 * @param {{showCodes?: boolean, qr?: 'auto'|'bysquare'|'epc'|'none', attachmentLinks?: boolean}} [opts]
 */
export function renderInvoiceHtml(m, opts = {}) {
  const codes = !!opts.showCodes;
  const cur = m.currency || 'EUR';
  const isCredit = m.kind === 'creditnote';
  const typeName = INVOICE_TYPES_SK[m.typeCode] || (isCredit ? 'Dobropis' : 'Faktúra');
  const t = m.totals || {};

  const meta = [
    ['Dátum vystavenia', date(m.issueDate), 'BT-2'],
    ['Dátum splatnosti', date(m.dueDate), 'BT-9'],
    ['Dátum dodania', date(m.delivery?.date), 'BT-72'],
    ['Daňová povinnosť', date(m.taxPointDate), 'BT-7'],
    ['Obdobie', m.invoicePeriod?.start || m.invoicePeriod?.end ? `${date(m.invoicePeriod.start)} – ${date(m.invoicePeriod.end)}` : '', 'BG-14'],
    ['Mena', esc(cur), 'BT-5'],
  ].filter(([, v]) => has(v));

  const refs = [
    ['Referencia kupujúceho', m.buyerReference, 'BT-10'],
    ['Objednávka', m.orderReference, 'BT-13'],
    ['Zákazka', m.salesOrderReference, 'BT-14'],
    ['Zmluva', m.contractReference, 'BT-12'],
    ['Projekt', m.projectReference, 'BT-11'],
    ['Dodací list', m.despatchAdviceReference, 'BT-16'],
    ['Príjemka', m.receivingAdviceReference, 'BT-15'],
    ['Obstarávanie', m.tenderReference, 'BT-17'],
    ['Účtovná referencia', m.accountingCost, 'BT-19'],
    ...(m.precedingInvoices || []).map((p) => ['K faktúre', `${p.id}${p.issueDate ? ` zo dňa ${date(p.issueDate)}` : ''}`, 'BT-25']),
  ].filter(([, v]) => has(v));

  const hasLineAc = (m.lines || []).some((l) => (l.allowances || []).length || (l.charges || []).length);
  const lineRows = (m.lines || [])
    .map((l) => {
      const unit = UNITS_SK[l.unit] || l.unit || '';
      const discount = [...(l.allowances || []).map((a) => `−${money(a.amount, cur)}${a.reason ? `<span class="rv-muted rv-acnote">${esc(a.reason)}</span>` : ''}`), ...(l.charges || []).map((c) => `+${money(c.amount, cur)}${c.reason ? `<span class="rv-muted rv-acnote">${esc(c.reason)}</span>` : ''}`)].join('');
      const rate = l.vat?.category === 'S' || has(l.vat?.rate) ? `${number(l.vat.rate ?? 0, 2)} %` : '';
      const priceNote = has(l.price?.baseQuantity) && Number(l.price.baseQuantity) !== 1 ? ` / ${number(l.price.baseQuantity)} ${esc(UNITS_SK[l.price.baseUnit] || l.price.baseUnit || unit)}` : '';
      const details = [
        l.item?.description ? `<div class="rv-desc">${esc(l.item.description)}</div>` : '',
        l.note ? `<div class="rv-muted">${esc(l.note)}</div>` : '',
        [l.item?.sellersId && `kód ${esc(l.item.sellersId)}`, l.item?.standardId && `${esc(l.item.standardId.scheme === '0160' ? 'EAN' : l.item.standardId.scheme || 'ID')} ${esc(l.item.standardId.id)}`, l.period?.start && `${date(l.period.start)} – ${date(l.period.end)}`]
          .filter(Boolean)
          .map((x) => `<span class="rv-chip">${x}</span>`)
          .join(''),
        (l.item?.attributes || []).map((a) => `<span class="rv-chip">${esc(a.name)}: ${esc(a.value)}</span>`).join(''),
      ].join('');
      return `<tr>
        <td class="rv-num">${esc(l.id)}</td>
        <td class="rv-item"><div class="rv-item-name">${esc(l.item?.name)}</div>${details}</td>
        <td class="rv-num">${number(l.quantity)}</td>
        <td>${esc(unit)}</td>
        <td class="rv-num">${money(l.price?.amount, cur)}${priceNote}${has(l.price?.gross) ? `<div class="rv-muted">pôv. ${money(l.price.gross, cur)}</div>` : ''}</td>
        ${hasLineAc ? `<td class="rv-num">${discount}</td>` : ''}
        <td class="rv-num">${rate}<div class="rv-muted">${esc(l.vat?.category || '')}</div></td>
        <td class="rv-num rv-strong">${money(l.net, cur)}</td>
      </tr>`;
    })
    .join('');

  const docAc = [...(m.allowances || []).map((a) => ({ ...a, sign: '−', label: 'Zľava' })), ...(m.charges || []).map((c) => ({ ...c, sign: '+', label: 'Poplatok' }))];
  const acRows = docAc
    .map((a) => `<tr><td>${a.label}${a.reason ? `: ${esc(a.reason)}` : ''}${a.reasonCode ? ` <span class="rv-muted">(${esc(a.reasonCode)})</span>` : ''}</td><td class="rv-num">${a.percent ? `${number(a.percent)} % z ${money(a.baseAmount, cur)}` : ''}</td><td class="rv-num">${esc(a.vatCategory || '')} ${has(a.vatRate) ? `${number(a.vatRate)} %` : ''}</td><td class="rv-num">${a.sign}${money(a.amount, cur)}</td></tr>`)
    .join('');

  const vatRows = (m.vatBreakdown || [])
    .map(
      (v) => `<tr>
      <td><span class="rv-cat">${esc(v.category)}</span> ${esc(VAT_CATEGORIES[v.category] || '')}${v.exemptionReason || v.exemptionCode ? `<div class="rv-muted">${esc([v.exemptionCode, v.exemptionReason].filter(has).join(' – '))}</div>` : ''}</td>
      <td class="rv-num">${has(v.rate) ? `${number(v.rate, 2)} %` : '–'}</td>
      <td class="rv-num">${money(v.taxable, cur)}</td>
      <td class="rv-num">${money(v.tax, cur)}</td>
    </tr>`,
    )
    .join('');

  const totals = [
    ['Súčet položiek', t.lineNet, 'BT-106'],
    ['Zľavy', has(t.allowances) ? `-${t.allowances}` : undefined, 'BT-107'],
    ['Poplatky', t.charges, 'BT-108'],
    ['Celkom bez DPH', t.taxExclusive, 'BT-109'],
    ['DPH', t.taxAmount, 'BT-110'],
    ['Celkom s DPH', t.taxInclusive, 'BT-112'],
    ['Uhradené zálohy', has(t.prepaid) ? `-${t.prepaid}` : undefined, 'BT-113'],
    ['Zaokrúhlenie', t.rounding, 'BT-114'],
  ].filter(([, v]) => has(v));

  const qr = opts.qr === 'none' ? null : paymentQr(m, opts.qr || 'auto');
  const pmBlocks = (m.paymentMeans || [])
    .map((p) => {
      const rows = [
        ['Spôsob úhrady', `${esc(PAYMENT_MEANS_SK[p.code] || p.text || '')} <span class="rv-muted">${esc(p.code)}</span>`, 'BT-81'],
        ...(p.accounts || []).flatMap((a) => [
          ['IBAN', `<span class="rv-mono">${esc(isValidIban(a.id) ? formatIban(a.id) : a.id)}</span>`, 'BT-84'],
          a.bic ? ['BIC', `<span class="rv-mono">${esc(a.bic)}</span>`, 'BT-86'] : null,
          a.name ? ['Názov účtu', esc(a.name), 'BT-85'] : null,
        ]),
        p.remittanceInfo ? [/^\d{1,10}$/.test(p.remittanceInfo) ? 'Variabilný symbol' : 'Platobná referencia', `<span class="rv-mono">${esc(p.remittanceInfo)}</span>`, 'BT-83'] : null,
        p.card ? ['Karta', esc([p.card.pan, p.card.holder].filter(has).join(' · ')), 'BT-87'] : null,
        p.mandate ? ['Mandát inkasa', esc(p.mandate.id), 'BT-89'] : null,
      ].filter(Boolean);
      return `<dl class="rv-pay-dl">${rows.map(([k, v, code]) => `<dt>${k}${bt(code, codes)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    })
    .join('');

  const attachments = (m.attachments || [])
    .map((a, i) => {
      const name = a.filename || a.id || `príloha-${i + 1}`;
      const url = has(a.uri) && /^https?:\/\//i.test(a.uri) ? a.uri : null;
      const embedded = has(a.content) ? `<span class="rv-chip">${esc(a.mimeCode || 'súbor')} · ${number(Math.round((a.content.length * 3) / 4 / 1024))} kB</span>` : '';
      const link = opts.attachmentLinks && has(a.content) ? `<button type="button" class="rv-att-btn" data-attachment="${i}">Otvoriť</button>` : '';
      return `<li><span class="rv-att-name">${esc(name)}</span>${a.description ? ` <span class="rv-muted">${esc(a.description)}</span>` : ''} ${embedded} ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(url)}</a>` : ''} ${link}</li>`;
    })
    .join('');

  const notes = [...(m.notes || []), m.paymentTerms ? `Platobné podmienky: ${m.paymentTerms}` : null].filter(has);

  return `<article class="rv-inv${isCredit ? ' rv-credit' : ''}" lang="sk">
  <header class="rv-head">
    <div>
      <div class="rv-type">${esc(typeName)}${bt('BT-3', codes)}</div>
      <h2 class="rv-number">${esc(m.id || 'bez čísla')}${bt('BT-1', codes)}</h2>
    </div>
    <dl class="rv-meta">${meta.map(([k, v, code]) => `<div><dt>${k}${bt(code, codes)}</dt><dd>${v}</dd></div>`).join('')}</dl>
  </header>
  <div class="rv-parties">
    ${partyBlock('Dodávateľ', m.seller, codes, 's')}
    ${partyBlock('Odberateľ', m.buyer, codes, 'b')}
  </div>
  ${m.payee?.name ? `<p class="rv-note">Príjemca platby: <strong>${esc(m.payee.name)}</strong></p>` : ''}
  ${m.delivery && (m.delivery.partyName || m.delivery.address) ? `<p class="rv-note">Miesto dodania: ${esc([m.delivery.partyName, m.delivery.address && [m.delivery.address.line1, m.delivery.address.postalCode, m.delivery.address.city, m.delivery.address.country].filter(has).join(', ')].filter(has).join(' – '))}</p>` : ''}
  ${refs.length ? `<dl class="rv-refs">${refs.map(([k, v, code]) => `<div><dt>${k}${bt(code, codes)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
  <div class="rv-table-wrap"><table class="rv-lines">
    <thead><tr><th class="rv-num">#</th><th>Položka</th><th class="rv-num">Množstvo</th><th>MJ</th><th class="rv-num">Cena/MJ</th>${hasLineAc ? '<th class="rv-num">Zľava</th>' : ''}<th class="rv-num">DPH</th><th class="rv-num">Bez DPH</th></tr></thead>
    <tbody>${lineRows || '<tr><td colspan="8" class="rv-missing">Faktúra nemá žiadne položky.</td></tr>'}</tbody>
  </table></div>
  ${acRows ? `<div class="rv-table-wrap"><table class="rv-ac"><tbody>${acRows}</tbody></table></div>` : ''}
  <div class="rv-bottom">
    <div class="rv-vat">
      <h3>Rozpis DPH${bt('BG-23', codes)}</h3>
      <div class="rv-table-wrap"><table><thead><tr><th>Kategória</th><th class="rv-num">Sadzba</th><th class="rv-num">Základ</th><th class="rv-num">DPH</th></tr></thead><tbody>${vatRows}</tbody></table></div>
    </div>
    <div class="rv-totals">
      <dl>${totals.map(([k, v, code]) => `<div><dt>${k}${bt(code, codes)}</dt><dd>${money(v, cur)}</dd></div>`).join('')}</dl>
      <div class="rv-payable"><span>${isCredit ? 'Na vrátenie' : 'K úhrade'}${bt('BT-115', codes)}</span><strong>${money(t.payable, cur)}</strong></div>
      ${has(t.taxAmountInTaxCurrency) ? `<div class="rv-muted">DPH v mene ${esc(m.taxCurrency)}: ${money(t.taxAmountInTaxCurrency, m.taxCurrency)}</div>` : ''}
    </div>
  </div>
  ${pmBlocks || qr ? `<section class="rv-pay"><div class="rv-pay-info"><h3>Platba${bt('BG-16', codes)}</h3>${pmBlocks}</div>${qr ? `<figure class="rv-qr">${qr.svg}<figcaption>${esc(qr.label)}<br><span class="rv-muted">naskenujte v bankovej aplikácii</span></figcaption></figure>` : ''}</section>` : ''}
  ${notes.length ? `<section class="rv-notes"><h3>Poznámky${bt('BG-1', codes)}</h3>${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</section>` : ''}
  ${attachments ? `<section class="rv-atts"><h3>Prílohy${bt('BG-24', codes)}</h3><ul>${attachments}</ul></section>` : ''}
  <footer class="rv-foot">${['Vizualizácia elektronickej faktúry podľa EN 16931', m.syntax, m.customizationId].filter(has).map(esc).join(' · ')}</footer>
</article>`;
}

/** Stylesheet for .rv-inv (uses CSS custom properties with sensible fallbacks). */
export const INVOICE_CSS = `
.rv-inv{--rv-ink:var(--ink,#18222d);--rv-muted:var(--muted,#5b6773);--rv-line:var(--line,#d9dee3);--rv-sheet:var(--sheet,#fff);--rv-accent:var(--accent,#6d2e9e);--rv-soft:var(--soft,#f2f4f6);
  color:var(--rv-ink);background:var(--rv-sheet);font:14px/1.5 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;padding:clamp(16px,4vw,40px);display:grid;gap:22px;font-variant-numeric:tabular-nums}
.rv-inv h2,.rv-inv h3{margin:0}
.rv-inv h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--rv-muted);font-weight:600;margin-bottom:8px}
.rv-head{display:grid;gap:14px;border-bottom:2px solid var(--rv-ink);padding-bottom:16px}
.rv-type{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--rv-accent);font-weight:600}
.rv-inv .rv-number{font:700 clamp(24px,4vw,34px)/1.1 "Bricolage Grotesque","IBM Plex Sans",system-ui,sans-serif;letter-spacing:-.01em;overflow-wrap:anywhere;text-transform:none;color:var(--rv-ink)}
.rv-meta{display:flex;flex-wrap:wrap;gap:8px 22px;margin:0}
.rv-meta dt,.rv-refs dt,.rv-totals dt{font-size:11px;color:var(--rv-muted)}
.rv-meta dd,.rv-refs dd{margin:0;font-weight:500}
.rv-parties{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.rv-party{border:1px solid var(--rv-line);border-radius:6px;padding:14px 16px;display:grid;gap:6px;align-content:start}
.rv-party-name{font-weight:600;font-size:16px}
.rv-ids{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:4px 0 0;font-size:13px}
.rv-ids dt{color:var(--rv-muted)}.rv-ids dd{margin:0;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;word-break:break-all}
.rv-contact,.rv-legal{font-size:12.5px;color:var(--rv-muted)}
.rv-refs{display:flex;flex-wrap:wrap;gap:8px 24px;margin:0;padding:10px 14px;background:var(--rv-soft);border-radius:6px}
.rv-table-wrap{overflow-x:auto}
.rv-inv table{width:100%;border-collapse:collapse}
.rv-inv th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--rv-muted);font-weight:600;text-align:left;padding:8px 8px;border-bottom:1px solid var(--rv-ink)}
.rv-inv td{padding:9px 8px;border-bottom:1px solid var(--rv-line);vertical-align:top}
.rv-num{text-align:right!important;white-space:nowrap}
.rv-acnote{display:block;white-space:normal;max-width:16ch;margin-left:auto}
.rv-item{min-width:180px}.rv-item-name{font-weight:600}
.rv-desc{font-size:13px;color:var(--rv-muted);white-space:pre-line}
.rv-chip{display:inline-block;font-size:11px;padding:1px 6px;border:1px solid var(--rv-line);border-radius:3px;margin:4px 4px 0 0;color:var(--rv-muted)}
.rv-strong{font-weight:600}
.rv-muted{color:var(--rv-muted);font-size:12px}
.rv-missing{color:var(--rv-muted);font-style:italic}
.rv-cat{display:inline-block;min-width:22px;text-align:center;font:600 11px "IBM Plex Mono",ui-monospace,monospace;border:1px solid var(--rv-ink);border-radius:3px;padding:0 3px}
.rv-bottom{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(240px,1fr);gap:24px;align-items:start}
@media (max-width:680px){.rv-bottom{grid-template-columns:1fr}}
.rv-totals dl{margin:0;display:grid;gap:4px}
.rv-totals dl>div{display:flex;justify-content:space-between;gap:12px}
.rv-totals dt{font-size:13px}.rv-totals dd{margin:0}
.rv-payable{margin-top:10px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:2px solid var(--rv-ink);padding-top:10px}
.rv-payable span{font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.08em}
.rv-payable strong{font:700 clamp(20px,3.5vw,28px)/1 "Bricolage Grotesque","IBM Plex Sans",system-ui,sans-serif;color:var(--rv-accent)}
.rv-pay{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:flex-start;border:1px solid var(--rv-line);border-radius:6px;padding:14px 16px}
.rv-pay-dl{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin:0 0 8px}
.rv-pay-dl dt{color:var(--rv-muted);font-size:13px}.rv-pay-dl dd{margin:0}
.rv-mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.rv-qr{margin:0;text-align:center;width:150px;font-size:12px;font-weight:600}
.rv-qr svg{width:150px;height:150px;display:block;border-radius:4px}
.rv-notes p{margin:0 0 6px;white-space:pre-line}
.rv-atts ul{margin:0;padding-left:18px}.rv-atts li{margin:4px 0}
.rv-att-btn{font:inherit;font-size:12px;border:1px solid var(--rv-line);background:var(--rv-soft);color:var(--rv-ink);border-radius:4px;padding:1px 8px;cursor:pointer}
.rv-bt{display:inline-block;margin-left:6px;font:500 9.5px/1.5 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:0;text-transform:none;color:var(--rv-accent);border:1px solid currentColor;border-radius:3px;padding:0 3px;vertical-align:1px;opacity:.85}
.rv-note{margin:0;font-size:13px}
.rv-foot{font-size:11px;color:var(--rv-muted);border-top:1px solid var(--rv-line);padding-top:10px}
.rv-credit .rv-type{color:#b0302a}
@media print{.rv-inv{padding:0;font-size:11.5px}.rv-bt{display:none}.rv-att-btn{display:none}.rv-party,.rv-pay{break-inside:avoid}}
`;

/** Full standalone HTML document (for print / archive / CLI). */
export function renderInvoiceDocument(m, opts = {}) {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.id || 'Faktúra')} – ${esc(m.seller?.name || '')}</title><style>body{margin:0;background:#e9ecef}main{max-width:900px;margin:24px auto;box-shadow:0 1px 3px rgba(0,0,0,.12)}@media print{body{background:#fff}main{margin:0;box-shadow:none}}${INVOICE_CSS}</style></head><body><main>${renderInvoiceHtml(m, opts)}</main></body></html>`;
}
