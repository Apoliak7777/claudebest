// ISO Schematron (queryBinding xslt2) compiler + runner on top of the in-house
// XPath 2.0 engine. Loads the official, unmodified CEN / Peppol .sch files.
import { parseXml, ELEMENT, TEXT, ATTRIBUTE, DOCUMENT, stringValue, nodeLocation } from '../xml/parser.js';
import { parseXPath } from '../xpath/parse.js';
import { evaluate, Context, lazy } from '../xpath/eval.js';
import { XPathError, ebv, atomize, castAs, str, unt, itemToString, isNode } from '../xpath/types.js';

const SCH = 'http://purl.oclc.org/dsdl/schematron';
const XSL = 'http://www.w3.org/1999/XSL/Transform';

function kids(el, ns, local) {
  return el.children.filter((c) => c.kind === ELEMENT && c.ns === ns && (!local || c.local === local));
}
const at = (el, name) => {
  const a = el.attrs.find((x) => x.name === name);
  return a ? a.value : undefined;
};

/**
 * Compile a Schematron document (string) into an executable rule pack.
 * @param {string} schSource
 * @param {{name?: string}} [opts]
 */
export function compileSchematron(schSource, opts = {}) {
  const doc = parseXml(schSource);
  const schema = doc.root;
  if (schema.ns !== SCH || schema.local !== 'schema') throw new Error('Nie je to ISO Schematron');
  const ns = {};
  for (const n of kids(schema, SCH, 'ns')) ns[at(n, 'prefix')] = at(n, 'uri');
  // prefixes declared on the schema element itself (e.g. xmlns:u="utils") for function names
  const xp = (expr) => parseXPath(expr, ns);

  const titleEl = kids(schema, SCH, 'title')[0];
  const pack = {
    name: opts.name || (titleEl ? stringValue(titleEl).trim() : 'schematron'),
    ns,
    lets: [],
    functions: [],
    patterns: [],
  };

  const compileLet = (l) => {
    const value = at(l, 'value');
    return { name: at(l, 'name'), expr: value !== undefined ? xp(value) : null, text: value === undefined ? stringValue(l) : null };
  };

  for (const el of schema.children) {
    if (el.kind !== ELEMENT) continue;
    if (el.ns === SCH && el.local === 'let') pack.lets.push(compileLet(el));
    else if (el.ns === XSL && el.local === 'function') pack.functions.push(compileXslFunction(el, xp));
  }

  for (const p of kids(schema, SCH, 'pattern')) {
    if (at(p, 'abstract') === 'true') throw new Error('Abstraktné vzory nie sú podporované');
    const pattern = { id: at(p, 'id') || null, lets: [], rules: [] };
    for (const el of p.children) {
      if (el.kind !== ELEMENT || el.ns !== SCH) continue;
      if (el.local === 'let') pattern.lets.push(compileLet(el));
      if (el.local !== 'rule') continue;
      const ctxSrc = at(el, 'context');
      const rule = { context: ctxSrc, contextAst: anchorContext(xp(ctxSrc)), lets: [], checks: [] };
      for (const c of el.children) {
        if (c.kind !== ELEMENT || c.ns !== SCH) continue;
        if (c.local === 'let') rule.lets.push(compileLet(c));
        else if (c.local === 'assert' || c.local === 'report') {
          const test = at(c, 'test');
          rule.checks.push({
            kind: c.local,
            id: at(c, 'id') || null,
            flag: at(c, 'flag') || at(c, 'role') || 'error',
            test,
            testAst: xp(test),
            message: compileMessage(c, xp),
          });
        }
      }
      pattern.rules.push(rule);
    }
    pack.patterns.push(pattern);
  }
  pack.assertCount = pack.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  return pack;
}

function compileMessage(el, xp) {
  const parts = [];
  for (const c of el.children) {
    if (c.kind === TEXT) parts.push(c.value);
    else if (c.kind === ELEMENT && c.ns === SCH && c.local === 'value-of') parts.push({ expr: xp(at(c, 'select')) });
    else if (c.kind === ELEMENT && c.ns === SCH && c.local === 'name') parts.push({ expr: xp(at(c, 'path') || 'name()') });
    else if (c.kind === ELEMENT) parts.push(stringValue(c));
  }
  return parts;
}

// Turn an XSLT match pattern into an expression selecting all matching nodes.
function anchorContext(ast) {
  switch (ast.type) {
    case 'union':
      return { type: 'union', left: anchorContext(ast.left), right: anchorContext(ast.right) };
    case 'paren':
      return anchorContext(ast.expr);
    case 'root':
      return ast;
    case 'slash':
    case 'dslash':
      if (isAbsolute(ast)) return ast;
      return { ...ast, left: anchorContext(ast.left) };
    default:
      return { type: 'dslash', left: { type: 'root' }, right: ast };
  }
}

function isAbsolute(ast) {
  if (ast.type === 'root') return true;
  if (ast.type === 'slash' || ast.type === 'dslash') return isAbsolute(ast.left);
  return false;
}

// ---- xsl:function subset: param, variable, sequence, value-of, choose/when/otherwise ----
function compileXslFunction(el, xp) {
  const name = at(el, 'name');
  const params = [];
  const body = [];
  for (const c of el.children) {
    if (c.kind !== ELEMENT || c.ns !== XSL) continue;
    if (c.local === 'param') params.push({ name: at(c, 'name'), as: at(c, 'as') || null });
    else body.push(compileInstr(c, xp));
  }
  return { name, params, body, as: at(el, 'as') || null };
}

function compileInstr(c, xp) {
  switch (c.local) {
    case 'variable': {
      const select = at(c, 'select');
      const inner = c.children.filter((x) => x.kind === ELEMENT && x.ns === XSL).map((x) => compileInstr(x, xp));
      return { op: 'variable', name: at(c, 'name'), as: at(c, 'as') || null, expr: select ? xp(select) : null, body: inner, text: select ? null : stringValue(c) };
    }
    case 'sequence':
    case 'value-of':
      return { op: c.local, expr: xp(at(c, 'select')) };
    case 'choose': {
      const whens = [];
      let otherwise = null;
      for (const w of c.children) {
        if (w.kind !== ELEMENT || w.ns !== XSL) continue;
        const body = w.children.filter((x) => x.kind === ELEMENT && x.ns === XSL).map((x) => compileInstr(x, xp));
        if (w.local === 'when') whens.push({ test: xp(at(w, 'test')), body });
        else if (w.local === 'otherwise') otherwise = body;
      }
      return { op: 'choose', whens, otherwise };
    }
    default:
      throw new Error(`Nepodporovaná XSLT inštrukcia xsl:${c.local}`);
  }
}

function convertParam(seq, as) {
  if (!as) return seq;
  const optional = as.endsWith('?');
  const type = as.replace(/[?*+]$/, '');
  if (type === 'item()' || type === 'node()') return seq;
  const a = atomize(seq);
  if (a.length === 0) {
    if (optional || as.endsWith('*')) return [];
    throw new XPathError('XPTY0004', `Prázdna sekvencia pre parameter typu ${as}`);
  }
  return a.map((x) => {
    if (x.t === 'xs:untypedAtomic') return castAs(x, type);
    if (type === 'xs:decimal' && (x.t === 'xs:integer' || x.t === 'xs:decimal')) return x.t === 'xs:decimal' ? x : { t: 'xs:decimal', v: x.v };
    if (type === 'xs:decimal' && x.t === 'xs:double') return castAs(x, type);
    if (type === 'xs:string' && x.t !== 'xs:string') return castAs(x, type);
    if (type === 'xs:integer' && x.t !== 'xs:integer') return castAs(x, type);
    return x;
  });
}

function runBody(body, ctx) {
  let out = [];
  let c = ctx;
  for (const ins of body) {
    switch (ins.op) {
      case 'variable': {
        let v;
        if (ins.expr) v = evaluate(ins.expr, c);
        else if (ins.body.length) v = runBody(ins.body, c);
        else v = [unt(ins.text)];
        if (ins.as) v = convertParam(v, ins.as);
        c = c.bind(ins.name, v);
        break;
      }
      case 'sequence':
        out = out.concat(evaluate(ins.expr, c));
        break;
      case 'value-of':
        out.push(str(atomize(evaluate(ins.expr, c)).map((a) => itemToString(a)).join(' ')));
        break;
      case 'choose': {
        const w = ins.whens.find((x) => ebv(evaluate(x.test, c)));
        const b = w ? w.body : ins.otherwise;
        if (b) out = out.concat(runBody(b, c));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function buildFunctions(pack) {
  const fns = Object.create(null);
  for (const f of pack.functions) {
    fns[f.name] = (args, ctx) => {
      let c = new Context(ctx.item, Object.create(null), fns, ctx.root);
      f.params.forEach((p, i) => {
        c = c.bind(p.name, convertParam(args[i] || [], p.as));
      });
      const r = runBody(f.body, c);
      return f.as ? convertParam(r, f.as) : r;
    };
  }
  return fns;
}

/** XPath-ish location path of a node, e.g. /Invoice/cac:InvoiceLine[2]/cbc:ID */
export function locationPath(node) {
  if (!node || node.kind === DOCUMENT) return '/';
  const parts = [];
  for (let n = node; n && n.kind !== DOCUMENT; n = n.parent) {
    if (n.kind === ATTRIBUTE) parts.unshift(`@${n.name}`);
    else if (n.kind === ELEMENT) {
      const sibs = n.parent.children.filter((s) => s.kind === ELEMENT && s.name === n.name);
      parts.unshift(sibs.length > 1 ? `${n.name}[${sibs.indexOf(n) + 1}]` : n.name);
    } else parts.unshift('text()');
  }
  return `/${parts.join('/')}`;
}

function evalLets(lets, ctx) {
  let c = ctx;
  for (const l of lets) {
    const scope = c;
    c = c.bind(l.name, lazy(() => (l.expr ? evaluate(l.expr, scope) : [unt(l.text)])));
  }
  return c;
}

function renderMessage(parts, ctx) {
  let s = '';
  for (const p of parts) {
    if (typeof p === 'string') s += p;
    else {
      try {
        s += atomize(evaluate(p.expr, ctx)).map(itemToString).join(' ');
      } catch {
        s += '?';
      }
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Run a compiled pack against a parsed document.
 * @returns {{failed: Array, errors: Array, fired: number}}
 */
export function runSchematron(pack, doc, { source } = {}) {
  const fns = buildFunctions(pack);
  let ctx = new Context(doc, Object.create(null), fns, doc);
  const failed = [];
  const errors = [];
  let fired = 0;
  try {
    ctx = evalLets(pack.lets, ctx);
  } catch (e) {
    errors.push({ where: 'let', message: e.message });
  }
  for (const pattern of pack.patterns) {
    let pctx = ctx;
    try {
      pctx = evalLets(pattern.lets, ctx);
    } catch (e) {
      errors.push({ where: 'pattern-let', message: e.message });
    }
    // node -> index of the first rule matching it within the pattern
    const firstRule = new Map();
    const mctx = pctx.with(doc, 1, 1);
    mctx.patternMode = true;
    pattern.rules.forEach((rule, ri) => {
      let nodes;
      try {
        nodes = evaluate(rule.contextAst, mctx);
      } catch (e) {
        errors.push({ where: `context ${rule.context}`, message: e.message });
        return;
      }
      for (const n of nodes) if (isNode(n) && !firstRule.has(n)) firstRule.set(n, ri);
    });
    const ordered = [...firstRule.keys()].sort((a, b) => a.order - b.order);
    for (const node of ordered) {
      const rule = pattern.rules[firstRule.get(node)];
      fired++;
      let rctx = pctx.with(node, 1, 1);
      try {
        rctx = evalLets(rule.lets, rctx);
      } catch (e) {
        errors.push({ where: `let @ ${rule.context}`, message: e.message, location: locationPath(node) });
        continue;
      }
      for (const chk of rule.checks) {
        let ok;
        try {
          const v = ebv(evaluate(chk.testAst, rctx));
          ok = chk.kind === 'assert' ? v : !v;
        } catch (e) {
          errors.push({ where: chk.id || chk.test, id: chk.id, message: e.message, location: locationPath(node) });
          continue;
        }
        if (!ok) {
          const loc = nodeLocation(node.kind === ATTRIBUTE ? node.parent : node);
          failed.push({
            id: chk.id,
            flag: chk.flag,
            kind: chk.kind,
            test: chk.test,
            message: renderMessage(chk.message, rctx),
            location: locationPath(node),
            line: loc ? loc.line : null,
            source: source || pack.name,
          });
        }
      }
    }
  }
  return { failed, errors, fired };
}
