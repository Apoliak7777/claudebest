// Revízor web app (bundled by scripts/build.mjs into one offline HTML file).
import { createValidator } from '../src/validate.js';
import { skChecks } from '../src/sk/checks.js';
import { readInvoice } from '../src/model/read.js';
import { writeUbl } from '../src/model/write-ubl.js';
import { calculate } from '../src/model/calc.js';
import { renderInvoiceHtml, INVOICE_CSS, esc, money, date } from '../src/render/invoice-html.js';
import { isValidIban, isValidIco, isValidSkVat, checkSkDic, formatIban } from '../src/sk/ident.js';
import { readZip, decodeXml } from '../src/util/zip.js';
import { term } from '../src/i18n/terms-sk.js';

import CEN_UBL from '../rules/CEN-EN16931-UBL.sch';
import PEPPOL_UBL from '../rules/PEPPOL-EN16931-UBL.sch';
import CEN_CII from '../rules/CEN-EN16931-CII.sch';
import PEPPOL_CII from '../rules/PEPPOL-EN16931-CII.sch';
import SAMPLE_OK from '../samples/faktura-ok.xml';
import SAMPLE_BAD from '../samples/faktura-chyby.xml';
import SAMPLE_CN from '../samples/dobropis.xml';

// ---------------------------------------------------------------- config
const CONFIG = Object.assign(
  {
    brand: 'Revízor',
    tagline: 'e-faktúry podľa EN 16931 · Peppol BIS 3.0',
    demo: false, // hides downloads/print (sandboxed previews)
    contact: '',
    rulesVersion: 'CEN EN 16931 1.3.15 · Peppol BIS Billing 3.0.20',
  },
  globalThis.REVIZOR_CONFIG || {},
);

const RULES = { 'CEN-EN16931-UBL': CEN_UBL, 'PEPPOL-EN16931-UBL': PEPPOL_UBL, 'CEN-EN16931-CII': CEN_CII, 'PEPPOL-EN16931-CII': PEPPOL_CII };
const SAMPLES = {
  ok: { name: 'vzor-faktura-platna.xml', xml: SAMPLE_OK },
  chyby: { name: 'vzor-faktura-s-chybami.xml', xml: SAMPLE_BAD },
  dobropis: { name: 'vzor-dobropis.xml', xml: SAMPLE_CN },
};
const validator = createValidator((name) => RULES[name], { extraChecks: [skChecks] });

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`revizor:${k}`);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`revizor:${k}`, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};

let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}

async function copyText(text, what = 'XML') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} je v schránke.`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    toast(ok ? `${what} je v schránke.` : 'Kopírovanie prehliadač zablokoval.');
  }
}

function download(name, content, mime = 'application/xml') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function printInvoice(viewId) {
  $$('.view').forEach((v) => v.classList.toggle('printing', v.id === viewId));
  window.print();
}

const safeName = (s) => String(s || 'faktura').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80);

// ---------------------------------------------------------------- navigation
const VIEWS = { check: 'view-check', create: 'view-create', batch: 'view-batch', about: 'view-about' };
const HASH = { check: 'kontrola', create: 'vystavit', batch: 'hromadne', about: 'ako-to-funguje' };
function go(view, { push = true } = {}) {
  for (const [k, id] of Object.entries(VIEWS)) $(`#${id}`).hidden = k !== view;
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.go === view)));
  if (push) {
    try {
      history.replaceState(null, '', `#${HASH[view]}`);
    } catch {
      /* sandboxed */
    }
  }
  store.set('view', view);
  if (view === 'create') renderCreator();
  if (view === 'about') countRules();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (t) {
    e.preventDefault();
    go(t.dataset.go);
  }
});

// ---------------------------------------------------------------- check view
const check = { name: '', xml: '', report: null, model: null, filter: 'all', view: 'inv' };

async function runCheck(name, xml) {
  check.name = name;
  check.xml = xml;
  $('#verdict').innerHTML = '<div class="verdict-row"><span class="spinner"></span> Kontrolujem…</div>';
  await new Promise((r) => setTimeout(r, 0));
  const report = await validator.validate(xml);
  check.report = report;
  check.model = null;
  if (report.syntax) {
    try {
      check.model = readInvoice(report.doc);
    } catch {
      check.model = null;
    }
  }
  renderVerdict(true);
  renderIssues();
  renderDoc();
}

function verdictOf(report) {
  if (!report) return { cls: 'idle', word: 'ČAKÁ', sub: 'nahrajte faktúru' };
  const fatal = report.issues.filter((i) => i.flag === 'fatal' || i.flag === 'error').length;
  const warn = report.issues.filter((i) => i.flag === 'warning').length;
  if (fatal || report.engineErrors.length) return { cls: 'bad', word: 'NEPLATNÁ', sub: 'EN 16931 · Peppol BIS 3.0', fatal, warn };
  if (warn) return { cls: 'warn', word: 'PLATNÁ', sub: 's pripomienkami', fatal, warn };
  return { cls: 'ok', word: 'PLATNÁ', sub: 'EN 16931 · Peppol BIS 3.0', fatal, warn };
}

function stampHtml(v, pressed) {
  return `<div class="stamp ${v.cls}${pressed ? ' pressed' : ''}" aria-label="Výsledok: ${v.word}"><span class="stamp-word">${v.word}</span><span class="stamp-sub">${esc(v.sub)}</span></div>`;
}

function renderVerdict(pressed = false) {
  const r = check.report;
  const v = verdictOf(r);
  const box = $('#verdict');
  if (!r) {
    box.innerHTML = `<div class="verdict-row">${stampHtml(v)}<div class="counts"><span>Pretiahnite XML e-faktúru alebo otvorte vzor.</span></div></div>`;
    return;
  }
  const asserts = r.ruleSets.reduce((n, s) => n + s.asserts, 0);
  const kind = r.kind === 'creditnote' ? 'dobropis' : 'faktúra';
  const m = check.model;
  box.innerHTML = `
    <div class="verdict-file">${esc(check.name)}${r.syntax ? ` · ${esc(r.syntax)} ${kind}` : ''}${m?.id ? ` č. <b>${esc(m.id)}</b>` : ''}</div>
    <div class="verdict-row">
      ${stampHtml(v, pressed)}
      <div class="counts">
        <span><strong>${v.fatal ?? 0}</strong> ${plural(v.fatal ?? 0, 'chyba', 'chyby', 'chýb')}</span>
        <span><strong>${v.warn ?? 0}</strong> ${plural(v.warn ?? 0, 'pripomienka', 'pripomienky', 'pripomienok')}</span>
      </div>
    </div>
    <div class="verdict-meta">${r.syntax ? `Overené ${asserts.toLocaleString('sk-SK')} oficiálnymi pravidlami (${esc(CONFIG.rulesVersion)}) + slovenskými kontrolami za ${r.ms} ms, lokálne v prehliadači.` : 'Dokument nie je e-faktúra v podporovanom formáte.'}${r.engineErrors.length ? ` Niektoré pravidlá nebolo možné vyhodnotiť (${r.engineErrors.length}) – dokument je štrukturálne poškodený.` : ''}</div>`;
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function renderIssues() {
  const r = check.report;
  const box = $('#issues');
  if (!r) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const counts = { all: r.issues.length, fatal: 0, warning: 0, info: 0 };
  for (const i of r.issues) counts[i.flag === 'fatal' || i.flag === 'error' ? 'fatal' : i.flag === 'warning' ? 'warning' : 'info']++;
  const list = r.issues.filter((i) => check.filter === 'all' || (check.filter === 'fatal' ? i.flag === 'fatal' || i.flag === 'error' : i.flag === check.filter));
  const btn = (k, label) => `<button class="chipbtn" data-filter="${k}" aria-pressed="${check.filter === k}">${label} ${counts[k]}</button>`;
  const items = list
    .map((i, idx) => {
      const cls = i.flag === 'fatal' || i.flag === 'error' ? 'fatal' : i.flag;
      const sk = i.messageSk;
      const en = i.message && i.message !== sk ? i.message : '';
      return `<button class="issue ${cls}" data-line="${i.line || ''}" data-idx="${idx}">
        <span class="issue-top"><span class="rule">${esc(i.id || '?')}</span><span class="src">${esc(sourceLabel(i.source))}</span></span>
        <span class="issue-msg">${esc(sk || en)}</span>
        ${sk && en ? `<span class="issue-en">${esc(en)}</span>` : ''}
        ${i.location ? `<span class="issue-loc">${esc(i.location)}${i.line ? ` · riadok ${i.line}` : ''}</span>` : ''}
      </button>`;
    })
    .join('');
  box.innerHTML = `<div class="issues-head"><h2>Zistenia</h2><div class="filter">${btn('all', 'Všetko')}${btn('fatal', 'Chyby')}${btn('warning', 'Pripomienky')}${counts.info ? btn('info', 'Tipy') : ''}</div></div>
    ${items || (r.issues.length ? '<div class="empty-ok">V tejto kategórii nič.</div>' : '<div class="empty-ok"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg> Faktúra prešla všetkými kontrolami.</div>')}`;
}

function sourceLabel(s) {
  if (!s) return '';
  if (s.startsWith('CEN')) return 'EN 16931 (CEN)';
  if (s.startsWith('PEPPOL')) return 'Peppol BIS 3.0';
  return s;
}

$('#issues').addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) {
    check.filter = f.dataset.filter;
    renderIssues();
    return;
  }
  const it = e.target.closest('.issue');
  if (it && it.dataset.line) {
    setDocView('xml');
    const li = $(`#doc-xml li[data-n="${it.dataset.line}"]`);
    if (li) {
      li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      li.classList.add('flash');
      setTimeout(() => li.classList.remove('flash'), 1600);
    }
  }
});

function renderDoc() {
  const inv = $('#doc-inv');
  const r = check.report;
  $('#act-ubl').hidden = CONFIG.demo || !(check.model && check.model.syntax === 'CII');
  if (!r) {
    inv.innerHTML = '<div class="placeholder"><b>Zatiaľ žiadna faktúra</b><span>Tu sa zobrazí čitateľná podoba e-faktúry s QR kódom na úhradu.</span></div>';
    $('#doc-xml').innerHTML = '';
    return;
  }
  if (check.model) {
    inv.innerHTML = renderInvoiceHtml(check.model, { showCodes: $('#show-bt').checked, attachmentLinks: true });
  } else {
    inv.innerHTML = `<div class="placeholder"><b>Dokument nemožno zobraziť</b><span>${esc(r.issues[0]?.messageSk || r.issues[0]?.message || '')}</span></div>`;
  }
  renderXml();
}

function highlightXmlLine(s) {
  let out = '';
  const re = /(<!--.*?-->)|(<\/?[\w:.-]+)|(\s[\w:.-]+=)("[^"]*"|'[^']*')|(\/?>)|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out += `<span class="x-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="x-tag">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="x-attr">${esc(m[3])}</span><span class="x-val">${esc(m[4])}</span>`;
    else if (m[5]) out += `<span class="x-tag">${esc(m[5])}</span>`;
    else out += esc(m[6] ?? m[0]);
  }
  return out;
}

function renderXml() {
  const r = check.report;
  const hits = new Map();
  for (const i of r?.issues || []) if (i.line) hits.set(i.line, hits.get(i.line) === 'fatal' || i.flag === 'fatal' ? 'fatal' : 'warning');
  const lines = check.xml.split(/\r?\n/);
  const MAX = 4000;
  const rows = lines.slice(0, MAX).map((l, i) => {
    const n = i + 1;
    const text = l.length > 400 ? `${l.slice(0, 400)} … (${(l.length - 400).toLocaleString('sk-SK')} znakov skrátených)` : l;
    const hit = hits.get(n);
    return `<li data-n="${n}" class="${hit ? `hit ${hit}` : ''}"><span class="n">${n}</span><span>${highlightXmlLine(text)}</span></li>`;
  });
  if (lines.length > MAX) rows.push(`<li><span class="n"></span><span class="muted">… ďalších ${lines.length - MAX} riadkov</span></li>`);
  $('#doc-xml').innerHTML = `<ol>${rows.join('')}</ol>`;
}

function setDocView(v) {
  check.view = v;
  $('#doc-inv').hidden = v !== 'inv';
  $('#doc-xml').hidden = v !== 'xml';
  $$('[data-dv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dv === v)));
}
$$('[data-dv]').forEach((b) => b.addEventListener('click', () => setDocView(b.dataset.dv)));
$('#show-bt').addEventListener('change', () => {
  store.set('bt', $('#show-bt').checked);
  renderDoc();
  renderCreatorPreview();
});
$('#act-copy').addEventListener('click', () => check.xml && copyText(check.xml));
$('#act-print').addEventListener('click', () => printInvoice('view-check'));
$('#act-ubl').addEventListener('click', () => {
  if (!check.model) return;
  download(`${safeName(check.model.id)}-peppol-ubl.xml`, writeUbl(check.model, { recalculate: false }));
});

// attachments (embedded binary objects) – open only safe types
const SAFE_OPEN = new Set(['application/pdf', 'image/png', 'image/jpeg']);
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-attachment]');
  if (!b) return;
  const model = b.closest('#c-preview') ? creatorModel : check.model;
  const a = model?.attachments?.[Number(b.dataset.attachment)];
  if (!a?.content) return;
  let bytes;
  try {
    const bin = atob(a.content);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    toast('Príloha je poškodená (neplatné base64).');
    return;
  }
  const mime = SAFE_OPEN.has(a.mimeCode) ? a.mimeCode : 'application/octet-stream';
  const blob = new Blob([bytes], { type: mime });
  if (CONFIG.demo) {
    toast('V ukážkovej verzii sa prílohy neotvárajú.');
    return;
  }
  if (SAFE_OPEN.has(mime)) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else download(safeName(a.filename || a.id || 'priloha'), blob);
});

// file input + drag & drop
async function readFileAsXml(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  return decodeXml(buf);
}
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) runCheck(f.name, await readFileAsXml(f));
  e.target.value = '';
});
function setupDrop(el, onFiles) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('is-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('is-over');
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  });
}
setupDrop($('#drop'), async (files) => runCheck(files[0].name, await readFileAsXml(files[0])));
document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea') || $('#view-check').hidden) return;
  const t = e.clipboardData?.getData('text');
  if (t && t.trim().startsWith('<')) runCheck('vložené zo schránky.xml', t);
});
$$('[data-sample]').forEach((b) => b.addEventListener('click', () => {
  const s = SAMPLES[b.dataset.sample];
  runCheck(s.name, s.xml);
}));

// ---------------------------------------------------------------- creator
const UNIT_OPTIONS = [
  ['C62', 'ks'],
  ['HUR', 'hod'],
  ['DAY', 'deň'],
  ['MON', 'mes.'],
  ['KGM', 'kg'],
  ['MTR', 'm'],
  ['LTR', 'l'],
  ['LS', 'paušál'],
];
const VAT_OPTIONS = [
  ['S|23', '23 %'],
  ['S|19', '19 %'],
  ['S|5', '5 %'],
  ['E|0', '0 % oslob.'],
  ['AE|0', '0 % PDP'],
  ['K|0', '0 % EÚ'],
  ['G|0', '0 % vývoz'],
  ['O|', 'mimo DPH'],
];
const PARTY_FIELDS = [
  ['name', 'Obchodné meno', 'BT-27', 'wide'],
  ['ico', 'IČO', 'BT-30'],
  ['dic', 'DIČ', 'BT-34'],
  ['vat', 'IČ DPH', 'BT-31'],
  ['street', 'Ulica a číslo', 'BT-35', 'wide'],
  ['zip', 'PSČ', 'BT-38'],
  ['city', 'Obec', 'BT-37'],
  ['country', 'Krajina', 'BT-40'],
  ['email', 'E-mail', 'BT-43'],
];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10);

function defaultDraft() {
  const remembered = store.get('seller', null);
  const t = today();
  const year = t.slice(0, 4);
  return {
    type: '380',
    id: `${year}${String(store.get('seq', 1)).padStart(4, '0')}`,
    issue: t,
    due: addDays(t, 14),
    tax: t,
    cur: 'EUR',
    ref: '',
    prec: '',
    s: remembered?.s || { name: 'Horáreň Digital s.r.o.', ico: '54120781', dic: '2023456710', vat: 'SK2023456710', street: 'Framborská 12', zip: '010 01', city: 'Žilina', country: 'SK', email: 'fakturacia@horaren.example' },
    b: { name: 'Pekáreň Pod Hradom s.r.o.', ico: '51987309', dic: '2120987605', vat: 'SK2120987605', street: 'Mierové námestie 7', zip: '911 01', city: 'Trenčín', country: 'SK', email: 'uctaren@pekaren.example' },
    iban: remembered?.iban || 'SK68 1100 0000 0026 2987 1234',
    bic: remembered?.bic || 'TATRSKBX',
    vs: '',
    note: '',
    lines: [
      { name: 'Implementácia e-fakturácie (Peppol BIS 3.0)', qty: '24', unit: 'HUR', price: '65', vat: 'S|23' },
      { name: 'Príručka „E-faktúra v praxi“', qty: '3', unit: 'C62', price: '18.90', vat: 'S|5' },
    ],
  };
}

let draft = store.get('draft', null) || defaultDraft();
let creatorModel = null;
let creatorXml = '';
let creatorBuilt = false;

function buildCreatorForm() {
  if (creatorBuilt) return;
  creatorBuilt = true;
  for (const role of ['s', 'b']) {
    $(`[data-party="${role}"]`).innerHTML = PARTY_FIELDS.map(
      ([k, label, btc, wide]) => `<div class="field${wide ? ' wide' : ''}"><label for="c-${role}-${k}">${label} <span class="bt">${role === 'b' ? btBuyer(btc) : btc}</span></label><input id="c-${role}-${k}" data-role="${role}" data-k="${k}" autocomplete="off"><span class="hint" id="c-${role}-${k}-hint"></span></div>`,
    ).join('');
  }
  $('#cform').addEventListener('input', onCreatorInput);
  $('#cform').addEventListener('change', onCreatorInput);
  $('#c-add').addEventListener('click', () => {
    readForm();
    draft.lines.push({ name: '', qty: '1', unit: 'C62', price: '', vat: 'S|23' });
    fillLines();
    scheduleCreator();
  });
  $('#c-lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    readForm();
    draft.lines.splice(Number(b.dataset.del), 1);
    if (!draft.lines.length) draft.lines.push({ name: '', qty: '1', unit: 'C62', price: '', vat: 'S|23' });
    fillLines();
    scheduleCreator();
  });
  $('#c-dl').addEventListener('click', () => {
    if (!creatorXml) return;
    download(`${safeName(creatorModel.id)}.xml`, creatorXml);
    store.set('seq', (store.get('seq', 1) || 1) + 1);
  });
  $('#c-print').addEventListener('click', () => printInvoice('view-create'));
  $('#c-copy').addEventListener('click', () => creatorXml && copyText(creatorXml));
  $('#c-check').addEventListener('click', () => {
    if (!creatorXml) return;
    go('check');
    runCheck(`${safeName(creatorModel.id)}.xml`, creatorXml);
  });
  $('#c-reset').addEventListener('click', () => {
    const keepSeller = draft.s;
    draft = defaultDraft();
    if ($('#c-remember').checked) draft.s = keepSeller;
    fillForm();
    scheduleCreator();
  });
}

function btBuyer(code) {
  const map = { 'BT-27': 'BT-44', 'BT-30': 'BT-47', 'BT-34': 'BT-49', 'BT-31': 'BT-48', 'BT-35': 'BT-50', 'BT-38': 'BT-53', 'BT-37': 'BT-52', 'BT-40': 'BT-55', 'BT-43': 'BT-58' };
  return map[code] || code;
}

function fillLines() {
  $('#c-lines').innerHTML = draft.lines
    .map(
      (l, i) => `<div class="line-row" data-line="${i}">
      <div class="field name"><label for="c-l${i}-name">Položka ${i + 1}</label><input id="c-l${i}-name" data-l="${i}" data-k="name" value="${esc(l.name)}" placeholder="Názov tovaru alebo služby"></div>
      <div class="field"><label for="c-l${i}-qty">Množ.</label><input id="c-l${i}-qty" data-l="${i}" data-k="qty" value="${esc(l.qty)}" inputmode="decimal"></div>
      <div class="field"><label for="c-l${i}-unit">MJ</label><select id="c-l${i}-unit" data-l="${i}" data-k="unit">${UNIT_OPTIONS.map(([v, t]) => `<option value="${v}"${l.unit === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="c-l${i}-price">Cena/MJ</label><input id="c-l${i}-price" data-l="${i}" data-k="price" value="${esc(l.price)}" inputmode="decimal"></div>
      <div class="field"><label for="c-l${i}-vat">DPH</label><select id="c-l${i}-vat" data-l="${i}" data-k="vat">${VAT_OPTIONS.map(([v, t]) => `<option value="${v}"${l.vat === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Odstrániť položku ${i + 1}">✕</button>
    </div>`,
    )
    .join('');
}

function fillForm() {
  $('#c-type').value = draft.type;
  $('#c-id').value = draft.id;
  $('#c-issue').value = draft.issue;
  $('#c-due').value = draft.due;
  $('#c-tax').value = draft.tax;
  $('#c-cur').value = draft.cur;
  $('#c-ref').value = draft.ref;
  $('#c-prec').value = draft.prec || '';
  $('#c-iban').value = draft.iban;
  $('#c-bic').value = draft.bic;
  $('#c-vs').value = draft.vs;
  $('#c-note').value = draft.note;
  for (const role of ['s', 'b']) for (const [k] of PARTY_FIELDS) $(`#c-${role}-${k}`).value = draft[role]?.[k] || '';
  fillLines();
}

function readForm() {
  draft.type = $('#c-type').value;
  draft.id = $('#c-id').value.trim();
  draft.issue = $('#c-issue').value;
  draft.due = $('#c-due').value;
  draft.tax = $('#c-tax').value;
  draft.cur = $('#c-cur').value;
  draft.ref = $('#c-ref').value.trim();
  draft.prec = $('#c-prec').value.trim();
  draft.iban = $('#c-iban').value.trim();
  draft.bic = $('#c-bic').value.trim().toUpperCase();
  draft.vs = $('#c-vs').value.trim();
  draft.note = $('#c-note').value;
  for (const role of ['s', 'b']) {
    draft[role] = draft[role] || {};
    for (const [k] of PARTY_FIELDS) draft[role][k] = $(`#c-${role}-${k}`).value.trim();
  }
  draft.lines = $$('#c-lines .line-row').map((row) => {
    const g = (k) => $(`[data-k="${k}"]`, row).value;
    return { name: g('name').trim(), qty: g('qty').trim(), unit: g('unit'), price: g('price').trim(), vat: g('vat') };
  });
}

const decimalish = (v) => String(v || '').replace(/\s/g, '').replace(',', '.');

function draftToModel(d) {
  const party = (p) => ({
    name: p.name,
    legalId: p.ico ? { id: p.ico.replace(/\s/g, '') } : undefined,
    vatId: p.vat ? p.vat.replace(/\s/g, '').toUpperCase() : undefined,
    endpoint: p.dic ? { id: p.dic.replace(/\s|^SK/gi, ''), scheme: '0245' } : undefined,
    address: { line1: p.street, city: p.city, postalCode: p.zip, country: (p.country || 'SK').toUpperCase() },
    contact: p.email ? { email: p.email } : undefined,
  });
  const credit = d.type === '381';
  const vs = d.vs || (/^\d{1,10}$/.test(d.id) ? d.id : d.id.replace(/\D/g, '').slice(-10));
  const lines = d.lines
    .filter((l) => l.name || l.price)
    .map((l, i) => {
      const [cat, rate] = l.vat.split('|');
      return {
        id: String(i + 1),
        item: { name: l.name || '(bez názvu)' },
        quantity: decimalish(l.qty) || '1',
        unit: l.unit,
        price: { amount: decimalish(l.price) || '0' },
        vat: { category: cat, rate: cat === 'O' ? undefined : rate },
      };
    });
  const EXEMPT = { E: ['VATEX-EU-132', 'Oslobodené od dane'], AE: ['VATEX-EU-AE', 'Prenesenie daňovej povinnosti'], K: ['VATEX-EU-IC', 'Oslobodené dodanie tovaru do iného členského štátu'], G: ['VATEX-EU-G', 'Vývoz tovaru mimo EÚ'], O: ['VATEX-EU-O', 'Nepodlieha DPH'] };
  const cats = [...new Set(lines.map((l) => l.vat.category))];
  const model = {
    kind: credit ? 'creditnote' : 'invoice',
    typeCode: d.type,
    id: d.id,
    issueDate: d.issue,
    dueDate: d.due || undefined,
    taxPointDate: d.tax && d.tax !== d.issue ? d.tax : undefined,
    currency: d.cur,
    buyerReference: d.ref || d.id,
    notes: d.note ? [d.note] : [],
    precedingInvoices: (credit || d.type === '384') && d.prec ? [{ id: d.prec }] : [],
    seller: party(d.s || {}),
    buyer: party(d.b || {}),
    paymentMeans: d.iban ? [{ code: '30', remittanceInfo: vs || undefined, accounts: [{ id: d.iban.replace(/\s/g, '').toUpperCase(), bic: d.bic || undefined, name: d.s?.name }] }] : [],
    lines,
    vatBreakdown: cats.filter((c) => EXEMPT[c]).map((c) => ({ category: c, exemptionCode: EXEMPT[c][0], exemptionReason: EXEMPT[c][1] })),
  };
  // Not subject to VAT: no VAT identifiers allowed (BR-O-02)
  if (cats.length === 1 && cats[0] === 'O') {
    model.seller.vatId = undefined;
    model.buyer.vatId = undefined;
  }
  return calculate(model);
}

let creatorTimer;
function scheduleCreator() {
  clearTimeout(creatorTimer);
  creatorTimer = setTimeout(updateCreator, 250);
}

function onCreatorInput() {
  readForm();
  $('#c-prec-wrap').hidden = !['381', '384'].includes(draft.type);
  validateFields();
  store.set('draft', draft);
  if ($('#c-remember').checked) store.set('seller', { s: draft.s, iban: draft.iban, bic: draft.bic });
  scheduleCreator();
}

function hint(id, text, bad) {
  const h = $(`#${id}-hint`);
  if (!h) return;
  h.textContent = text || '';
  h.classList.toggle('bad', !!bad);
  $(`#${id}`)?.classList.toggle('invalid', !!bad);
}

function validateFields() {
  for (const role of ['s', 'b']) {
    const p = draft[role] || {};
    hint(`c-${role}-ico`, p.ico && !isValidIco(p.ico) ? 'Neplatný kontrolný súčet IČO' : '', p.ico && !isValidIco(p.ico));
    const dic = p.dic && checkSkDic(p.dic);
    hint(`c-${role}-dic`, dic && dic !== 'ok' ? 'DIČ má 10 číslic deliteľných 11' : p.dic ? `Peppol ID 0245:${p.dic.replace(/\s|^SK/gi, '')}` : '', dic && dic !== 'ok');
    hint(`c-${role}-vat`, p.vat && /^SK/i.test(p.vat) && !isValidSkVat(p.vat) ? 'Neplatné IČ DPH' : '', p.vat && /^SK/i.test(p.vat) && !isValidSkVat(p.vat));
  }
  const ib = $('#c-iban-hint');
  const okIban = !draft.iban || isValidIban(draft.iban);
  ib.textContent = draft.iban ? (okIban ? formatIban(draft.iban) : 'Neplatný IBAN (kontrolný súčet)') : 'Bez IBAN nebude QR kód na úhradu';
  ib.classList.toggle('bad', !okIban);
  $('#c-iban').classList.toggle('invalid', !okIban);
}

async function updateCreator() {
  try {
    creatorModel = draftToModel(draft);
    creatorXml = writeUbl(creatorModel, { recalculate: false });
  } catch (e) {
    $('#c-live').innerHTML = `<span class="muted">Nedá sa zostaviť: ${esc(e.message)}</span>`;
    return;
  }
  renderCreatorPreview();
  const report = await validator.validate(creatorXml);
  const v = verdictOf(report);
  const top = report.issues.filter((i) => i.flag !== 'info').slice(0, 4);
  $('#c-live').innerHTML = `${stampHtml(v)}<div class="live-list">${
    top.length
      ? top.map((i) => `<span class="li"><span class="rule">${esc(i.id)}</span> ${esc(i.messageSk || i.message)}</span>`).join('') + (report.issues.length > 4 ? `<span class="muted">… a ďalšie (${report.issues.length - 4}) – otvorte v kontrole</span>` : '')
      : `<span>Pripravená na odoslanie cez digitálneho poštára. <span class="muted">${report.ms} ms</span></span>`
  }</div>`;
}

function renderCreatorPreview() {
  if (!creatorModel) return;
  $('#c-preview').innerHTML = renderInvoiceHtml(creatorModel, { showCodes: $('#show-bt').checked });
}

function renderCreator() {
  buildCreatorForm();
  fillForm();
  validateFields();
  $('#c-prec-wrap').hidden = !['381', '384'].includes(draft.type);
  updateCreator();
}

// ---------------------------------------------------------------- batch
const batch = { rows: [] };

async function addBatchFiles(files) {
  const queue = [];
  for (const f of files) {
    const buf = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      try {
        for (const e of await readZip(buf)) if (/\.xml$/i.test(e.name)) queue.push({ name: `${f.name} › ${e.name}`, xml: decodeXml(e.data) });
      } catch (err) {
        batch.rows.push({ name: f.name, error: err.message });
      }
    } else queue.push({ name: f.name, xml: decodeXml(buf) });
  }
  let done = 0;
  for (const q of queue) {
    const report = await validator.validate(q.xml);
    let model = null;
    try {
      if (report.syntax) model = readInvoice(report.doc);
    } catch {
      model = null;
    }
    const v = verdictOf(report);
    batch.rows.push({ name: q.name, xml: q.xml, model, verdict: v, issues: report.issues, fatal: v.fatal || 0, warn: v.warn || 0, syntax: report.syntax });
    if (++done % 10 === 0) {
      renderBatch();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  renderBatch();
}

function signed(m, v) {
  const n = Number(v || 0);
  return m?.kind === 'creditnote' ? -n : n;
}

function renderBatch() {
  const rows = batch.rows;
  $('#b-csv').disabled = !rows.length;
  $('#b-clear').disabled = !rows.length;
  const byCur = {};
  for (const r of rows) {
    if (!r.model) continue;
    const c = r.model.currency || 'EUR';
    byCur[c] = byCur[c] || { base: 0, vat: 0, total: 0 };
    byCur[c].base += signed(r.model, r.model.totals?.taxExclusive);
    byCur[c].vat += signed(r.model, r.model.totals?.taxAmount);
    byCur[c].total += signed(r.model, r.model.totals?.payable);
  }
  const valid = rows.filter((r) => r.verdict && r.verdict.cls !== 'bad').length;
  const invalid = rows.length - valid;
  const cur = Object.keys(byCur)[0] || 'EUR';
  const sums = byCur[cur] || { base: 0, vat: 0, total: 0 };
  $('#b-stats').innerHTML = rows.length
    ? [
        ['Dokladov', rows.length.toLocaleString('sk-SK')],
        ['Platné', valid.toLocaleString('sk-SK')],
        ['Neplatné', invalid.toLocaleString('sk-SK')],
        [`Základ dane (${cur})`, money(sums.base.toFixed(2), cur)],
        [`DPH (${cur})`, money(sums.vat.toFixed(2), cur)],
        [`K úhrade (${cur})`, money(sums.total.toFixed(2), cur)],
      ]
        .map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`)
        .join('')
    : '';
  if (!rows.length) {
    $('#b-table').innerHTML = '<tbody><tr><td class="muted" style="padding:28px;text-align:center">Zatiaľ žiadne doklady. Nahrajte XML súbory alebo ZIP archív.</td></tr></tbody>';
    return;
  }
  const body = rows
    .map((r, i) => {
      const m = r.model;
      if (!m) return `<tr><td>${esc(r.name)}</td><td colspan="8" class="muted">${esc(r.error || r.issues?.[0]?.messageSk || 'Nečitateľný dokument')}</td><td><span class="pill bad">chyba</span></td></tr>`;
      const pill = r.verdict.cls === 'bad' ? `<span class="pill bad">${r.fatal} ${plural(r.fatal, 'chyba', 'chyby', 'chýb')}</span>` : r.verdict.cls === 'warn' ? `<span class="pill warn">platná · ${r.warn} pripom.</span>` : '<span class="pill ok">platná</span>';
      return `<tr class="clickable" data-row="${i}">
        <td>${esc(r.name)}</td><td>${m.kind === 'creditnote' ? 'dobropis' : 'faktúra'} <span class="muted">${esc(r.syntax)}</span></td>
        <td class="mono">${esc(m.id)}</td><td>${esc(m.seller?.name)}</td><td>${esc(m.buyer?.name)}</td><td>${date(m.issueDate)}</td>
        <td class="r">${money(m.totals?.taxExclusive, m.currency)}</td><td class="r">${money(m.totals?.taxAmount, m.currency)}</td><td class="r">${money(m.totals?.payable, m.currency)}</td><td>${pill}</td></tr>`;
    })
    .join('');
  $('#b-table').innerHTML = `<thead><tr><th>Súbor</th><th>Doklad</th><th>Číslo</th><th>Dodávateľ</th><th>Odberateľ</th><th>Vystavená</th><th class="r">Bez DPH</th><th class="r">DPH</th><th class="r">Spolu</th><th>Stav</th></tr></thead><tbody>${body}</tbody>`;
}

$('#bfile').addEventListener('change', (e) => {
  addBatchFiles([...e.target.files]);
  e.target.value = '';
});
setupDrop($('#bdrop'), addBatchFiles);
$('#b-clear').addEventListener('click', () => {
  batch.rows = [];
  renderBatch();
});
$('#b-table').addEventListener('click', (e) => {
  const tr = e.target.closest('[data-row]');
  if (!tr) return;
  const r = batch.rows[Number(tr.dataset.row)];
  go('check');
  runCheck(r.name, r.xml);
});
$('#b-csv').addEventListener('click', () => {
  const head = ['Súbor', 'Doklad', 'Číslo', 'Dátum vystavenia', 'Splatnosť', 'Dodávateľ', 'IČ DPH dodávateľa', 'Odberateľ', 'IČ DPH odberateľa', 'Mena', 'Základ', 'DPH', 'Spolu', 'K úhrade', 'Stav', 'Chyby'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const num = (v) => (v === undefined || v === null || v === '' ? '' : String(v).replace('.', ','));
  const lines = [head.map(q).join(';')];
  for (const r of batch.rows) {
    const m = r.model || {};
    lines.push(
      [r.name, m.kind === 'creditnote' ? 'dobropis' : 'faktúra', m.id, m.issueDate, m.dueDate, m.seller?.name, m.seller?.vatId, m.buyer?.name, m.buyer?.vatId, m.currency, num(m.totals?.taxExclusive), num(m.totals?.taxAmount), num(m.totals?.taxInclusive), num(m.totals?.payable), r.verdict?.cls === 'bad' ? 'neplatná' : 'platná', (r.issues || []).filter((i) => i.flag === 'fatal').map((i) => i.id).join(' ')]
        .map(q)
        .join(';'),
    );
  }
  download(`revizor-kontrola-${today()}.csv`, `﻿${lines.join('\r\n')}`, 'text/csv');
});

// ---------------------------------------------------------------- about
async function countRules() {
  for (const prefix of ['CEN-EN16931', 'PEPPOL-EN16931']) {
    const [u, c] = await Promise.all([validator.pack(`${prefix}-UBL`), validator.pack(`${prefix}-CII`)]);
    const el = $(`[data-count="${prefix}"]`);
    if (el) el.textContent = `${u.assertCount.toLocaleString('sk-SK')} + ${c.assertCount.toLocaleString('sk-SK')}`;
  }
}

function renderAbout() {
  const packs = [
    ['CEN EN 16931', 'Európska norma – sémantický model a výpočty (BR-*, BR-CO-*, BR-S-*…)', 'CEN-EN16931'],
    ['Peppol BIS 3.0', 'Pravidlá siete Peppol, cez ktorú od 1. 1. 2027 posielajú faktúry digitálni poštári', 'PEPPOL-EN16931'],
    ['Revízor SK', 'IČ DPH, DIČ v tvare 0245, IBAN, IČO, slovenské sadzby DPH 23/19/5 %', 'SK'],
  ];
  $('#view-about').innerHTML = `
    <div>
      <h1>Oficiálne pravidlá. Priamo v prehliadači.</h1>
      <p>Od 1. januára 2027 musia platitelia DPH na Slovensku vystavovať faktúry výhradne elektronicky (zákon č. 385/2025 Z. z.) vo formáte podľa EN 16931 / Peppol BIS 3.0. Revízor vám ukáže, či vaša faktúra prejde – skôr, ako ju odmietne odberateľ alebo digitálny poštár.</p>
    </div>
    <div class="layers">${packs.map(([k, d, id]) => `<div class="layer"><b>${k}</b><span>${d}</span><span class="n" data-count="${id}">${id === 'SK' ? '9' : '…'}</span></div>`).join('')}</div>
    <p class="muted" style="margin:0">Čísla: počet kontrolných pravidiel pre syntax UBL + CII. Oficiálne súbory pravidiel (Schematron) sú vložené bez úprav a vyhodnocuje ich vlastný XPath 2.0 engine Revízora – výsledky sa zhodujú s referenčným validátorom (Saxon) na tisícoch testovacích faktúr.</p>
    <div class="about-grid">
      <div class="about-card"><h3>Kontrola</h3><p>Pretiahnite XML a do sekundy uvidíte, či je faktúra platná. Každé zistenie je vysvetlené po slovensky, s kódom pravidla a presným riadkom v XML.</p></div>
      <div class="about-card"><h3>Čitateľná faktúra</h3><p>Z XML vznikne prehľadný doklad s rozpisom DPH a QR kódom PAY by square – stačí naskenovať v bankovej aplikácii a zaplatiť.</p></div>
      <div class="about-card"><h3>Vystavenie</h3><p>Formulár vytvorí platnú e-faktúru Peppol UBL so všetkými výpočtami podľa EN 16931 (zaokrúhľovanie, rozpis DPH, Peppol ID 0245:DIČ).</p></div>
      <div class="about-card"><h3>Hromadne</h3><p>Stovky faktúr naraz, aj zo ZIP archívu. Súčty základu dane a DPH a export do Excelu pre účtovníkov a audítorov.</p></div>
      <div class="about-card"><h3>Súkromie</h3><p>Nič sa neodosiela na server. Faktúry spracúva výhradne váš prehliadač, aplikácia funguje aj bez internetu.</p></div>
      <div class="about-card"><h3>Formáty</h3><p>UBL 2.1 faktúra a dobropis (Peppol BIS 3.0), UN/CEFACT CII (ZUGFeRD/Factur-X XML, XRechnung). CII faktúru Revízor prevedie do Peppol UBL.</p></div>
    </div>
    <p class="muted" style="margin:0">Revízor nie je digitálny poštár (poskytovateľ doručovacej služby) – faktúry neodosiela. Pravidlá: ${esc(CONFIG.rulesVersion)} (© CEN a OpenPeppol, licencia EUPL 1.2). ${CONFIG.contact ? `Kontakt: ${esc(CONFIG.contact)}` : ''}</p>`;
}

// ---------------------------------------------------------------- boot
function boot() {
  const style = document.createElement('style');
  style.textContent = INVOICE_CSS;
  document.head.append(style);
  $$('[data-brand]').forEach((e) => {
    e.textContent = CONFIG.brand;
  });
  $$('[data-tagline]').forEach((e) => {
    e.textContent = CONFIG.tagline;
  });
  if (CONFIG.demo) {
    $$('.dl-only').forEach((e) => {
      e.hidden = true;
    });
    $('#demo-note').hidden = false;
  }
  $('#show-bt').checked = !!store.get('bt', false);
  renderAbout();
  renderBatch();
  const fromHash = Object.entries(HASH).find(([, h]) => location.hash === `#${h}`)?.[0];
  go(fromHash || 'check', { push: false });
  renderVerdict();
  renderIssues();
  renderDoc();
  // open in a working state: the "broken" sample shows what Revízor does best
  runCheck(SAMPLES.chyby.name, SAMPLES.chyby.xml);
}

boot();

export { term };
