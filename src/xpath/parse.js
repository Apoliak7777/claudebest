// XPath 2.0 (subset) lexer + recursive-descent parser.
// Covers everything used by the official CEN EN16931 and Peppol BIS 3.0
// Schematron rules: paths with all major axes, predicates, for/some/every/if,
// general/value comparisons, arithmetic, union, castable/cast, function calls
// (including functions as path steps).

export class XPathSyntaxError extends Error {
  constructor(message, src, pos) {
    super(`${message} @${pos} v "${src}"`);
    this.name = 'XPathSyntaxError';
  }
}

const NC_START = /[A-Za-z_À-￿]/;
const NC_CHAR = /[A-Za-z0-9_.\-·À-￿]/;

const KIND_TESTS = new Set(['node', 'text', 'comment', 'processing-instruction', 'element', 'attribute', 'document-node', 'schema-element', 'schema-attribute']);
const AXES = new Set(['child', 'descendant', 'attribute', 'self', 'descendant-or-self', 'following-sibling', 'following', 'parent', 'ancestor', 'preceding-sibling', 'preceding', 'ancestor-or-self', 'namespace']);
const REVERSE_AXES = new Set(['parent', 'ancestor', 'preceding-sibling', 'preceding', 'ancestor-or-self']);

// Tokens after which the next token starts an operator (not an operand).
function endsOperand(tok) {
  if (!tok) return false;
  if (tok.type === 'num' || tok.type === 'str' || tok.type === 'var') return true;
  if (tok.type === 'name') return !tok.isOperatorKw;
  if (tok.type === 'op') return tok.value === ')' || tok.value === ']' || tok.value === '.' || tok.value === '..' || (tok.value === '*' && tok.wildcard) || tok.value === '?';
  return false;
}

const OPERATOR_KWS = new Set(['and', 'or', 'div', 'idiv', 'mod', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'is', 'to', 'union', 'intersect', 'except', 'instance', 'treat', 'castable', 'cast', 'return', 'satisfies', 'then', 'else', 'in', 'as', 'of']);

export function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    // XPath comment (: ... :) (nestable)
    if (c === '(' && src[i + 1] === ':') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === '(' && src[i + 1] === ':') {
          depth++;
          i += 2;
        } else if (src[i] === ':' && src[i + 1] === ')') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    const prev = toks[toks.length - 1];
    const start = i;
    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      let kind = 'integer';
      if (src[j] === '.' && src[j + 1] !== '.') {
        kind = 'decimal';
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (/[0-9]/.test(src[k] || '')) {
          kind = 'double';
          j = k;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
      }
      toks.push({ type: 'num', value: src.slice(i, j), kind, pos: start });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      for (;;) {
        if (j >= n) throw new XPathSyntaxError('Neukončený reťazec', src, start);
        if (src[j] === c) {
          if (src[j + 1] === c) {
            out += c;
            j += 2;
            continue;
          }
          break;
        }
        out += src[j++];
      }
      toks.push({ type: 'str', value: out, pos: start });
      i = j + 1;
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      const nm = readQName(src, j);
      if (!nm) throw new XPathSyntaxError('Očakávaný názov premennej', src, i);
      toks.push({ type: 'var', value: nm.name, pos: start });
      i = nm.end;
      continue;
    }
    if (NC_START.test(c)) {
      const nm = readQName(src, i);
      const tok = { type: 'name', value: nm.name, pos: start };
      // keyword operators are operators only right after an operand
      if (OPERATOR_KWS.has(nm.name) && endsOperand(prev)) tok.isOperatorKw = true;
      toks.push(tok);
      i = nm.end;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['//', '..', '::', '!=', '<=', '>=', '<<', '>>', ':='].includes(two)) {
      toks.push({ type: 'op', value: two, pos: start });
      i += 2;
      continue;
    }
    if ('()[],/@.|=<>+-*?'.includes(c)) {
      const tok = { type: 'op', value: c, pos: start };
      if (c === '*') tok.wildcard = !endsOperand(prev);
      toks.push(tok);
      i++;
      continue;
    }
    throw new XPathSyntaxError(`Neočakávaný znak "${c}"`, src, i);
  }
  toks.push({ type: 'eof', pos: n });
  return toks;
}

function readQName(src, i) {
  if (!NC_START.test(src[i] || '')) return null;
  let j = i + 1;
  while (j < src.length && NC_CHAR.test(src[j])) j++;
  // prefix:local or prefix:*
  if (src[j] === ':' && src[j + 1] !== ':' && src[j + 1] !== '=') {
    if (NC_START.test(src[j + 1] || '')) {
      let k = j + 2;
      while (k < src.length && NC_CHAR.test(src[k])) k++;
      return { name: src.slice(i, k), end: k };
    }
    if (src[j + 1] === '*') return { name: src.slice(i, j + 2), end: j + 2 };
  }
  // names cannot end with '.' or '-' followed by something weird; XPath allows it, keep as is
  return { name: src.slice(i, j), end: j };
}

/**
 * Parse an XPath expression.
 * @param {string} src
 * @param {Record<string,string>} ns prefix -> namespace URI
 */
export function parseXPath(src, ns = {}) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const next = () => toks[p++];
  const fail = (msg, tok = peek()) => {
    throw new XPathSyntaxError(msg, src, tok.pos);
  };
  const isOp = (v, o = 0) => peek(o).type === 'op' && peek(o).value === v;
  const isKw = (v, o = 0) => peek(o).type === 'name' && peek(o).value === v;
  const expectOp = (v) => {
    if (!isOp(v)) fail(`Očakávané "${v}"`);
    return next();
  };
  const expectKw = (v) => {
    if (!isKw(v)) fail(`Očakávané "${v}"`);
    return next();
  };

  function resolve(qname, isElementName) {
    const c = qname.indexOf(':');
    if (c < 0) return { ns: isElementName ? '' : '', local: qname };
    const prefix = qname.slice(0, c);
    const uri = ns[prefix];
    if (uri === undefined) fail(`Nedeklarovaný prefix "${prefix}"`);
    return { ns: uri, local: qname.slice(c + 1), prefix };
  }

  function parseExpr() {
    const first = parseExprSingle();
    if (!isOp(',')) return first;
    const items = [first];
    while (isOp(',')) {
      next();
      items.push(parseExprSingle());
    }
    return { type: 'seq', items };
  }

  function parseBindings(sepKw) {
    const bindings = [];
    for (;;) {
      const v = next();
      if (v.type !== 'var') fail('Očakávaná premenná', v);
      expectKw('in');
      bindings.push({ name: v.value, expr: parseExprSingle() });
      if (isOp(',')) {
        next();
        continue;
      }
      break;
    }
    expectKw(sepKw);
    return bindings;
  }

  function parseExprSingle() {
    const t = peek();
    if (t.type === 'name' && !t.isOperatorKw) {
      if ((t.value === 'for' || t.value === 'some' || t.value === 'every') && peek(1).type === 'var') {
        next();
        if (t.value === 'for') {
          const bindings = parseBindings('return');
          return { type: 'for', bindings, ret: parseExprSingle() };
        }
        const bindings = parseBindings('satisfies');
        return { type: 'quant', kind: t.value, bindings, test: parseExprSingle() };
      }
      if (t.value === 'if' && isOp('(', 1)) {
        next();
        next();
        const cond = parseExpr();
        expectOp(')');
        expectKw('then');
        const thenE = parseExprSingle();
        expectKw('else');
        const elseE = parseExprSingle();
        return { type: 'if', cond, then: thenE, else: elseE };
      }
    }
    return parseOr();
  }

  function parseOr() {
    let left = parseAnd();
    while (isKw('or') && peek().isOperatorKw) {
      next();
      left = { type: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseComparison();
    while (isKw('and') && peek().isOperatorKw) {
      next();
      left = { type: 'and', left, right: parseComparison() };
    }
    return left;
  }

  const GCMP = new Set(['=', '!=', '<', '<=', '>', '>=']);
  const VCMP = new Set(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
  function parseComparison() {
    const left = parseRange();
    const t = peek();
    if (t.type === 'op' && GCMP.has(t.value)) {
      next();
      return { type: 'gcmp', op: t.value, left, right: parseRange() };
    }
    if (t.type === 'name' && t.isOperatorKw && VCMP.has(t.value)) {
      next();
      return { type: 'vcmp', op: t.value, left, right: parseRange() };
    }
    if ((t.type === 'op' && (t.value === '<<' || t.value === '>>')) || (t.type === 'name' && t.isOperatorKw && t.value === 'is')) {
      next();
      return { type: 'ncmp', op: t.value, left, right: parseRange() };
    }
    return left;
  }

  function parseRange() {
    const left = parseAdditive();
    if (isKw('to') && peek().isOperatorKw) {
      next();
      return { type: 'range', from: left, to: parseAdditive() };
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (isOp('+') || isOp('-')) {
      const op = next().value;
      left = { type: 'arith', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseUnion();
    for (;;) {
      const t = peek();
      if (t.type === 'op' && t.value === '*' && !t.wildcard) {
        next();
        left = { type: 'arith', op: '*', left, right: parseUnion() };
      } else if (t.type === 'name' && t.isOperatorKw && (t.value === 'div' || t.value === 'idiv' || t.value === 'mod')) {
        next();
        left = { type: 'arith', op: t.value, left, right: parseUnion() };
      } else break;
    }
    return left;
  }

  function parseUnion() {
    let left = parseIntersect();
    while (isOp('|') || (isKw('union') && peek().isOperatorKw)) {
      next();
      left = { type: 'union', left, right: parseIntersect() };
    }
    return left;
  }

  function parseIntersect() {
    let left = parseInstanceOf();
    while ((isKw('intersect') || isKw('except')) && peek().isOperatorKw) {
      const op = next().value;
      left = { type: op, left, right: parseInstanceOf() };
    }
    return left;
  }

  function parseSequenceType() {
    const t = next();
    if (t.type !== 'name') fail('Očakávaný typ', t);
    let name = t.value;
    if (isOp('(')) {
      // kind test like item(), node(), element()
      next();
      expectOp(')');
      name += '()';
    }
    let occ = '';
    const o = peek();
    if (o.type === 'op' && (o.value === '?' || o.value === '+' || (o.value === '*' && (o.wildcard || true)))) {
      // occurrence indicator directly after the type
      if (o.value === '?' || o.value === '+' || o.value === '*') {
        occ = o.value;
        next();
      }
    }
    return { name, occ };
  }

  function parseInstanceOf() {
    const left = parseTreat();
    if (isKw('instance') && peek().isOperatorKw) {
      next();
      expectKw('of');
      return { type: 'instanceof', expr: left, seqType: parseSequenceType() };
    }
    return left;
  }

  function parseTreat() {
    const left = parseCastable();
    if (isKw('treat') && peek().isOperatorKw) {
      next();
      expectKw('as');
      parseSequenceType();
      return left;
    }
    return left;
  }

  function parseSingleType() {
    const t = next();
    if (t.type !== 'name') fail('Očakávaný atomický typ', t);
    let optional = false;
    if (isOp('?')) {
      next();
      optional = true;
    }
    return { typeName: t.value, optional };
  }

  function parseCastable() {
    const left = parseCast();
    if (isKw('castable') && peek().isOperatorKw) {
      next();
      expectKw('as');
      return { type: 'castable', expr: left, ...parseSingleType() };
    }
    return left;
  }

  function parseCast() {
    const left = parseUnary();
    if (isKw('cast') && peek().isOperatorKw) {
      next();
      expectKw('as');
      return { type: 'cast', expr: left, ...parseSingleType() };
    }
    return left;
  }

  function parseUnary() {
    let neg = 0;
    while (isOp('-') || isOp('+')) {
      if (next().value === '-') neg++;
    }
    const e = parsePath();
    return neg % 2 ? { type: 'neg', expr: e } : e;
  }

  function startsStep() {
    const t = peek();
    if (t.type === 'num' || t.type === 'str' || t.type === 'var') return true;
    if (t.type === 'name') return !t.isOperatorKw || isOp('(', 1) || isOp('::', 1);
    if (t.type === 'op') return ['(', '@', '.', '..', '*'].includes(t.value) && !(t.value === '*' && !t.wildcard);
    return false;
  }

  function parsePath() {
    if (isOp('/')) {
      next();
      const root = { type: 'root' };
      if (!startsStep()) return root;
      return parseRelative(root, '/');
    }
    if (isOp('//')) {
      next();
      return parseRelative({ type: 'root' }, '//');
    }
    return parseRelative(null, null);
  }

  function parseRelative(left, sep) {
    let expr = left;
    let s = sep;
    for (;;) {
      const step = parseStep();
      if (!expr) expr = step;
      else expr = { type: s === '//' ? 'dslash' : 'slash', left: expr, right: step };
      if (isOp('/')) {
        next();
        s = '/';
      } else if (isOp('//')) {
        next();
        s = '//';
      } else break;
    }
    return expr;
  }

  function parsePredicates() {
    const preds = [];
    while (isOp('[')) {
      next();
      preds.push(parseExpr());
      expectOp(']');
    }
    return preds;
  }

  function parseNodeTest(axis) {
    const t = peek();
    if (t.type === 'op' && t.value === '*') {
      next();
      return { kind: 'any' };
    }
    if (t.type !== 'name') fail('Očakávaný test uzla', t);
    next();
    if (KIND_TESTS.has(t.value) && isOp('(')) {
      next();
      // allow element(name) / attribute(name) minimal form
      let arg = null;
      if (!isOp(')')) {
        const a = next();
        arg = a.value;
      }
      expectOp(')');
      return { kind: 'kind', name: t.value, arg: arg && arg !== '*' ? resolve(arg, true) : null };
    }
    if (t.value.endsWith(':*')) {
      const prefix = t.value.slice(0, -2);
      const uri = ns[prefix];
      if (uri === undefined) fail(`Nedeklarovaný prefix "${prefix}"`, t);
      return { kind: 'nsany', ns: uri };
    }
    const r = resolve(t.value, axis !== 'attribute');
    return { kind: 'name', ns: r.ns, local: r.local };
  }

  function parseStep() {
    const t = peek();
    // abbreviated steps
    if (t.type === 'op' && t.value === '..') {
      next();
      return { type: 'step', axis: 'parent', test: { kind: 'kind', name: 'node' }, preds: parsePredicates() };
    }
    if (t.type === 'op' && t.value === '.') {
      next();
      const preds = parsePredicates();
      return preds.length ? { type: 'filter', primary: { type: 'context' }, preds } : { type: 'context' };
    }
    if (t.type === 'op' && t.value === '@') {
      next();
      const test = parseNodeTest('attribute');
      return { type: 'step', axis: 'attribute', test, preds: parsePredicates() };
    }
    if (t.type === 'name' && isOp('::', 1)) {
      if (!AXES.has(t.value)) fail(`Neznáma os "${t.value}"`, t);
      next();
      next();
      const test = parseNodeTest(t.value);
      return { type: 'step', axis: t.value, test, preds: parsePredicates() };
    }
    if (t.type === 'op' && t.value === '*' && t.wildcard) {
      next();
      return { type: 'step', axis: 'child', test: { kind: 'any' }, preds: parsePredicates() };
    }
    if (t.type === 'name' && !isOp('(', 1)) {
      const test = parseNodeTest('child');
      return { type: 'step', axis: 'child', test, preds: parsePredicates() };
    }
    if (t.type === 'name' && isOp('(', 1) && KIND_TESTS.has(t.value)) {
      const test = parseNodeTest('child');
      return { type: 'step', axis: t.value === 'attribute' ? 'attribute' : 'child', test, preds: parsePredicates() };
    }
    // primary expression (filter expression)
    const primary = parsePrimary();
    const preds = parsePredicates();
    return preds.length ? { type: 'filter', primary, preds } : primary;
  }

  function parsePrimary() {
    const t = next();
    switch (t.type) {
      case 'num':
        return { type: 'num', kind: t.kind, value: t.value };
      case 'str':
        return { type: 'str', value: t.value };
      case 'var':
        return { type: 'var', name: t.value };
      case 'op':
        if (t.value === '(') {
          if (isOp(')')) {
            next();
            return { type: 'empty' };
          }
          const e = parseExpr();
          expectOp(')');
          return { type: 'paren', expr: e };
        }
        break;
      case 'name': {
        if (!isOp('(')) break;
        next();
        const args = [];
        if (!isOp(')')) {
          args.push(parseExprSingle());
          while (isOp(',')) {
            next();
            args.push(parseExprSingle());
          }
        }
        expectOp(')');
        return { type: 'call', name: t.value, args };
      }
      default:
        break;
    }
    return fail(`Neočakávaný token "${t.value ?? t.type}"`, t);
  }

  const ast = parseExpr();
  if (peek().type !== 'eof') fail(`Nadbytočný token "${peek().value}"`);
  return ast;
}

export { REVERSE_AXES };
