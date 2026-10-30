// Browser tests for the job-first v2 layout, built into docs/v2/ from index.html plus v2/.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { openApp } = require('./helpers');

const income = (id, extra) => Object.assign({ id, date: '2026-10-20', company: 'BCA', incomeType: 'Delivery', amount: '80', jobRef: '', startTime: '', endTime: '', miles: '', registration: '', startPostcode: '', endPostcode: '', description: '' }, extra);
const openV2 = (seed, opts = {}) => openApp(seed, Object.assign({ hash: 'v2/' }, opts));

test('v2 opens on Jobs, and the old Home dashboard moves to Overview', async () => {
  const { page, errors, close } = await openV2({
    income: [income(1, { jobRef: 'J-1111-AAAA', startPostcode: 'LU1 2AB', endPostcode: 'M1 1AA' }), income(2, { amount: '20', incomeType: 'Waiting Time', jobRef: 'J-1111-AAAA' })],
    expenses: [{ id: 'e1', date: '2026-10-20', category: 'Fuel (Not Reimbursed)', amount: '15', company: 'BCA', jobRef: 'J-1111-AAAA', receipt: '', description: '', receiptImage: '' }],
  });
  assert.equal(await page.textContent('#tab0 .tb-label'), 'Jobs');
  assert.equal(await page.textContent('#tab1 .tb-label'), 'Overview');
  const card = page.locator('#pg0 .v2-job-card');
  assert.equal(await card.count(), 1);
  const text = await card.textContent();
  assert.match(text, /J-1111-AAAA/);
  assert.match(text, /£100\.00/);
  assert.match(text, /1 expense · £15\.00/);
  assert.match(text, /Net £85\.00/);

  await page.click('#tab1');
  assert.ok(await page.locator('#pg1 .v2-job-card').count() === 0);
  assert.ok((await page.innerHTML('#pg1')).length > 200, 'old dashboard rendered into Overview');
  assert.equal(await page.locator('#pg0 .v2-home').count(), 1, 'Jobs page left alone');
  assert.equal(await page.getAttribute('#pg1', 'id'), 'pg1');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 new job: + opens the chooser, saving a job opens its job page', async () => {
  const { page, errors, close } = await openV2({ income: [], expenses: [] });
  await page.click('#fabBtn');
  await page.click('#v2Chooser [data-act="manual"]');
  await page.fill('#f3', '95');
  await page.fill('#f4', 'J-2222-BBBB');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage'), /J-2222-BBBB/);
  assert.equal(await page.locator('#v2JobPage .v2-act').count(), 4);
  assert.equal(await page.locator('#pg0 .v2-job-card').count(), 1);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 job page: Add travel is linked to the job and comes back to the job page', async () => {
  const { page, errors, close } = await openV2({ income: [income(1, { jobRef: 'J-3333-CCCC' })], expenses: [] });
  await page.click('#pg0 .v2-job-card');
  await page.click('#v2JobPage [data-act="travel"]');
  assert.equal(await page.locator('#v2JobPage').count(), 0);
  assert.equal(await page.inputValue('#f_cat'), 'Travel (Reimbursed)');
  assert.equal(await page.inputValue('#f4c'), 'J-3333-CCCC');
  await page.fill('#f3', '12.50');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage'), /£12\.50/);
  const saved = await page.evaluate(() => DB.expenses[0]);
  assert.equal(saved.jobRef, 'J-3333-CCCC');
  assert.equal(saved.company, 'BCA');
  assert.equal(saved.date, '2026-10-20');

  // Cancelling a form opened from the job page also goes back to it
  await page.click('#v2JobPage [data-act="exp"]');
  await page.evaluate(() => closeSheet());
  await page.waitForSelector('#v2JobPage');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 job page asks for a job ref before expenses can be linked', async () => {
  const { page, errors, close } = await openV2({ income: [income(7)], expenses: [] });
  await page.click('#pg0 .v2-job-card');
  assert.equal(await page.locator('#v2JobPage .v2-act').count(), 0);
  await page.fill('#v2JobPage .v2-ref-input', 'J-4444-DDDD');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForSelector('#v2JobPage .v2-act');
  assert.equal(await page.evaluate(() => DB.income[0].jobRef), 'J-4444-DDDD');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 Scan job opens the job form and reads the photo', async () => {
  const { page, errors, close } = await openV2({ income: [], expenses: [] });
  await page.evaluate(() => { window.ocrIncomeReceipt = f => { window._scannedName = f.name; }; });
  await page.setInputFiles('#v2-job-camera', { name: 'job.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await page.waitForFunction(() => window._scannedName === 'job.jpg');
  assert.match(await page.getAttribute('#overlay', 'class'), /open/);
  assert.deepEqual(errors, []);
  await close();
});

test('the current app at /Plate-Track/ is unchanged by v2', async () => {
  const { page, errors, close } = await openApp({ income: [income(1, { jobRef: 'J-5555-EEEE' })], expenses: [] });
  assert.equal(await page.textContent('#tab0 .tb-label'), 'Home');
  assert.equal(await page.evaluate(() => typeof window.V2), 'undefined');
  assert.equal(await page.locator('.v2-home').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});
