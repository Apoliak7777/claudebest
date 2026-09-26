// Tiny XML builder/serializer. Elements with no content are dropped
// automatically (Peppol forbids empty elements, PEPPOL-EN16931-R008).

export function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Create an element. `content` may be a string/number (text), an element, an
 * array of elements, or null. Returns null when nothing would be emitted.
 */
export function el(name, attrs, ...content) {
  const kids = [];
  let text = null;
  for (const c of content.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'object' && c.__el) kids.push(c);
    else if (!blank(c)) text = (text || '') + String(c).trim();
  }
  if (!kids.length && text === null) return null;
  const a = {};
  for (const [k, v] of Object.entries(attrs || {})) if (!blank(v)) a[k] = String(v).trim();
  return { __el: true, name, attrs: a, kids, text };
}

export function serialize(root, { declaration = true, indent = '  ' } = {}) {
  const out = [];
  if (declaration) out.push('<?xml version="1.0" encoding="UTF-8"?>');
  const walk = (e, depth) => {
    const pad = indent.repeat(depth);
    const attrs = Object.entries(e.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
    if (!e.kids.length) {
      out.push(`${pad}<${e.name}${attrs}>${escapeXml(e.text ?? '')}</${e.name}>`);
      return;
    }
    out.push(`${pad}<${e.name}${attrs}>`);
    for (const k of e.kids) walk(k, depth + 1);
    out.push(`${pad}</${e.name}>`);
  };
  walk(root, 0);
  return `${out.join('\n')}\n`;
}
