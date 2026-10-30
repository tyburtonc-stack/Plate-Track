// Shared setup for the browser tests: serves docs/ and opens the app with seed data.
const { before, after } = require('node:test');
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
// opts.now: fixed wall-clock time (e.g. '2026-10-25T12:00:00', read in opts.timezoneId);
// opts.timezoneId: IANA zone for the browser (default Europe/London).
async function openApp(seed, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: opts.timezoneId || 'Europe/London' });
  const page = await ctx.newPage();
  if (opts.now) await page.clock.setFixedTime(opts.instant ? new Date(opts.now) : localInstant(opts.now, opts.timezoneId || 'Europe/London'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(db => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('pt_onboarded', '1');
    if (db.seed) localStorage.setItem('pt9', db.seed);
    Object.keys(db.storage || {}).forEach(k => localStorage.setItem(k, db.storage[k]));
  }, { seed: seed ? JSON.stringify(seed) : null, storage: opts.storage || {} });
  page.on('dialog', d => d.dismiss());
  if (opts.route) await page.route('https://sedrloixvoqbhbywrrvr.supabase.co/**', opts.route);
  await page.goto(base + (opts.hash || ''));
  await page.waitForFunction(() => typeof DB === 'object');
  return { page, errors, close: () => ctx.close() };
}


// The instant at which the wall clock in timeZone reads `local` ('YYYY-MM-DDTHH:MM:SS').
function localInstant(local, timeZone) {
  const guess = new Date(local + 'Z');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(guess).reduce((o, p) => (o[p.type] = p.value, o), {});
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

module.exports = { openApp, DOCS };
