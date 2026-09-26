// Minimal, namespace-aware, non-validating XML parser.
// Isomorphic (browser + Node), zero dependencies. Produces a lightweight tree
// used by the XPath engine, the model readers and the renderer.
//
// Security: DOCTYPE internal subsets are skipped and custom entities are never
// expanded (no billion-laughs, no XXE).

export const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

export class XmlError extends Error {
  constructor(message, doc, offset) {
    const { line, col } = lineCol(doc.src, offset, doc);
    super(`${message} (riadok ${line}, stĺpec ${col})`);
    this.name = 'XmlError';
    this.line = line;
    this.col = col;
    this.offset = offset;
  }
}

// Node kinds (mirrors DOM numbering where it makes sense).
export const ELEMENT = 1;
export const ATTRIBUTE = 2;
export const TEXT = 3;
export const COMMENT = 8;
export const PI = 7;
export const DOCUMENT = 9;

const PREDEFINED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function lineCol(src, offset, doc) {
  if (!doc._lines) {
    const lines = [0];
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) lines.push(i + 1);
    doc._lines = lines;
  }
  const lines = doc._lines;
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - lines[lo] + 1 };
}

function decodeEntities(s, doc, offset) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);?/g, (m, ref, idx) => {
    if (!m.endsWith(';')) throw new XmlError(`Neukončená entita "${m}"`, doc, offset + idx);
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff) throw new XmlError(`Neplatný znak "${m}"`, doc, offset + idx);
      return String.fromCodePoint(cp);
    }
    if (ref in PREDEFINED) return PREDEFINED[ref];
    throw new XmlError(`Neznáma entita "${m}"`, doc, offset + idx);
  });
}

const NAME_RE = /[A-Za-z_À-￿][\w.\-·À-￿]*(?::[A-Za-z_À-￿][\w.\-·À-￿]*)?/y;
const WS_RE = /[ \t\r\n]*/y;

/**
 * Parse XML text into a tree.
 * @param {string} src
 * @returns {XDocument}
 */
export function parseXml(src) {
  if (typeof src !== 'string') throw new TypeError('parseXml expects a string');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const doc = {
    kind: DOCUMENT,
    src,
    children: [],
    parent: null,
    root: null,
    declaration: null,
    order: 0,
    _lines: null,
  };
  let order = 1;
  let pos = 0;
  const len = src.length;
  // stack of open elements; each carries its in-scope namespace map
  const stack = [];
  let current = doc;
  let nsScope = { xml: XML_NS, '': '' };

  const err = (msg, at = pos) => new XmlError(msg, doc, at);

  function readName() {
    NAME_RE.lastIndex = pos;
    const m = NAME_RE.exec(src);
    if (!m) throw err('Očakávaný názov elementu alebo atribútu');
    pos = NAME_RE.lastIndex;
    return m[0];
  }
  function skipWs() {
    WS_RE.lastIndex = pos;
    WS_RE.exec(src);
    pos = WS_RE.lastIndex;
  }
  function addText(value, at) {
    if (!value) return;
    const last = current.children[current.children.length - 1];
    if (last && last.kind === TEXT) {
      last.value += value;
      return;
    }
    current.children.push({ kind: TEXT, value, parent: current, offset: at, order: order++ });
  }

  while (pos < len) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) {
      const tail = src.slice(pos);
      if (current !== doc) addText(decodeEntities(tail, doc, pos), pos);
      else if (tail.trim()) throw err('Text mimo koreňového elementu');
      pos = len;
      break;
    }
    if (lt > pos) {
      const raw = src.slice(pos, lt);
      if (current === doc) {
        if (raw.trim()) throw err('Text mimo koreňového elementu');
      } else addText(decodeEntities(raw, doc, pos), pos);
      pos = lt;
    }
    // at '<'
    const c1 = src[pos + 1];
    if (c1 === '?') {
      const end = src.indexOf('?>', pos + 2);
      if (end < 0) throw err('Neukončená inštrukcia <?...?>');
      const body = src.slice(pos + 2, end);
      const target = body.split(/\s/, 1)[0];
      if (target === 'xml') {
        if (pos !== 0 && src.slice(0, pos).trim()) throw err('XML deklarácia musí byť na začiatku');
        const decl = {};
        body.replace(/(\w+)\s*=\s*(["'])(.*?)\2/g, (_, k, __, v) => {
          decl[k] = v;
        });
        doc.declaration = decl;
      } else if (current !== doc) {
        current.children.push({ kind: PI, target, value: body.slice(target.length).trim(), parent: current, order: order++ });
      }
      pos = end + 2;
    } else if (c1 === '!') {
      if (src.startsWith('<!--', pos)) {
        const end = src.indexOf('-->', pos + 4);
        if (end < 0) throw err('Neukončený komentár');
        if (current !== doc) current.children.push({ kind: COMMENT, value: src.slice(pos + 4, end), parent: current, order: order++ });
        pos = end + 3;
      } else if (src.startsWith('<![CDATA[', pos)) {
        if (current === doc) throw err('CDATA mimo koreňového elementu');
        const end = src.indexOf(']]>', pos + 9);
        if (end < 0) throw err('Neukončená CDATA sekcia');
        addText(src.slice(pos + 9, end), pos);
        pos = end + 3;
      } else if (src.startsWith('<!DOCTYPE', pos)) {
        // Skip DOCTYPE including an optional internal subset. Entities are not honoured.
        let i = pos + 9;
        let depth = 0;
        for (; i < len; i++) {
          const ch = src[i];
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
        }
        pos = i + 1;
      } else throw err('Neznáma deklarácia <!');
    } else if (c1 === '/') {
      pos += 2;
      const name = readName();
      skipWs();
      if (src[pos] !== '>') throw err('Očakávaný znak ">"');
      pos++;
      if (current === doc || current.name !== name) {
        throw err(`Neočakávaný koncový tag </${name}>${current !== doc ? `, očakávaný </${current.name}>` : ''}`);
      }
      current.endOffset = pos;
      const frame = stack.pop();
      nsScope = frame.nsScope;
      current = frame.parent;
    } else {
      const start = pos;
      pos++;
      const name = readName();
      const rawAttrs = [];
      let selfClose = false;
      for (;;) {
        const before = pos;
        skipWs();
        const ch = src[pos];
        if (ch === '>') {
          pos++;
          break;
        }
        if (ch === '/' && src[pos + 1] === '>') {
          pos += 2;
          selfClose = true;
          break;
        }
        if (pos === before) throw err('Očakávaná medzera medzi atribútmi');
        if (pos >= len) throw err('Neukončený tag');
        const aStart = pos;
        const aName = readName();
        skipWs();
        if (src[pos] !== '=') throw err(`Atribút "${aName}" nemá hodnotu`);
        pos++;
        skipWs();
        const q = src[pos];
        if (q !== '"' && q !== "'") throw err('Hodnota atribútu musí byť v úvodzovkách');
        const vEnd = src.indexOf(q, pos + 1);
        if (vEnd < 0) throw err('Neukončená hodnota atribútu');
        const rawVal = src.slice(pos + 1, vEnd);
        if (rawVal.indexOf('<') >= 0) throw err('Znak "<" v hodnote atribútu', pos);
        // attribute value normalisation (whitespace chars -> space)
        const value = decodeEntities(rawVal.replace(/[\t\n\r]/g, ' '), doc, pos + 1);
        pos = vEnd + 1;
        if (rawAttrs.some((a) => a.name === aName)) throw err(`Duplicitný atribút "${aName}"`, aStart);
        rawAttrs.push({ name: aName, value, offset: aStart });
      }
      // namespace declarations
      let scope = nsScope;
      for (const a of rawAttrs) {
        if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) {
          if (scope === nsScope) scope = Object.create(nsScope);
          scope[a.name === 'xmlns' ? '' : a.name.slice(6)] = a.value;
        }
      }
      const colon = name.indexOf(':');
      const prefix = colon >= 0 ? name.slice(0, colon) : '';
      const local = colon >= 0 ? name.slice(colon + 1) : name;
      const ns = scope[prefix];
      if (ns === undefined) throw err(`Nedeklarovaný namespace prefix "${prefix}"`, start);
      const el = {
        kind: ELEMENT,
        name,
        prefix,
        local,
        ns,
        attrs: [],
        children: [],
        parent: current,
        offset: start,
        order: order++,
        nsScope: scope,
      };
      for (const a of rawAttrs) {
        const isNsDecl = a.name === 'xmlns' || a.name.startsWith('xmlns:');
        const ac = a.name.indexOf(':');
        const ap = ac >= 0 ? a.name.slice(0, ac) : '';
        const al = ac >= 0 ? a.name.slice(ac + 1) : a.name;
        let ans = '';
        if (isNsDecl) ans = XMLNS_NS;
        else if (ap) {
          ans = scope[ap];
          if (ans === undefined) throw err(`Nedeklarovaný namespace prefix "${ap}"`, a.offset);
        }
        el.attrs.push({ kind: ATTRIBUTE, name: a.name, prefix: ap, local: al, ns: ans, value: a.value, parent: el, offset: a.offset, order: order++, isNsDecl });
      }
      if (current === doc) {
        if (doc.root) throw err('Dokument môže mať iba jeden koreňový element', start);
        doc.root = el;
      }
      current.children.push(el);
      if (selfClose) {
        el.endOffset = pos;
      } else {
        stack.push({ parent: current, nsScope });
        nsScope = scope;
        current = el;
      }
    }
  }
  if (current !== doc) throw err(`Neukončený element <${current.name}>`, len);
  if (!doc.root) throw err('Dokument neobsahuje žiadny element', 0);
  doc.order = 0;
  doc.nodeCount = order;
  return doc;
}

/** Returns 1-based line/column of a node (element/attribute/text). */
export function nodeLocation(node) {
  let doc = node;
  while (doc.parent) doc = doc.parent;
  if (doc.kind !== DOCUMENT || node.offset === undefined) return null;
  return lineCol(doc.src, node.offset, doc);
}

/** XPath string-value of a node. */
export function stringValue(node) {
  switch (node.kind) {
    case TEXT:
    case COMMENT:
    case PI:
    case ATTRIBUTE:
      return node.value;
    case ELEMENT:
    case DOCUMENT: {
      // fast path for leaf elements
      const ch = node.children;
      if (ch.length === 1 && ch[0].kind === TEXT) return ch[0].value;
      let out = '';
      const walk = (n) => {
        for (const c of n.children) {
          if (c.kind === TEXT) out += c.value;
          else if (c.kind === ELEMENT) walk(c);
        }
      };
      walk(node);
      return out;
    }
    default:
      return '';
  }
}

// ---------- convenience helpers for model readers ----------

/** Child elements matching namespace URI + local name. */
export function childrenNS(el, ns, local) {
  const out = [];
  if (!el) return out;
  for (const c of el.children) if (c.kind === ELEMENT && c.local === local && c.ns === ns) out.push(c);
  return out;
}

export function childNS(el, ns, local) {
  if (!el) return undefined;
  for (const c of el.children) if (c.kind === ELEMENT && c.local === local && c.ns === ns) return c;
  return undefined;
}

export function attr(el, name) {
  if (!el) return undefined;
  for (const a of el.attrs) if (a.name === name && !a.isNsDecl) return a.value;
  return undefined;
}

export function elementChildren(el) {
  return el ? el.children.filter((c) => c.kind === ELEMENT) : [];
}
