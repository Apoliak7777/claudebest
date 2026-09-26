#!/usr/bin/env node
// Parity test: runs the official Schematron rules through (a) the reference
// Saxon/SchXslt XSLT pipeline and (b) Revízor's JS engine on a corpus of valid
// and deliberately broken invoices, and diffs the failed assertions rule by rule.
//
// Usage:
//   node scripts/parity.mjs --ref <dir with saxon-he.jar, xmlresolver.jar, ref-*.xslt> \
//       --corpus <dir> [--mutants 300] [--seed 42] [--syntax UBL|CII]
//
// See scripts/reference/setup.sh for building the reference directory.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseXml, ELEMENT, TEXT } from '../src/xml/parser.js';
import { compileSchematron, runSchematron } from '../src/schematron/schematron.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const REF = args.ref;
const CORPUS = args.corpus;
const N = Number(args.mutants || 200);
const SYNTAX = (args.syntax || 'UBL').toUpperCase();
const GOLDEN = args['emit-golden'] || null; // write cases + reference results as test fixtures
let seed = Number(args.seed || 42);
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

if (!REF || !CORPUS) {
  console.error('Použitie: node scripts/parity.mjs --ref <dir> --corpus <dir> [--mutants N] [--syntax UBL|CII]');
  process.exit(2);
}

const RULES = SYNTAX === 'CII' ? ['CEN-EN16931-CII', 'PEPPOL-EN16931-CII'] : ['CEN-EN16931-UBL', 'PEPPOL-EN16931-UBL'];
const work = join(REF, `parity-${SYNTAX}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'in'), { recursive: true });

// ---------- corpus + mutants ----------
const bases = readdirSync(CORPUS)
  .filter((f) => /\.xml$/i.test(f))
  .map((f) => ({ name: f, src: readFileSync(join(CORPUS, f), 'utf8') }))
  .filter((b) => (SYNTAX === 'CII' ? b.src.includes('CrossIndustryInvoice') : !b.src.includes('CrossIndustryInvoice')));

function allElements(doc) {
  const out = [];
  const walk = (e) => {
    for (const c of e.children) if (c.kind === ELEMENT) {
      out.push(c);
      walk(c);
    }
  };
  walk(doc.root);
  return out;
}

function leafText(src, el) {
  if (el.children.length !== 1 || el.children[0].kind !== TEXT) return null;
  const s = src.indexOf('>', el.offset) + 1;
  const e = src.lastIndexOf('</', el.endOffset);
  return { s, e, text: src.slice(s, e) };
}

function mutate(src) {
  const doc = parseXml(src);
  const els = allElements(doc);
  const el = pick(els);
  const kind = pick(['delete', 'delete', 'text', 'text', 'text', 'dup', 'attr', 'empty']);
  if (kind === 'delete') return { src: src.slice(0, el.offset) + src.slice(el.endOffset), what: `delete ${el.name}` };
  if (kind === 'dup') return { src: src.slice(0, el.endOffset) + src.slice(el.offset, el.endOffset) + src.slice(el.endOffset), what: `dup ${el.name}` };
  if (kind === 'empty') {
    const lt = leafText(src, el);
    if (!lt) return { src, what: 'noop' };
    return { src: src.slice(0, lt.s) + src.slice(lt.e), what: `empty ${el.name}` };
  }
  if (kind === 'attr') {
    const a = el.attrs.filter((x) => !x.isNsDecl);
    if (!a.length) return { src, what: 'noop' };
    const at = pick(a);
    const val = pick(['XXX', 'USD', '9999', 'EUR', '0088', 'C62', 'ZZZ', '']);
    const start = src.indexOf(`${at.name}=`, el.offset);
    const q = src[start + at.name.length + 1];
    const vs = start + at.name.length + 2;
    const ve = src.indexOf(q, vs);
    return { src: src.slice(0, vs) + val + src.slice(ve), what: `attr ${el.name}/@${at.name}=${val}` };
  }
  const lt = leafText(src, el);
  if (!lt) return { src, what: 'noop' };
  const t = lt.text.trim();
  let nv;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    nv = pick([String(n + 1), String(n * 10), String(-n), `${t}1`, '0', (n + 0.005).toFixed(3), (n / 3).toFixed(4)]);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    nv = pick(['2019-13-45', '2031-01-01', '2000-01-01', '20190125']);
  } else {
    nv = pick(['XX', 'S', 'Z', 'E', 'AE', 'VAT', '380', '381', '0088', 'SK2020000000', 'false', 'true', '30', '58', 'X'.repeat(3)]);
  }
  return { src: src.slice(0, lt.s) + nv + src.slice(lt.e), what: `text ${el.name}=${nv}` };
}

const cases = [];
for (const b of bases) cases.push({ name: `base-${b.name}`, src: b.src, what: 'original' });
for (let i = 0; i < N; i++) {
  const b = pick(bases);
  let cur = { src: b.src, what: [] };
  const k = 1 + Math.floor(rand() * 3);
  for (let j = 0; j < k; j++) {
    const m = mutate(cur.src);
    try {
      parseXml(m.src); // keep only well-formed mutants
    } catch {
      continue;
    }
    cur = { src: m.src, what: cur.what.concat(m.what) };
  }
  cases.push({ name: `mut-${String(i).padStart(4, '0')}-${basename(b.name, '.xml')}.xml`, src: cur.src, what: cur.what.join('; ') });
}
for (const c of cases) writeFileSync(join(work, 'in', c.name), c.src);

// ---------- reference run ----------
const cp = `${join(REF, 'saxon-he.jar')}:${join(REF, 'xmlresolver.jar')}`;
function refRun(rule) {
  const out = join(work, `out-${rule}`);
  mkdirSync(out, { recursive: true });
  const results = new Map();
  // run file by file so that a dynamic error in one file is attributable
  // (batch mode aborts on first failure)
  try {
    execFileSync('java', ['-cp', cp, 'net.sf.saxon.Transform', `-s:${join(work, 'in')}`, `-xsl:${join(REF, `ref-${rule}.xslt`)}`, `-o:${out}`], { stdio: 'pipe' });
  } catch {
    // fall back to per-file for crashing files below
  }
  for (const c of cases) {
    const f = join(out, c.name);
    let svrl;
    if (existsSync(f)) svrl = readFileSync(f, 'utf8');
    else {
      try {
        svrl = execFileSync('java', ['-cp', cp, 'net.sf.saxon.Transform', `-s:${join(work, 'in', c.name)}`, `-xsl:${join(REF, `ref-${rule}.xslt`)}`], { stdio: 'pipe' }).toString();
      } catch (e) {
        results.set(c.name, { crash: String(e.stderr || e.message).split('\n').filter((l) => !l.startsWith('Picked up')).slice(0, 2).join(' ') });
        continue;
      }
    }
    const ids = [];
    for (const m of svrl.matchAll(/<svrl:failed-assert\b([^>]*)>/g)) {
      const id = /\bid="([^"]*)"/.exec(m[1]);
      const flag = /\bflag="([^"]*)"/.exec(m[1]);
      ids.push(`${flag ? flag[1] : '?'}:${id ? id[1] : '?'}`);
    }
    for (const m of svrl.matchAll(/<svrl:successful-report\b([^>]*)>/g)) {
      const id = /\bid="([^"]*)"/.exec(m[1]);
      ids.push(`report:${id ? id[1] : '?'}`);
    }
    results.set(c.name, { ids: ids.sort() });
  }
  return results;
}

// ---------- JS run ----------
const packs = RULES.map((r) => compileSchematron(readFileSync(new URL(`../rules/${r}.sch`, import.meta.url), 'utf8'), { name: r }));

let mismatches = 0;
let crashesBoth = 0;
let total = 0;
const t0 = Date.now();
const ref = RULES.map((r) => refRun(r));
const refMs = Date.now() - t0;
let jsMs = 0;
for (const c of cases) {
  let doc;
  try {
    doc = parseXml(c.src);
  } catch (e) {
    continue; // not well-formed (cannot happen with our mutations, but be safe)
  }
  RULES.forEach((rule, i) => {
    total++;
    const t1 = Date.now();
    const r = runSchematron(packs[i], doc);
    jsMs += Date.now() - t1;
    const mine = r.failed.map((f) => (f.kind === 'report' ? `report:${f.id}` : `${f.flag}:${f.id}`)).sort();
    const theirs = ref[i].get(c.name);
    if (theirs.crash) {
      if (r.errors.length) crashesBoth++;
      else {
        mismatches++;
        console.log(`✗ ${c.name} [${rule}] referencia spadla (${theirs.crash}); JS bez chyby. (${c.what})`);
      }
      return;
    }
    const a = mine.join(',');
    const b = theirs.ids.join(',');
    if (a !== b || r.errors.length) {
      mismatches++;
      const onlyMine = mine.filter((x) => !theirs.ids.includes(x));
      const onlyRef = theirs.ids.filter((x) => !mine.includes(x));
      console.log(`✗ ${c.name} [${rule}] (${c.what})\n    iba JS: ${onlyMine.join(' ') || '-'}\n    iba ref: ${onlyRef.join(' ') || '-'}${r.errors.length ? `\n    JS chyby: ${r.errors.slice(0, 3).map((e) => `${e.where}: ${e.message}`).join(' | ')}` : ''}`);
    }
  });
}
if (GOLDEN) {
  mkdirSync(GOLDEN, { recursive: true });
  const expected = {};
  for (const c of cases) {
    const r = RULES.map((rule, i) => ref[i].get(c.name));
    if (r.some((x) => x.crash)) continue; // reference aborted: not a stable fixture
    writeFileSync(join(GOLDEN, c.name), c.src);
    expected[c.name] = { what: c.what, failed: Object.fromEntries(RULES.map((rule, i) => [rule, r[i].ids])) };
  }
  writeFileSync(join(GOLDEN, 'expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
  console.log(`Golden fixtures: ${Object.keys(expected).length} → ${GOLDEN}`);
}
console.log(`\nPrípady: ${cases.length}, behy: ${total}, nezhody: ${mismatches}, oba spadli: ${crashesBoth}`);
console.log(`Čas: referencia ${refMs} ms, JS ${jsMs} ms`);
process.exit(mismatches ? 1 : 0);
