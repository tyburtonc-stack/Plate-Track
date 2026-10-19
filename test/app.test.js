// Browser tests against the built app in docs/. Run with `npm test` (builds first).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DOCS = path.join(__dirname, '..', 'docs');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
let server, browser, base;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/Plate-Track/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const f = path.join(DOCS, p);
    if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}/Plate-Track/`;
  browser = await chromium.launch();
});
after(async () => { await browser.close(); server.close(); });

// Fresh page with onboarding skipped and optional seed data in localStorage.
async function openApp(seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(db => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('pt_onboarded', '1');
    if (db) localStorage.setItem('pt9', db);
  }, seed ? JSON.stringify(seed) : null);
  page.on('dialog', d => d.dismiss());
  await page.goto(base);
  await page.waitForFunction(() => typeof DB === 'object');
  return { page, errors, close: () => ctx.close() };
}

const expense = (id, extra) => Object.assign({ id: String(id), date: '2026-10-01', category: 'Fuel (Not Reimbursed)', amount: '10', company: '', jobRef: '', receipt: '', description: '', receiptImage: '' }, extra);

test('ukTax uses 2026/27 bands, Class 4 NI at 6%/2% and the allowance taper', async () => {
  const { page, close } = await openApp();
  const r = await page.evaluate(() => [0, 20000, 60000, 110000, 150000].map(p => ukTax(p)));
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
  near(r[0].tax, 0); near(r[0].ni, 0);
  near(r[1].tax, 1486); near(r[1].ni, 445.8);
  near(r[2].tax, 11432); near(r[2].ni, 2456.6);
  near(r[3].pa, 7570); near(r[3].tax, 33432); near(r[3].ni, 3456.6);
  near(r[4].pa, 0); near(r[4].tax, 53703); near(r[4].ni, 3456.6 + 40000 * 0.02);
  await close();
});

test('saving never writes the data into a cookie, and an old cookie is cleared', async () => {
  const { page, close } = await openApp();
  const cookie = await page.evaluate(() => {
    document.cookie = 'pt9=old; path=/';
    loadDB(); DB.expenses.push({ id: 'c1', date: '2026-10-01', category: 'Other', amount: '1' }); saveDB();
    return document.cookie;
  });
  assert.ok(!cookie.includes('pt9='), cookie);
  await close();
});

test('user text is escaped in the expense list and edit form', async () => {
  const evil = '<img src=x onerror="window.__xss=1">';
  const { page, close } = await openApp({ income: [], expenses: [expense(1, { category: evil, jobRef: evil, description: 'Say "hi"' })] });
  await page.evaluate(() => showTab(2));
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('#pg2 .exp-card-cat img').count(), 0);
  await page.evaluate(() => openSheet('expense', '1'));
  assert.equal(await page.inputValue('#f5'), 'Say "hi"');
  await close();
});

test('Expenses tab pages 40 at a time and clears its crash breadcrumb after painting', async () => {
  const many = Array.from({ length: 95 }, (_, i) => expense(i + 1));
  const { page, errors, close } = await openApp({ income: [], expenses: many });
  await page.evaluate(() => showTab(2));
  assert.equal(await page.locator('#pg2 .exp-card').count(), 40);
  await page.waitForFunction(() => localStorage.getItem('pt_exp_render') === null, null, { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll('#pg2 button')].find(b => b.textContent.includes('more')).click());
  assert.equal(await page.locator('#pg2 .exp-card').count(), 80);
  assert.deepEqual(errors, []);
  await close();
});

test('local receipts move into IndexedDB, still show, and are included in backups', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { page, errors, close } = await openApp({ income: [], expenses: [expense(7, { receiptImage: png })] });
  await page.waitForFunction(() => DB.expenses[0].receiptImage === 'idb:7', null, { timeout: 5000 });
  // The migration saves once after the whole batch, so wait for the stored copy to drop the image.
  await page.waitForFunction(() => !localStorage.getItem('pt9').includes('base64'), null, { timeout: 5000 });
  await page.evaluate(() => showTab(2));
  await page.waitForFunction(() => !!(document.querySelector('#pg2 img.receipt-thumb') || {}).src, null, { timeout: 5000 });
  const src = await page.evaluate(() => document.querySelector('#pg2 img.receipt-thumb').src);
  assert.equal(src, png);
  const backup = await page.evaluate(() => new Promise(res => {
    const orig = window.doExportWrite;
    window.doExportWrite = r => { window.doExportWrite = orig; res(r); };
    doExport();
  }));
  assert.equal(backup['7'], png);
  assert.deepEqual(errors, []);
  await close();
});

test('signed-out users with data see the backup reminder until they back up', async () => {
  const { page, close } = await openApp({ income: [], expenses: [expense(1)] });
  await page.evaluate(() => showTab(0));
  assert.equal(await page.locator('#pg0 >> text=Back up now').count(), 1);
  await page.evaluate(() => { localStorage.setItem('pt_last_backup', String(Date.now())); rDash(); });
  assert.equal(await page.locator('#pg0 >> text=Back up now').count(), 0);
  await close();
});

test('build stamps the service worker cache with a content hash', () => {
  const sw = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE_NAME = 'platetrack-[0-9a-f]{10}';/);
});

test('Diagnostics screen reports status and its test tools work', async () => {
  const { page, errors, close } = await openApp({ income: [], expenses: [expense(1)] });
  await page.evaluate(() => openDiagnostics());
  await page.waitForFunction(() => document.getElementById('diag-body').textContent.includes('Test tools'));
  const text = await page.textContent('#diag-body');
  assert.match(text, /Tax rates 2026\/27/);
  assert.match(text, /platetrack-[0-9a-f]{10}/);
  assert.equal(await page.locator('#diag-body >> text=❌').count(), 0, text);
  await page.evaluate(() => diagAddTestExpense());
  await page.evaluate(() => { document.getElementById('diag-overlay').remove(); showTab(2); });
  assert.equal(await page.locator('#pg2 .exp-card b, #pg2 .exp-card i').count(), 0);
  assert.match(await page.textContent('#pg2'), /<b>not bold<\/b>/);
  await page.evaluate(() => diagRemoveTestExpense());
  assert.equal(await page.evaluate(() => DB.expenses.some(e => e.id === 'diag-test')), false);
  assert.deepEqual(errors, []);
  await close();
});
