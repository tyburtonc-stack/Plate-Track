// Receipt photos in the cloud (Supabase Storage) are deleted with their expense or when the photo is removed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const USER = { id: 'u1', email: 'driver@example.com' };
const SESSION = JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 4102444800, user: USER });
const exp = (id, x) => Object.assign({ id, date: '2026-10-20', category: 'Fuel (Not Reimbursed)', amount: '30', company: '', jobRef: '', receipt: '', description: '', receiptImage: '' }, x);

function fakeCloud() {
  const state = { storageDeletes: [], offline: false };
  state.route = route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.indexOf('/storage/v1/object/') === 0 && req.method() === 'DELETE') {
      if (state.offline) return route.abort('internetdisconnected');
      state.storageDeletes.push(decodeURIComponent(url.pathname.replace('/storage/v1/object/', '')));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/rest/v1/users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ name: 'T', companies: [], income_types: [], job_meta: null }]) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  };
  return state;
}
const signedIn = (s, seed) => openApp(seed, { route: s.route, storage: { pt_sess: SESSION } });

test('deleting an expense deletes its receipt photo from cloud storage', async () => {
  const s = fakeCloud();
  const { page, errors, close } = await signedIn(s, { income: [], expenses: [exp('e1', { receiptImage: 'supabase:u1/e1.jpg' }), exp('e2')] });
  await page.waitForFunction(() => typeof SUPA_USER === 'object' && SUPA_USER);
  await page.evaluate(() => doSwipeDelete('expense', 'e1'));
  await page.waitForFunction(() => DB.expenses.length === 1);
  await page.waitForTimeout(300);
  assert.deepEqual(s.storageDeletes, ['Receipts/u1/e1.jpg']);
  // An expense with no cloud photo deletes nothing in storage
  await page.evaluate(() => doSwipeDelete('expense', 'e2'));
  await page.waitForTimeout(300);
  assert.deepEqual(s.storageDeletes, ['Receipts/u1/e1.jpg']);
  assert.deepEqual(errors, []);
  await close();
});

test('removing a receipt photo deletes it from storage; a failed delete is retried on the next sync', async () => {
  const s = fakeCloud();
  const { page, errors, close } = await signedIn(s, { income: [], expenses: [exp('e1', { receiptImage: 'supabase:u1/e1.jpg' })] });
  await page.waitForFunction(() => typeof SUPA_USER === 'object' && SUPA_USER);
  s.offline = true;
  await page.evaluate(() => deleteReceiptImage('e1'));
  await page.waitForFunction(() => localStorage.getItem('pt_pending_receipt_deletes') !== null);
  assert.deepEqual(s.storageDeletes, []);
  s.offline = false;
  await page.evaluate(() => retryPendingDeletes());
  await page.waitForFunction(() => localStorage.getItem('pt_pending_receipt_deletes') === null);
  assert.deepEqual(s.storageDeletes, ['Receipts/u1/e1.jpg']);
  assert.equal(await page.evaluate(() => DB.expenses[0].receiptImage), '');
  assert.deepEqual(errors, []);
  await close();
});

test('a photo still used by another expense is not deleted', async () => {
  const s = fakeCloud();
  const { page, errors, close } = await signedIn(s, { income: [], expenses: [exp('e1', { receiptImage: 'supabase:u1/e1.jpg' }), exp('e2', { receiptImage: 'supabase:u1/e1.jpg' })] });
  await page.waitForFunction(() => typeof SUPA_USER === 'object' && SUPA_USER);
  await page.evaluate(() => doSwipeDelete('expense', 'e1'));
  await page.waitForTimeout(300);
  assert.deepEqual(s.storageDeletes, []);
  assert.deepEqual(errors, []);
  await close();
});
