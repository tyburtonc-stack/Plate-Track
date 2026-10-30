// Cloud sync against a stand-in Supabase that keeps state: offline edits, deletes on other
// devices, failed downloads. Each scenario reloads the app the way reopening it on a phone would.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const USER = { id: 'u1', email: 'driver@example.com' };
const SESSION = JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 4102444800, user: USER });

function fakeSupabase() {
  const db = { income: [], expenses: [] };
  const state = { db, offline: false, failGet: null, deletes: [] };
  state.route = route => {
    const req = route.request(), url = new URL(req.url()), m = url.pathname.match(/^\/rest\/v1\/(income|expenses)$/);
    if (state.offline) return route.abort('internetdisconnected');
    const ok = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (m) {
      const t = m[1];
      if (req.method() === 'GET') return state.failGet === t ? ok({ message: 'boom' }, 500) : ok(db[t]);
      if (req.method() === 'POST') {
        JSON.parse(req.postData()).forEach(row => { const i = db[t].findIndex(r => r.id === row.id); if (i >= 0) db[t][i] = row; else db[t].push(row); });
        return ok([], 201);
      }
      if (req.method() === 'DELETE') {
        const id = url.searchParams.get('id').replace(/^eq\./, '');
        state.deletes.push(t + ':' + id); db[t] = db[t].filter(r => r.id !== id); return ok([], 204);
      }
    }
    if (url.pathname === '/rest/v1/users') return req.method() === 'GET' ? ok([{ name: 'Test', companies: [], income_types: [], job_meta: null }]) : ok([], 204);
    return ok([]);
  };
  return state;
}
const row = (id, amount, extra) => Object.assign({ id, user_id: 'u1', date: '2026-10-01', company: 'BCA', income_type: 'Delivery', amount, job_ref: '', start_time: '', end_time: '', miles: null, registration: '', start_postcode: '', end_postcode: '', description: '' }, extra);
const item = (id, amount) => ({ id, date: '2026-10-01', company: 'BCA', incomeType: 'Delivery', amount: String(amount), jobRef: '', startTime: '', endTime: '', miles: '', registration: '', startPostcode: '', endPostcode: '', description: '' });
const settled = page => page.waitForFunction(() => localStorage.getItem('pt_sync_base') !== null && !window._syncT_pending, null, { timeout: 8000 });
const idle = page => page.waitForTimeout(2600); // let the 2s save->upload timer run
const local = page => page.evaluate(() => DB.income.map(x => String(x.id) + '=' + x.amount).sort());

async function start(server, seedItems) {
  const app = await openApp({ income: seedItems, expenses: [] }, { route: server.route, storage: { pt_sess: SESSION } });
  await settled(app.page);
  return app;
}

test('an entry added with no signal is kept and uploaded when the app is reopened', async () => {
  const s = fakeSupabase(); s.db.income.push(row('A', 40));
  const { page, close } = await start(s, [item('A', 40)]);
  s.offline = true;
  await page.evaluate(() => { DB.income.push({ id: 'B', date: '2026-10-02', company: 'BCA', incomeType: 'Delivery', amount: '55' }); saveDB(); });
  await idle(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_sync_failed')), '1');
  s.offline = false;
  await page.reload();
  await page.waitForFunction(() => localStorage.getItem('pt_sync_failed') === null, null, { timeout: 8000 });
  assert.deepEqual(await local(page), ['A=40', 'B=55']);
  assert.deepEqual(s.db.income.map(r => r.id + '=' + r.amount).sort(), ['A=40', 'B=55']);
  await close();
});

test('an entry deleted on another device disappears here too', async () => {
  const s = fakeSupabase(); s.db.income.push(row('A', 40), row('B', 50));
  const { page, close } = await start(s, [item('A', 40), item('B', 50)]);
  s.db.income = s.db.income.filter(r => r.id !== 'B');        // deleted on the other phone
  await page.reload(); await page.waitForTimeout(1500);
  assert.deepEqual(await local(page), ['A=40']);
  assert.deepEqual(s.db.income.map(r => r.id), ['A']);        // and not re-uploaded
  await close();
});

test('an edit made offline survives; an edit made elsewhere comes through', async () => {
  const s = fakeSupabase(); s.db.income.push(row('A', 40), row('B', 50));
  const { page, close } = await start(s, [item('A', 40), item('B', 50)]);
  s.offline = true;
  await page.evaluate(() => { DB.income.find(x => x.id === 'A').amount = '45'; saveDB(); });
  await idle(page);
  s.offline = false;
  s.db.income.find(r => r.id === 'B').amount = 70;             // edited on the other phone
  await page.reload();
  await page.waitForFunction(() => localStorage.getItem('pt_sync_failed') === null, null, { timeout: 8000 });
  assert.deepEqual(await local(page), ['A=45', 'B=70']);
  assert.deepEqual(s.db.income.map(r => r.id + '=' + r.amount).sort(), ['A=45', 'B=70']);
  await close();
});

test('a delete made offline does not come back, and reaches the cloud later', async () => {
  const s = fakeSupabase(); s.db.income.push(row('A', 40), row('B', 50));
  const { page, close } = await start(s, [item('A', 40), item('B', 50)]);
  s.offline = true;
  await page.evaluate(() => doSwipeDelete('income', 'B'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pt_pending_deletes') || '[]').length === 1);
  s.offline = false;
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pt_pending_deletes') || '[]').length === 0, null, { timeout: 8000 });
  assert.deepEqual(await local(page), ['A=40']);
  assert.deepEqual(s.db.income.map(r => r.id), ['A']);
  assert.ok(s.deletes.includes('income:B'));
  await close();
});

test('a failed download never wipes data on the phone', async () => {
  const s = fakeSupabase(); s.db.income.push(row('A', 40)); s.db.expenses.push({ id: 'E', user_id: 'u1', date: '2026-10-01', category: 'Other', amount: 5, company: '', job_ref: '', receipt: '', description: '', receipt_image: '' });
  const { page, close } = await start(s, [item('A', 40)]);
  s.failGet = 'income';
  await page.reload(); await page.waitForTimeout(1500);
  assert.deepEqual(await local(page), ['A=40']);
  await close();
});

test('the upload only says "Synced" when it actually worked', async () => {
  const s = fakeSupabase();
  const { page, close } = await start(s, [item('A', 40)]);
  const toasts = [];
  await page.exposeFunction('__toast', t => toasts.push(t));
  await page.evaluate(() => { const o = showToast; showToast = t => { window.__toast(t); o(t); }; });
  s.offline = true;
  await page.evaluate(() => supaPushAll(null)); await page.waitForTimeout(500);
  s.offline = false;
  await page.evaluate(() => supaPushAll(null)); await page.waitForTimeout(500);
  assert.match(toasts[0], /Saved on this phone/);
  assert.match(toasts[toasts.length - 1], /Synced to cloud/);
  await close();
});
