#!/usr/bin/env node
// End-to-end smoke test of dist/revizor.html in headless Chromium.
// Usage: node scripts/e2e.mjs [--shots <dir>]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const url = new URL('../dist/revizor.html', import.meta.url).href;
const samples = (n) => fileURLToPath(new URL(`../samples/${n}`, import.meta.url));

const launchOpts = {};
const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
if (exe) launchOpts.executablePath = exe;
const browser = await chromium.launch(launchOpts);
const failures = [];
const assert = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
};

async function run(viewport, label) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // external font loading may fail offline/in CI – not an app error
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector('.stamp.bad', { timeout: 15000 });
  assert(true, `[${label}] boots with the broken sample and stamps NEPLATNÁ`);
  const issues = await page.$$eval('.issue', (els) => els.map((e) => e.querySelector('.rule').textContent));
  assert(issues.includes('BR-CO-15') && issues.includes('RV-SK-07'), `[${label}] lists BR-CO-15 and RV-SK-07 (found ${issues.length} issues)`);
  assert((await page.textContent('.issue-msg')).length > 10, `[${label}] issue text is Slovak`);
  if (shots) await page.screenshot({ path: `${shots}/${label}-check-bad.png`, fullPage: false });

  await page.click('[data-sample="ok"]');
  await page.waitForFunction(() => document.querySelector('.stamp')?.classList.contains('ok') || document.querySelector('.stamp')?.classList.contains('warn'));
  const payable = await page.textContent('.rv-payable strong');
  assert(/2\s593,34/.test(payable.replace(/[\u00a0\u202f]/g, ' ')), `[${label}] valid sample renders payable total (${payable})`);
  assert(await page.$('.rv-qr svg'), `[${label}] PAY by square QR is rendered`);
  if (shots) await page.screenshot({ path: `${shots}/${label}-check-ok.png`, fullPage: true });

  await page.click('[data-dv="xml"]');
  assert(await page.isVisible('#doc-xml li'), `[${label}] XML view shows source`);
  await page.click('[data-dv="inv"]');

  // upload through the file input
  await page.setInputFiles('#file', samples('dobropis.xml'));
  await page.waitForFunction(() => document.querySelector('.verdict-file')?.textContent.includes('dobropis.xml'));
  assert((await page.textContent('.rv-type')).includes('Dobropis'), `[${label}] credit note upload renders Dobropis`);

  // creator
  await page.click('#tab-create');
  await page.waitForSelector('#c-live .stamp');
  await page.fill('#c-l0-price', '100');
  await page.waitForFunction(() => /3\s011,54/.test((document.querySelector('#c-preview .rv-payable strong')?.textContent || '').replace(/[\u00a0\u202f]/g, ' ')));
  const live = await page.getAttribute('#c-live .stamp', 'class');
  assert(/ok|warn/.test(live), `[${label}] creator produces a valid invoice (${live})`);
  await page.fill('#c-iban', 'SK00 1234');
  await page.waitForSelector('#c-iban.invalid');
  assert(true, `[${label}] creator flags an invalid IBAN`);
  if (shots) await page.screenshot({ path: `${shots}/${label}-create.png`, fullPage: false });

  // batch
  await page.click('#tab-batch');
  await page.setInputFiles('#bfile', [samples('faktura-ok.xml'), samples('faktura-chyby.xml'), samples('dobropis.xml')]);
  await page.waitForFunction(() => document.querySelectorAll('#b-table tbody tr').length === 3);
  const pills = await page.$$eval('#b-table .pill', (els) => els.map((e) => e.className));
  assert(pills.filter((c) => c.includes('bad')).length === 1, `[${label}] batch marks exactly one invalid file`);
  if (shots) await page.screenshot({ path: `${shots}/${label}-batch.png`, fullPage: false });

  await page.click('#tab-about');
  await page.waitForFunction(() => /\d/.test(document.querySelector('[data-count="CEN-EN16931"]')?.textContent || ''));
  assert(true, `[${label}] about page counts official rules`);
  if (shots) await page.screenshot({ path: `${shots}/${label}-about.png`, fullPage: false });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, `[${label}] no horizontal page scroll`);
  assert(errors.length === 0, `[${label}] no console errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
  await page.close();
}

await run({ width: 1366, height: 900 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} kontrol zlyhalo`);
  process.exit(1);
}
console.log('\nE2E OK');
