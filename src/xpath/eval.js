// XPath 2.0 evaluator over the lightweight tree produced by src/xml/parser.js.
import { parseXPath, REVERSE_AXES } from './parse.js';
import {
  XPathError, isNode, atomize, atomizeItem, ebv, arithmetic, negate, generalCompareAtomic, valueCompare,
  castAs, castable, str, dbl, int, dec, bool, TRUE, FALSE, INT, DEC, DBL, isNumeric,
  ELEMENT, ATTRIBUTE, TEXT, DOCUMENT, COMMENT, PI,
} from './types.js';
import { FUNCTIONS } from './functions.js';
import { Decimal } from '../model/decimal.js';

// ---------- node ordering ----------

function docOrderSort(nodes) {
  if (nodes.length < 2) return nodes;
  const seen = new Set();
  const out = [];
  for (const n of nodes) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

// ---------- axes ----------

function pushDescendants(node, out) {
  const ch = node.children;
  if (!ch) return;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    out.push(c);
    if (c.kind === ELEMENT) pushDescendants(c, out);
  }
}

function axisNodes(axis, node) {
  switch (axis) {
    case 'child':
      return node.children || [];
    case 'attribute':
      return node.kind === ELEMENT ? node.attrs.filter((a) => !a.isNsDecl) : [];
    case 'self':
      return [node];
    case 'parent':
      return node.parent ? [node.parent] : [];
    case 'descendant': {
      const out = [];
      pushDescendants(node, out);
      return out;
    }
    case 'descendant-or-self': {
      const out = [node];
      pushDescendants(node, out);
      return out;
    }
    case 'ancestor': {
      const out = [];
      for (let p = node.parent; p; p = p.parent) out.push(p);
      return out;
    }
    case 'ancestor-or-self': {
      const out = [node];
      for (let p = node.parent; p; p = p.parent) out.push(p);
      return out;
    }
    case 'following-sibling': {
      if (!node.parent || node.kind === ATTRIBUTE) return [];
      const sib = node.parent.children;
      return sib.slice(sib.indexOf(node) + 1);
    }
    case 'preceding-sibling': {
      if (!node.parent || node.kind === ATTRIBUTE) return [];
      const sib = node.parent.children;
      return sib.slice(0, sib.indexOf(node)).reverse();
    }
    case 'following': {
      const out = [];
      let cur = node.kind === ATTRIBUTE ? node.parent : node;
      if (node.kind === ATTRIBUTE) pushDescendants(cur, out);
      for (; cur && cur.parent; cur = cur.parent) {
        const sib = cur.parent.children;
        for (let i = sib.indexOf(cur) + 1; i < sib.length; i++) {
          out.push(sib[i]);
          if (sib[i].kind === ELEMENT) pushDescendants(sib[i], out);
        }
      }
      return docOrderSort(out);
    }
    case 'preceding': {
      const out = [];
      let cur = node.kind === ATTRIBUTE ? node.parent : node;
      for (; cur && cur.parent; cur = cur.parent) {
        const sib = cur.parent.children;
        for (let i = 0; i < sib.indexOf(cur); i++) {
          out.push(sib[i]);
          if (sib[i].kind === ELEMENT) pushDescendants(sib[i], out);
        }
      }
      return docOrderSort(out).reverse();
    }
    case 'namespace':
      return [];
    default:
      throw new XPathError('XPST0010', `Nepodporovaná os ${axis}`);
  }
}

function matchesTest(test, n, axis) {
  const principal = axis === 'attribute' ? ATTRIBUTE : ELEMENT;
  switch (test.kind) {
    case 'name':
      return n.kind === principal && n.local === test.local && n.ns === test.ns;
    case 'any':
      return n.kind === principal;
    case 'nsany':
      return n.kind === principal && n.ns === test.ns;
    case 'kind':
      switch (test.name) {
        case 'node':
          return true;
        case 'text':
          return n.kind === TEXT;
        case 'comment':
          return n.kind === COMMENT;
        case 'processing-instruction':
          return n.kind === PI;
        case 'element':
          return n.kind === ELEMENT && (!test.arg || (n.local === test.arg.local && n.ns === test.arg.ns));
        case 'attribute':
          return n.kind === ATTRIBUTE && (!test.arg || (n.local === test.arg.local && n.ns === test.arg.ns));
        case 'document-node':
          return n.kind === DOCUMENT;
        default:
          return false;
      }
    default:
      return false;
  }
}

// ---------- evaluation ----------

/**
 * Evaluation context.
 * item: context item, pos/size: context position/size,
 * vars: variable bindings (prototype chain), fns: user functions, root: document node.
 */
export class Context {
  constructor(item, vars, fns, root) {
    this.item = item;
    this.pos = 1;
    this.size = 1;
    this.vars = vars || Object.create(null);
    this.fns = fns || Object.create(null);
    this.root = root || null;
  }

  with(item, pos, size) {
    const c = Object.create(this);
    c.item = item;
    c.pos = pos;
    c.size = size;
    return c;
  }

  /** Bind a variable; `value` may be a sequence or a (memoised) thunk returning one. */
  bind(name, value) {
    const c = Object.create(this);
    c.vars = Object.create(this.vars);
    c.vars[name] = value;
    return c;
  }
}

function ctxNode(ctx) {
  if (ctx.item === undefined || ctx.item === null) throw new XPathError('XPDY0002', 'Kontextová položka nie je definovaná');
  return ctx.item;
}

function rootOf(node) {
  let n = node;
  while (n.parent) n = n.parent;
  return n;
}

function isPositionalSafe(pred) {
  // true if the predicate can never evaluate to a number (so it is a pure filter)
  switch (pred.type) {
    case 'gcmp':
    case 'vcmp':
    case 'and':
    case 'or':
    case 'quant':
    case 'castable':
    case 'step':
    case 'slash':
    case 'dslash':
    case 'union':
      return true;
    case 'call':
      return ['not', 'exists', 'empty', 'boolean', 'true', 'false', 'contains', 'starts-with', 'ends-with', 'matches'].includes(pred.name);
    case 'paren':
      return isPositionalSafe(pred.expr);
    default:
      return false;
  }
}

function applyPredicates(nodes, preds, ctx) {
  let seq = nodes;
  for (const pred of preds) {
    const out = [];
    const size = seq.length;
    // fast path for numeric literal predicates
    if (pred.type === 'num') {
      const k = Number(pred.value);
      if (Number.isInteger(k) && k >= 1 && k <= size) out.push(seq[k - 1]);
      seq = out;
      continue;
    }
    for (let i = 0; i < size; i++) {
      let r;
      if (ctx.patternMode) {
        // XSLT 3.0 §5.5.4: a dynamic error while matching a pattern is a non-match
        const c = ctx.with(seq[i], i + 1, size);
        c.patternMode = false;
        try {
          r = evaluate(pred, c);
        } catch (e) {
          if (e instanceof XPathError) continue;
          throw e;
        }
      } else r = evaluate(pred, ctx.with(seq[i], i + 1, size));
      if (r.length === 1 && !isNode(r[0]) && isNumeric(r[0])) {
        const v = r[0];
        const eq = v.t === DBL ? v.v === i + 1 : v.v.cmp(i + 1) === 0;
        if (eq) out.push(seq[i]);
      } else if (ebv(r)) out.push(seq[i]);
    }
    seq = out;
  }
  return seq;
}

function evalStep(step, node, ctx) {
  let nodes = axisNodes(step.axis, node);
  const test = step.test;
  const filtered = [];
  for (let i = 0; i < nodes.length; i++) if (matchesTest(test, nodes[i], step.axis)) filtered.push(nodes[i]);
  nodes = filtered;
  if (step.preds.length) {
    nodes = applyPredicates(nodes, step.preds, ctx);
    if (REVERSE_AXES.has(step.axis)) nodes = nodes.slice().reverse();
  } else if (REVERSE_AXES.has(step.axis)) nodes = nodes.slice().reverse();
  return nodes;
}

function mergePathResults(results) {
  let allNodes = true;
  let anyNodes = false;
  for (const r of results) {
    if (isNode(r)) anyNodes = true;
    else allNodes = false;
  }
  if (results.length === 0) return results;
  if (allNodes) return docOrderSort(results);
  if (anyNodes) throw new XPathError('XPTY0018', 'Výsledok cesty obsahuje uzly aj atomické hodnoty');
  return results;
}

function evalSlash(leftSeq, right, ctx) {
  const out = [];
  const size = leftSeq.length;
  // fast path: right is a plain step
  if (right.type === 'step') {
    for (let i = 0; i < size; i++) {
      const n = leftSeq[i];
      if (!isNode(n)) throw new XPathError('XPTY0019', 'Krok cesty aplikovaný na atomickú hodnotu');
      const r = evalStep(right, n, ctx.with(n, i + 1, size));
      for (let k = 0; k < r.length; k++) out.push(r[k]);
    }
    return size > 1 ? docOrderSort(out) : out;
  }
  for (let i = 0; i < size; i++) {
    const n = leftSeq[i];
    if (!isNode(n)) throw new XPathError('XPTY0019', 'Krok cesty aplikovaný na atomickú hodnotu');
    const r = evaluate(right, ctx.with(n, i + 1, size));
    for (let k = 0; k < r.length; k++) out.push(r[k]);
  }
  return mergePathResults(out);
}

function descendantOrSelf(seq) {
  const out = [];
  for (const n of seq) {
    if (!isNode(n)) throw new XPathError('XPTY0019', '"//" aplikované na atomickú hodnotu');
    out.push(n);
    pushDescendants(n, out);
  }
  return seq.length > 1 ? docOrderSort(out) : out;
}

function evalDSlash(leftSeq, right, ctx) {
  // optimisation: E//child::x[filter] == E/descendant::x[filter] when predicates are not positional
  if (right.type === 'step' && right.axis === 'child' && right.preds.every(isPositionalSafe)) {
    const out = [];
    for (const n of leftSeq) {
      if (!isNode(n)) throw new XPathError('XPTY0019', '"//" aplikované na atomickú hodnotu');
      const desc = [];
      pushDescendants(n, desc);
      for (const d of desc) if (matchesTest(right.test, d, 'child')) out.push(d);
    }
    let nodes = leftSeq.length > 1 ? docOrderSort(out) : out;
    if (right.preds.length) nodes = applyPredicates(nodes, right.preds, ctx);
    return nodes;
  }
  return evalSlash(descendantOrSelf(leftSeq), right, ctx);
}

function evalCall(node, ctx) {
  const user = ctx.fns[node.name];
  if (user) {
    const args = node.args.map((a) => evaluate(a, ctx));
    return user(args, ctx);
  }
  const f = FUNCTIONS[node.name];
  if (!f) throw new XPathError('XPST0017', `Neznáma funkcia ${node.name}()`);
  if (f.raw) return f.fn(node.args, ctx, evaluate);
  const args = node.args.map((a) => evaluate(a, ctx));
  return f.fn(args, ctx);
}

function evalBindings(bindings, ctx, idx, onEach) {
  if (idx === bindings.length) return onEach(ctx);
  const b = bindings[idx];
  const seq = evaluate(b.expr, ctx);
  for (const it of seq) {
    const r = evalBindings(bindings, ctx.bind(b.name, [it]), idx + 1, onEach);
    if (r === 'stop') return 'stop';
  }
  return undefined;
}

function singleAtomic(seq, what) {
  const a = atomize(seq);
  if (a.length > 1) throw new XPathError('XPTY0004', `${what}: očakávaná najviac jedna hodnota, nájdených ${a.length}`);
  return a[0];
}

/** Evaluate an AST node, returning a sequence (array). */
export function evaluate(node, ctx) {
  switch (node.type) {
    case 'num':
      if (node.kind === 'integer') return [int(Decimal.parse(node.value))];
      if (node.kind === 'decimal') return [dec(Decimal.parse(node.value))];
      return [dbl(Number(node.value))];
    case 'str':
      return [str(node.value)];
    case 'empty':
      return [];
    case 'var': {
      const v = ctx.vars[node.name];
      if (v === undefined) throw new XPathError('XPST0008', `Nedefinovaná premenná $${node.name}`);
      return typeof v === 'function' ? v() : v;
    }
    case 'context':
      return [ctxNode(ctx)];
    case 'root': {
      const n = ctxNode(ctx);
      if (!isNode(n)) throw new XPathError('XPDY0050', 'Koreň pre atomickú hodnotu');
      return [rootOf(n)];
    }
    case 'paren':
      return evaluate(node.expr, ctx);
    case 'seq': {
      const out = [];
      for (const it of node.items) for (const x of evaluate(it, ctx)) out.push(x);
      return out;
    }
    case 'step': {
      const n = ctxNode(ctx);
      if (!isNode(n)) throw new XPathError('XPTY0020', 'Krok osi pre atomickú hodnotu');
      return evalStep(node, n, ctx);
    }
    case 'slash':
      return evalSlash(evaluate(node.left, ctx), node.right, ctx);
    case 'dslash':
      return evalDSlash(evaluate(node.left, ctx), node.right, ctx);
    case 'filter': {
      const seq = evaluate(node.primary, ctx);
      return applyPredicates(seq, node.preds, ctx);
    }
    case 'call':
      return evalCall(node, ctx);
    case 'or':
    case 'and': {
      // Operands may be evaluated in any order (XPath 2.0 §2.3.4): an error in
      // one operand is ignored when the other one alone decides the result.
      const decisive = node.type === 'or';
      let leftErr = null;
      let lv = !decisive;
      try {
        lv = ebv(evaluate(node.left, ctx));
      } catch (e) {
        if (!(e instanceof XPathError)) throw e;
        leftErr = e;
      }
      if (!leftErr && lv === decisive) return [bool(decisive)];
      const rv = ebv(evaluate(node.right, ctx));
      if (rv === decisive) return [bool(decisive)];
      if (leftErr) throw leftErr;
      return [bool(!decisive)];
    }
    case 'if':
      return ebv(evaluate(node.cond, ctx)) ? evaluate(node.then, ctx) : evaluate(node.else, ctx);
    case 'for': {
      const out = [];
      evalBindings(node.bindings, ctx, 0, (c) => {
        for (const x of evaluate(node.ret, c)) out.push(x);
      });
      return out;
    }
    case 'quant': {
      const some = node.kind === 'some';
      let result = !some;
      evalBindings(node.bindings, ctx, 0, (c) => {
        const t = ebv(evaluate(node.test, c));
        if (some && t) {
          result = true;
          return 'stop';
        }
        if (!some && !t) {
          result = false;
          return 'stop';
        }
        return undefined;
      });
      return [bool(result)];
    }
    case 'gcmp': {
      const l = atomize(evaluate(node.left, ctx));
      if (l.length === 0) return [FALSE];
      const r = atomize(evaluate(node.right, ctx));
      let err = null;
      for (const a of l) {
        for (const b of r) {
          try {
            if (generalCompareAtomic(node.op, a, b)) return [TRUE];
          } catch (e) {
            if (!(e instanceof XPathError)) throw e;
            err = err || e;
          }
        }
      }
      if (err) throw err;
      return [FALSE];
    }
    case 'vcmp': {
      const a = singleAtomic(evaluate(node.left, ctx), node.op);
      const b = singleAtomic(evaluate(node.right, ctx), node.op);
      if (a === undefined || b === undefined) return [];
      return [bool(valueCompare(node.op, a, b))];
    }
    case 'ncmp': {
      const a = evaluate(node.left, ctx);
      const b = evaluate(node.right, ctx);
      if (!a.length || !b.length) return [];
      if (node.op === 'is') return [bool(a[0] === b[0])];
      if (node.op === '<<') return [bool(a[0].order < b[0].order)];
      return [bool(a[0].order > b[0].order)];
    }
    case 'range': {
      const a = singleAtomic(evaluate(node.from, ctx), 'to');
      const b = singleAtomic(evaluate(node.to, ctx), 'to');
      if (a === undefined || b === undefined) return [];
      const from = Number(castAs(a, INT).v.toString());
      const to = Number(castAs(b, INT).v.toString());
      const out = [];
      for (let i = from; i <= to; i++) out.push(int(new Decimal(BigInt(i), 0)));
      return out;
    }
    case 'arith': {
      const a = singleAtomic(evaluate(node.left, ctx), node.op);
      if (a === undefined) return [];
      const b = singleAtomic(evaluate(node.right, ctx), node.op);
      if (b === undefined) return [];
      return [arithmetic(node.op, a, b)];
    }
    case 'neg': {
      const a = singleAtomic(evaluate(node.expr, ctx), '-');
      return a === undefined ? [] : [negate(a)];
    }
    case 'union': {
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      for (const x of l) if (!isNode(x)) throw new XPathError('XPTY0004', 'Union atomických hodnôt');
      for (const x of r) if (!isNode(x)) throw new XPathError('XPTY0004', 'Union atomických hodnôt');
      return docOrderSort(l.concat(r));
    }
    case 'intersect': {
      const r = new Set(evaluate(node.right, ctx));
      return docOrderSort(evaluate(node.left, ctx).filter((x) => r.has(x)));
    }
    case 'except': {
      const r = new Set(evaluate(node.right, ctx));
      return docOrderSort(evaluate(node.left, ctx).filter((x) => !r.has(x)));
    }
    case 'castable': {
      const a = atomize(evaluate(node.expr, ctx));
      if (a.length === 0) return [bool(node.optional)];
      if (a.length > 1) return [FALSE];
      return [bool(castable(a[0], normalizeType(node.typeName)))];
    }
    case 'cast': {
      const a = atomize(evaluate(node.expr, ctx));
      if (a.length === 0) {
        if (node.optional) return [];
        throw new XPathError('XPTY0004', 'cast prázdnej sekvencie');
      }
      if (a.length > 1) throw new XPathError('XPTY0004', 'cast viacerých hodnôt');
      return [castAs(a[0], normalizeType(node.typeName))];
    }
    case 'instanceof': {
      const seq = evaluate(node.expr, ctx);
      return [bool(instanceOf(seq, node.seqType))];
    }
    default:
      throw new XPathError('XPST0003', `Neznámy uzol AST ${node.type}`);
  }
}

function normalizeType(name) {
  return name.startsWith('xs:') ? name : `xs:${name}`;
}

function instanceOf(seq, st) {
  const { name, occ } = st;
  if (seq.length === 0) return occ === '?' || occ === '*' || name === 'empty-sequence()';
  if (seq.length > 1 && !(occ === '*' || occ === '+')) return false;
  return seq.every((it) => {
    if (name === 'item()') return true;
    if (name === 'node()') return isNode(it);
    if (name === 'element()') return isNode(it) && it.kind === ELEMENT;
    if (isNode(it)) return false;
    const t = normalizeType(name);
    if (t === 'xs:decimal') return it.t === DEC || it.t === INT;
    if (t === 'xs:anyAtomicType') return true;
    return it.t === t;
  });
}

/** Memoised lazy value (XSLT processors evaluate variables on demand). */
export function lazy(fn) {
  let state = 0;
  let value;
  let error;
  return () => {
    if (state === 0) {
      try {
        value = fn();
      } catch (e) {
        error = e;
      }
      state = 1;
    }
    if (error) throw error;
    return value;
  };
}

// ---------- public API ----------

const cache = new Map();

/** Compile (and cache) an expression for a namespace map. */
export function compile(expr, ns = {}) {
  const key = `${JSON.stringify(ns)}\u0000${expr}`;
  let ast = cache.get(key);
  if (!ast) {
    ast = parseXPath(expr, ns);
    if (cache.size > 5000) cache.clear();
    cache.set(key, ast);
  }
  return ast;
}

/**
 * Evaluate an XPath expression against a node.
 * @returns {Array} XPath sequence (nodes and/or atomic values)
 */
export function xpath(expr, node, { ns = {}, vars = {}, fns } = {}) {
  const ast = typeof expr === 'string' ? compile(expr, ns) : expr;
  const v = Object.create(null);
  for (const [k, val] of Object.entries(vars)) v[k] = Array.isArray(val) ? val : [typeof val === 'string' ? str(val) : val];
  const ctx = new Context(node, v, fns, node ? rootOf(node) : null);
  return evaluate(ast, ctx);
}

export { ebv, atomize, atomizeItem, TRUE, FALSE, isNode };
