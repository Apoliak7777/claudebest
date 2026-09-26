#!/usr/bin/env node
// Builds the web app into self-contained HTML files:
//   dist/revizor.html          – full standalone app (works offline, double-click)
//   dist/revizor-demo.html     – same, downloads/print hidden (for sandboxed previews)
//   dist/embed/index.html      – page fragment without <html>/<head>/<body> (for hosts that add their own skeleton)
// Optional white-label config: node scripts/build.mjs --config brand.json
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const cfgPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;
const brand = cfgPath ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const root = new URL('../', import.meta.url);

const result = await build({
  entryPoints: [new URL('app/main.js', root).pathname],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
  loader: { '.sch': 'text', '.xml': 'text' },
  external: ['node:*'],
});
const js = result.outputFiles[0].text;
const css = readFileSync(new URL('app/styles.css', root), 'utf8');
const shell = readFileSync(new URL('app/index.html', root), 'utf8');

function page(config) {
  const cfg = `window.REVIZOR_CONFIG=${JSON.stringify({ ...brand, ...config }).replace(/</g, '\\u003c')};`;
  return shell.replace('/*CSS*/', () => css).replace('/*JS*/', () => `${cfg}\n${js.replace(/<\/script/gi, '<\\/script')}`);
}

const full = (body) => `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${body.split('<header class="topbar">')[0]}
</head>
<body>
<header class="topbar">${body.split('<header class="topbar">')[1]}
</body>
</html>
`;

mkdirSync(new URL('dist/embed/', root), { recursive: true });
const standalone = full(page({}));
writeFileSync(new URL('dist/revizor.html', root), standalone);
writeFileSync(new URL('dist/revizor-demo.html', root), full(page({ demo: true })));
writeFileSync(new URL('dist/embed/index.html', root), page({ demo: true }));
console.log(`dist/revizor.html ${(standalone.length / 1024).toFixed(0)} kB (JS ${(js.length / 1024).toFixed(0)} kB)`);
