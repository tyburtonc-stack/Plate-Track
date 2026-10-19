// Browser tests against the built app in docs/. Run with `npm test` (builds first).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { openApp, DOCS } = require('./helpers');

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

test('notes can be added, ticked, edited and deleted (including old numeric ids)', async () => {
  const seed = { income: [{ id: '1', date: '2026-10-01', company: 'BCA', amount: '50', jobRef: 'J-77' }], expenses: [],
    notes: [{ id: 1739000000000, ts: '2026-10-01T09:00:00Z', text: 'Old note with a numeric id', jobRef: '', done: false }] };
  const { page, errors, close } = await openApp(seed);
  await page.evaluate(() => { const a = document.getElementById('auth-modal'); if (a) a.style.display = 'none'; openNotesPanel(); });
  const yes = async () => page.evaluate(() => document.getElementById('sc-yes').click());

  // tick off the old numeric-id note, then delete it
  await page.evaluate(() => document.querySelector('#notesListBox button[aria-label="Mark done"]').click());
  assert.equal(await page.evaluate(() => DB.notes[0].done), true);
  await page.evaluate(() => document.querySelector('#notesListBox button[aria-label="Delete note"]').click());
  await yes();
  assert.equal(await page.evaluate(() => DB.notes.length), 0);
  assert.match(await page.textContent('#notesCount'), /^0 notes/);

  // add a note that links to a job, edit it, then delete it
  await page.fill('#noteInput', "Keys left with Dave's mate for J-77");
  await page.evaluate(() => document.getElementById('noteAddBtn').click());
  assert.equal(await page.evaluate(() => DB.notes[0].jobRef), 'J-77');
  assert.match(await page.textContent('#notesCount'), /^1 note/);
  await page.evaluate(() => document.querySelector('#notesListBox button[aria-label="Edit note"]').click());
  await page.fill('#noteEditText', 'Edited note');
  await page.evaluate(() => [...document.querySelectorAll('#notesListBox button')].find(b => b.textContent === 'Save').click());
  assert.equal(await page.evaluate(() => DB.notes[0].text), 'Edited note');
  await page.evaluate(() => document.querySelector('#notesListBox button[aria-label="Delete note"]').click());
  await yes();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pt9')).notes.length), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('a job note can be deleted', async () => {
  const seed = { income: [{ id: '1', date: '2026-10-01', company: 'BCA', amount: '50', jobRef: 'J-9' }], expenses: [],
    jobs: { 'J-9': { status: '', note: 'Scratch on bumper' } } };
  const { page, errors, close } = await openApp(seed);
  await page.evaluate(() => showJobNotePrompt('J-9', ''));
  await page.evaluate(() => document.querySelector('.jn-delete').click());
  assert.equal(await page.evaluate(() => DB.jobs['J-9'].note), '');
  assert.deepEqual(errors, []);
  await close();
});

test('a cloud pull does not bring back a note deleted on this device', async () => {
  const { page, close } = await openApp({ income: [], expenses: [], notes: [{ id: 'n1', ts: '2026-10-01T09:00:00Z', text: 'A', done: false }, { id: 'n2', ts: '2026-10-01T09:00:00Z', text: 'B', done: false }] });
  const result = await page.evaluate(async () => {
    const cloud = { jobs: DB.jobs, notes: DB.notes.slice() };
    jobMetaMarkSynced();                                   // device and cloud agree on A + B
    DB.notes = DB.notes.filter(n => n.id !== 'n2');        // delete B locally; upload hasn't happened
    const pushed = [];
    SUPA_USER = { id: 'u1' }; SUPA_SESSION = { access_token: 't' };
    window.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') { pushed.push(JSON.parse(opts.body).job_meta); return { ok: true, json: async () => [] }; }
      return { ok: true, json: async () => [{ job_meta: cloud }] };
    };
    await new Promise(r => supaJobMetaPull(r));
    return { local: DB.notes.map(n => n.id), pushed: pushed.map(j => j.notes.map(n => n.id)) };
  });
  assert.deepEqual(result.local, ['n1']);
  assert.deepEqual(result.pushed, [['n1']]);
  await close();
});

test('notes auto-link to jobs by dashed job ref or by plate typed with a space', async () => {
  const seed = { income: [{ id: '1', date: '2026-10-01', company: 'Engineius', amount: '50', jobRef: 'J-85CA-5D30', registration: 'AB12CDE' },
                          { id: '2', date: '2026-10-02', company: 'BCA', amount: '40', jobRef: '123456' }], expenses: [] };
  const { page, close } = await openApp(seed);
  const r = await page.evaluate(() => [noteAutoLink('keys for j-85ca-5d30 left'), noteAutoLink('Damage on AB12 CDE'), noteAutoLink('ref 1234567 is different'), noteAutoLink('nothing here')]);
  assert.deepEqual(r, ['J-85CA-5D30', 'J-85CA-5D30', '', '']);
  await close();
});

// Dashboard stat chips read as text, e.g. { 'This Week': '£70.00', ... }
async function dashStats(page) {
  return page.evaluate(() => {
    showTab(0);
    const out = {};
    document.querySelectorAll('#pg0 .stat-chip').forEach(c => { out[c.querySelector('.stat-chip-label').textContent] = c.querySelector('.stat-chip-val').textContent; });
    out.hero = document.querySelector('#pg0 .dash-hero-amount').textContent;
    return out;
  });
}

test('dashboard figures are profit: expenses reduce today, this week and this month', async () => {
  const { page, errors, close } = await openApp({ income: [], expenses: [] });
  await page.evaluate(() => {
    const td = today();
    DB.income.push({ id: 'i1', date: td, company: 'BCA', amount: '100', jobRef: 'J1' });
    DB.expenses.push({ id: 'e1', date: td, category: 'Fuel (Not Reimbursed)', amount: '30' });
    DB.expenses.push({ id: 'e2', date: td, category: 'Fuel (Reimbursed)', amount: '20' }); // paid back: no effect
    saveDB();
  });
  let s = await dashStats(page);
  assert.equal(s.hero, '£70.00');
  assert.equal(s['This Week'], '£70.00');
  assert.equal(s['This Month'], '£70.00');

  // adding another expense today must lower every figure straight away
  await page.evaluate(() => { DB.expenses.push({ id: 'e3', date: today(), category: 'Tolls (Not Reimbursed)', amount: '15' }); saveDB(); });
  s = await dashStats(page);
  assert.equal(s.hero, '£55.00');
  assert.equal(s['This Week'], '£55.00');
  assert.equal(s['This Month'], '£55.00');

  // a loss shows as a negative number, not £0
  await page.evaluate(() => { DB.expenses.push({ id: 'e4', date: today(), category: 'Hotel (Not Reimbursed)', amount: '80' }); saveDB(); });
  s = await dashStats(page);
  assert.equal(s.hero, '-£25.00');
  assert.equal(s['This Week'], '-£25.00');
  assert.deepEqual(errors, []);
  await close();
});

test('tax pot covers the current tax year only, and multi-year tax uses each year\'s rates', async () => {
  const { page, close } = await openApp({ income: [
    { id: 'a', date: '2026-10-01', company: 'BCA', amount: '30000' },
    { id: 'b', date: '2023-10-01', company: 'BCA', amount: '30000' } ], expenses: [] }, { now: '2026-10-19T12:00:00' });
  const r = await page.evaluate(() => {
    showTab(0);
    const pot = [...document.querySelectorAll('#pg0 .stat-chip')].find(c => c.textContent.includes('Tax Pot'));
    const t = calcs();
    return { pot: pot.querySelector('.stat-chip-val').textContent, potSub: pot.querySelector('.stat-chip-sub').textContent, tax: t.tax, ni: t.ni };
  });
  assert.equal(r.pot, '£4531.80');                         // 2026/27 only: 3486 tax + 1045.80 Class 4
  assert.equal(r.potSub, 'est. 2026/27');
  assert.ok(Math.abs(r.tax - 2 * 3486) < 0.01);             // two separate years, not one £60k year
  assert.ok(Math.abs(r.ni - (1045.8 + 1568.7 + 179.4)) < 0.01); // 2023/24: Class 4 at 9% + Class 2 £3.45 x 52
  await close();
});

test('company filter: profit only deducts that company\'s expenses', async () => {
  const { page, close } = await openApp({ income: [
    { id: 'i1', date: '2026-10-01', company: 'BCA', amount: '200' },
    { id: 'i2', date: '2026-10-01', company: 'Engineius', amount: '300' } ], expenses: [
    { id: 'e1', date: '2026-10-01', company: 'BCA', category: 'Fuel (Not Reimbursed)', amount: '50' },
    { id: 'e2', date: '2026-10-01', company: '', category: 'Other', amount: '40' } ] });
  const r = await page.evaluate(() => {
    const all = calcs().profit;
    FCO = 'BCA'; const bca = calcs().profit; FCO = 'All';
    return { all, bca };
  });
  assert.equal(r.all, 410);  // 500 - 50 - 40
  assert.equal(r.bca, 150);  // 200 - 50
  await close();
});

test('AI requests carry the sign-in token, and signed-out users are asked to sign in', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] });
  const r = await page.evaluate(async () => {
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = async (url, opts) => { sent.push({ url, opts }); return new Response('{"content":[{"type":"text","text":"ok"}]}'); };
    const out = await (await aiFetch({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })).json();
    const signedOut = { out, calls: sent.length };
    SUPA_USER = { id: 'u1' }; SUPA_SESSION = { access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 };
    const ok = await (await aiFetch({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })).json();
    window.fetch = realFetch;
    const call = sent[0];
    return { signedOut, ok, url: call.url, auth: call.opts.headers.Authorization, body: JSON.parse(call.opts.body) };
  });
  assert.equal(r.signedOut.calls, 0);
  assert.match(r.signedOut.out.error.message, /sign in/i);
  assert.equal(r.ok.content[0].text, 'ok');
  assert.equal(r.url, 'https://platetrack-ai.tyburtonc.workers.dev/');
  assert.equal(r.auth, 'Bearer tok');
  assert.equal(r.body.model, undefined); // the worker picks the model
  await close();
});
