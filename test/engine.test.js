import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Decimal } from '../src/model/decimal.js';
import { parseXml, XmlError } from '../src/xml/parser.js';
import { xpath } from '../src/xpath/eval.js';
import { atomicToString } from '../src/xpath/types.js';
import { compileSchematron, runSchematron } from '../src/schematron/schematron.js';
import { loadRules } from '../src/node.js';

const val = (expr, xml = '<r/>', opts = {}) => xpath(expr, parseXml(xml), opts).map((x) => (x.kind ? `node:${x.name}` : `${x.t}:${atomicToString(x)}`));

test('Decimal: rounding modes and exact double conversion', () => {
  assert.equal(Decimal.parse('-2.5').round(0, 'half-up').toString(), '-2');
  assert.equal(Decimal.parse('2.5').round(0, 'half-up').toString(), '3');
  assert.equal(Decimal.parse('-2.5').round(0).toString(), '-3');
  assert.equal(Decimal.parse('2.345').round(2, 'half-even').toString(), '2.34');
  assert.equal(Decimal.parse('0.1').add('0.2').toString(), '0.3');
  assert.equal(Decimal.parse('10').div('3', 4).toString(), '3.3333');
  assert.equal(Decimal.parse('12.5').toString(2), '12.50');
  assert.equal(Decimal.fromDoubleExact(12.12).toString(), '12.1199999999999992184029906638897955417633056640625');
  assert.equal(Decimal.tryParse('1e5'), null);
});

test('XML parser: namespaces, entities, errors with line numbers', () => {
  const doc = parseXml('<?xml version="1.0"?>\n<a xmlns="urn:x" xmlns:p="urn:p"><p:b c="1 &amp; 2">&lt;x&gt;&#x10D;</p:b><![CDATA[<raw>]]></a>');
  const b = doc.root.children[0];
  assert.equal(doc.root.ns, 'urn:x');
  assert.equal(b.ns, 'urn:p');
  assert.equal(b.attrs[0].value, '1 & 2');
  assert.equal(b.children[0].value, '<x>č');
  assert.throws(() => parseXml('<a>\n<b></a>'), (e) => e instanceof XmlError && e.line === 2);
  assert.throws(() => parseXml('<a>&xxe;</a>'), XmlError); // no custom entities
});

test('XPath 2.0 typing follows a non-schema-aware processor', () => {
  assert.deepEqual(val('1 + 2'), ['xs:integer:3']);
  assert.deepEqual(val('1 div 4'), ['xs:decimal:0.25']);
  assert.deepEqual(val('7 idiv 2, 7 mod 2'), ['xs:integer:3', 'xs:integer:1']);
  assert.deepEqual(val('/r/@v + 1', '<r v="1.5"/>'), ['xs:double:2.5']); // untyped -> double
  assert.deepEqual(val('xs:decimal(/r/@v) + 1', '<r v="1.5"/>', { ns: { xs: 'http://www.w3.org/2001/XMLSchema' } }), ['xs:decimal:2.5']);
  assert.deepEqual(val('round(-2.5), round(2.5)'), ['xs:decimal:-2', 'xs:decimal:3']);
  assert.deepEqual(val("/r/a = 'x'", '<r><a>y</a><a>x</a></r>'), ['xs:boolean:true']); // existential
  assert.deepEqual(val('/r/a > 2', '<r><a>10</a></r>'), ['xs:boolean:true']); // numeric, not string
  assert.deepEqual(val("some $x in (1, 2, 3) satisfies $x = 2"), ['xs:boolean:true']);
  assert.deepEqual(val('for $i in 1 to 3 return $i * 2'), ['xs:integer:2', 'xs:integer:4', 'xs:integer:6']);
  assert.deepEqual(val("if (1) then 'a' else 'b'"), ['xs:string:a']);
  assert.deepEqual(val("tokenize('a  b', '\\s+')"), ['xs:string:a', 'xs:string:b']);
  assert.deepEqual(val("substring('12345', 1.5, 2.6)"), ['xs:string:234']);
  assert.deepEqual(val('count(//b[2])', '<r><a><b/><b/></a><a><b/><b/></a></r>'), ['xs:integer:2']);
  assert.deepEqual(val('/r/a/substring(., 1, 1)', '<r><a>xy</a><a>zw</a></r>'), ['xs:string:x', 'xs:string:z']);
  assert.deepEqual(val("'12' castable as xs:integer, 'x' castable as xs:integer", '<r/>', { ns: { xs: 'http://www.w3.org/2001/XMLSchema' } }), ['xs:boolean:true', 'xs:boolean:false']);
});

test('Official rule files compile completely', () => {
  const counts = {};
  for (const n of ['CEN-EN16931-UBL', 'PEPPOL-EN16931-UBL', 'CEN-EN16931-CII', 'PEPPOL-EN16931-CII']) counts[n] = compileSchematron(loadRules(n)).assertCount;
  assert.ok(counts['CEN-EN16931-UBL'] > 900, JSON.stringify(counts));
  assert.ok(counts['PEPPOL-EN16931-UBL'] > 150, JSON.stringify(counts));
  assert.ok(counts['CEN-EN16931-CII'] > 700, JSON.stringify(counts));
  assert.ok(counts['PEPPOL-EN16931-CII'] > 80, JSON.stringify(counts));
});

// Golden fixtures: expected results produced by the reference Saxon/SchXslt
// pipeline (scripts/parity.mjs --emit-golden). The JS engine must match exactly.
test('Golden parity with the reference validator (Saxon)', () => {
  const dir = new URL('./fixtures/golden/', import.meta.url);
  const expected = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8'));
  const packs = {};
  let checked = 0;
  for (const [file, exp] of Object.entries(expected)) {
    const doc = parseXml(readFileSync(new URL(file, dir), 'utf8'));
    for (const [rule, ids] of Object.entries(exp.failed)) {
      packs[rule] = packs[rule] || compileSchematron(loadRules(rule));
      const r = runSchematron(packs[rule], doc);
      const mine = r.failed.map((f) => `${f.flag}:${f.id}`).sort();
      assert.deepEqual(mine, ids, `${file} [${rule}] (${exp.what})`);
      checked++;
    }
  }
  assert.ok(checked >= 100, `checked ${checked}`);
  assert.ok(readdirSync(dir).length > 50);
});
