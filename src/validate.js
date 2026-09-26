// High-level validation facade: XML well-formedness + official EN 16931 /
// Peppol BIS 3.0 Schematron (+ optional UBL structure and SK checks).
import { parseXml, XmlError } from './xml/parser.js';
import { compileSchematron, runSchematron } from './schematron/schematron.js';
import { detectDocument } from './model/ns.js';
import { translateRule } from './i18n/rules-sk.js';

export const RULE_SETS = {
  UBL: ['CEN-EN16931-UBL', 'PEPPOL-EN16931-UBL'],
  CII: ['CEN-EN16931-CII', 'PEPPOL-EN16931-CII'],
};

/**
 * Create a validator.
 * @param {(name: string) => Promise<string>|string} loadRules returns .sch source for a rule set name
 * @param {{extraChecks?: Array<(doc, syntax) => Array>}} [opts]
 */
export function createValidator(loadRules, opts = {}) {
  const packs = new Map();
  async function pack(name) {
    if (!packs.has(name)) {
      packs.set(
        name,
        Promise.resolve(loadRules(name)).then((src) => compileSchematron(src, { name })),
      );
    }
    return packs.get(name);
  }

  /**
   * Validate an invoice.
   * @param {string} xml
   * @param {{lang?: 'sk'|'en', only?: string[]}} [o]
   */
  async function validate(xml, o = {}) {
    const started = Date.now();
    const report = { ok: false, syntax: null, kind: null, issues: [], ruleSets: [], engineErrors: [], ms: 0 };
    let doc;
    try {
      doc = typeof xml === 'string' ? parseXml(xml) : xml;
    } catch (e) {
      if (!(e instanceof XmlError)) throw e;
      report.issues.push({ id: 'XML', flag: 'fatal', message: e.message, messageSk: `XML nie je správne formovaný: ${e.message}`, line: e.line, location: null, source: 'XML' });
      report.ms = Date.now() - started;
      return report;
    }
    const { syntax, kind } = detectDocument(doc);
    report.syntax = syntax;
    report.kind = kind;
    report.doc = doc;
    if (!syntax) {
      report.issues.push({ id: 'DOC', flag: 'fatal', message: `Unsupported root element <${doc.root.name}>`, messageSk: `Nepodporovaný dokument <${doc.root.name}>. Očakávaná UBL faktúra/dobropis alebo CII faktúra.`, location: '/', source: 'DOC' });
      report.ms = Date.now() - started;
      return report;
    }
    const names = RULE_SETS[syntax].filter((n) => !o.only || o.only.includes(n));
    for (const name of names) {
      const p = await pack(name);
      const r = runSchematron(p, doc, { source: name });
      report.ruleSets.push({ name, asserts: p.assertCount, fired: r.fired });
      for (const f of r.failed) report.issues.push({ ...f, messageSk: translateRule(f.id, f.message) });
      for (const e of r.errors) report.engineErrors.push({ ...e, source: name });
    }
    for (const check of opts.extraChecks || []) {
      for (const f of check(doc, syntax)) report.issues.push(f);
    }
    report.issues.sort((a, b) => rank(a.flag) - rank(b.flag) || (a.line || 0) - (b.line || 0));
    report.fatal = report.issues.filter((i) => i.flag === 'fatal' || i.flag === 'error').length;
    report.warnings = report.issues.length - report.fatal;
    report.ok = report.fatal === 0 && report.engineErrors.length === 0;
    report.ms = Date.now() - started;
    return report;
  }

  return { validate, pack };
}

function rank(flag) {
  return flag === 'fatal' || flag === 'error' ? 0 : flag === 'warning' ? 1 : 2;
}
