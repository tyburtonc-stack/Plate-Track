// Browser tests for the job-first v2 layout, built into docs/v2/ from index.html plus v2/.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { openApp } = require('./helpers');

const income = (id, extra) => Object.assign({ id, date: '2026-10-20', company: 'BCA', incomeType: 'Delivery', amount: '80', jobRef: '', startTime: '', endTime: '', miles: '', registration: '', startPostcode: '', endPostcode: '', description: '' }, extra);
const openV2 = (seed, opts = {}) => openApp(seed, Object.assign({ hash: 'v2/' }, opts));
const openJobs = async (seed, opts) => { const app = await openV2(seed, opts); await app.page.click('#tab1'); return app; };

test('v2 opens on the Overview dashboard, with the job list on the second tab', async () => {
  const { page, errors, close } = await openV2({
    income: [income(1, { jobRef: 'J-1111-AAAA', startPostcode: 'LU1 2AB', endPostcode: 'M1 1AA' }), income(2, { amount: '20', incomeType: 'Waiting Time', jobRef: 'J-1111-AAAA' })],
    expenses: [{ id: 'e1', date: '2026-10-20', category: 'Fuel (Not Reimbursed)', amount: '15', company: 'BCA', jobRef: 'J-1111-AAAA', receipt: '', description: '', receiptImage: '' }],
  });
  assert.equal(await page.textContent('#tab0 .tb-label'), 'Overview');
  assert.equal(await page.textContent('#tab1 .tb-label'), 'Jobs');
  assert.match(await page.getAttribute('#tab0', 'class'), /\bon\b/);
  assert.ok((await page.innerHTML('#pg0')).length > 200, 'old dashboard rendered first');
  assert.equal(await page.locator('.v2-home').count(), 0, 'job list not drawn until its tab is opened');

  await page.click('#tab1');
  const card = page.locator('#pg1 .v2-job-card');
  assert.equal(await card.count(), 1);
  const text = await card.textContent();
  assert.match(text, /J-1111-AAAA/);
  assert.match(text, /£100\.00/);
  assert.match(text, /1 expense · £15\.00/);
  assert.match(text, /Net £85\.00/);
  assert.equal(await page.getAttribute('#pg1', 'id'), 'pg1');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 new job: + opens the chooser, saving a job opens its job page', async () => {
  const { page, errors, close } = await openJobs({ income: [], expenses: [] });
  await page.click('#fabBtn');
  await page.click('#v2Chooser [data-act="manual"]');
  await page.fill('#f3', '95');
  await page.fill('#f4', 'J-2222-BBBB');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage'), /J-2222-BBBB/);
  assert.equal(await page.locator('#v2JobPage .v2-act').count(), 4);
  assert.equal(await page.locator('#pg1 .v2-job-card').count(), 1);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 job page: Add travel is linked to the job and comes back to the job page', async () => {
  const { page, errors, close } = await openJobs({ income: [income(1, { jobRef: 'J-3333-CCCC' })], expenses: [] });
  await page.click('#pg1 .v2-job-card');
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

test('v2 job without a ref: expenses get a temporary ref, and the real ref moves everything over', async () => {
  const { page, errors, close } = await openJobs({ income: [income(7)], expenses: [] });
  await page.click('#pg1 .v2-job-card');
  assert.equal(await page.locator('#v2JobPage .v2-act').count(), 4, 'expense buttons work without a ref');
  await page.click('#v2JobPage [data-act="travel"]');
  const temp = await page.inputValue('#f4c');
  assert.match(temp, /^PT-[A-Z0-9]{5}$/);
  await page.fill('#f3', '9.80');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage .v2-ref-needed'), /temporary/);
  await page.fill('#v2JobPage .v2-ref-input', 'J-4444-DDDD');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForFunction(() => DB.income[0].jobRef === 'J-4444-DDDD');
  assert.equal(await page.evaluate(() => DB.expenses[0].jobRef), 'J-4444-DDDD');
  assert.equal(await page.locator('#v2JobPage .v2-ref-needed').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

// The three legs of the route in the example screenshots (Task 1, 2 and 3 of 3, £320.67).
const ROUTE = [
  { task_number: 1, leg: { registration: 'LC68ZZS', from_address: 'SMITH STREET TEC, Midland Road, Coventry', from_postcode: 'CV6 5SL', from_date: '2026-11-03', from_time: '09:00', to_address: 'Openreach c/o Bri-Stor, Stafford', to_postcode: 'ST18 0RB', to_date: '2026-11-03', to_time: '11:00', miles: 43 } },
  { task_number: 2, leg: { registration: 'DY26BZS', from_address: 'Bri-Stor Systems Ltd, Hixon, Stafford', from_postcode: 'ST18 0PS', from_date: '2026-11-03', from_time: '11:30', to_address: 'Environment Agency, Great Yarmouth', to_postcode: 'NR31 9JA', to_date: '2026-11-04', to_time: '10:15', miles: 194 } },
  { task_number: 3, leg: { registration: 'YM74LMY', from_address: '7 Catton Chase, Norwich', from_postcode: 'NR6 7AS', from_date: '2026-11-04', from_time: '12:00', to_address: 'Hudson Kapel Fleet Solutions, Worcester', to_postcode: 'WR5 2PR', to_date: '2026-11-05', to_time: '09:00', miles: 189 } },
];
// Replaces the AI call: one request for all the screenshots, answering with the legs of ROUTE in the
// given order. Records how many images each request carried.
async function fakeScans(page, order) {
  await page.evaluate(({ route, order }) => {
    window._aiCalls = [];
    window.aiFetch = body => {
      window._aiCalls.push(body.messages[0].content.filter(c => c.type === 'image').length);
      const legs = order.map(i => Object.assign({ task_number: route[i].task_number }, route[i].leg));
      const data = { amount: 320.67, job_ref: null, company: 'BCA', legs };
      return Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(data) }] })));
    };
  }, { route: ROUTE, order });
}
const jpg = name => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64') });

test('v2 Scan job reads several route screenshots into one job with its legs', async () => {
  const { page, errors, close } = await openV2({ income: [], expenses: [] });
  await fakeScans(page, [2, 0, 1, 0]); // out of order, with a repeat: legs still come out once each as Task 1, 2, 3
  await page.setInputFiles('#v2-job-library', [jpg('t3.jpg'), jpg('t1.jpg'), jpg('t2.jpg')]);
  await page.waitForFunction(() => document.getElementById('f3').value === '320.67');
  assert.equal(await page.inputValue('#f1'), '2026-11-03');
  assert.equal(await page.inputValue('#f_reg'), 'LC68ZZS');
  assert.equal(await page.inputValue('#f_sp'), 'CV6 5SL');
  assert.equal(await page.inputValue('#f_ep'), 'WR5 2PR');
  assert.equal(await page.inputValue('#f5'), '426');
  assert.deepEqual(await page.evaluate(() => window._aiCalls), [3], 'all three screenshots go in one request');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage .v2-leg');
  assert.equal(await page.locator('#v2JobPage .v2-leg').count(), 3);
  const regs = await page.locator('#v2JobPage .v2-leg-reg').allTextContents();
  assert.deepEqual(regs, ['LC68ZZS', 'DY26BZS', 'YM74LMY']);
  const gaps = await page.locator('#v2JobPage .v2-gap').allTextContents();
  assert.match(gaps[0], /Getting there → CV6 5SL/);
  assert.match(gaps[1], /ST18 0RB → ST18 0PS/);
  assert.match(gaps[2], /NR31 9JA → NR6 7AS/);
  assert.match(gaps[3], /Getting home from WR5 2PR/);
  assert.equal(await page.locator('#v2JobPage .v2-leg-night').count(), 2, 'legs 2 and 3 run overnight');
  // No job ref on the screenshots: the legs are kept, and move to the ref once it is typed in
  const id = await page.evaluate(() => String(DB.income[0].id));
  assert.equal(await page.evaluate(i => DB.jobs['__' + i].legs.length, id), 3);
  await page.fill('#v2JobPage .v2-ref-input', 'J-9999-ROUTE');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForSelector('#v2JobPage .v2-act');
  assert.equal(await page.evaluate(() => DB.jobs['J-9999-ROUTE'].legs.length), 3);
  assert.equal(await page.evaluate(i => DB.jobs['__' + i], id), undefined);
  await page.evaluate(() => document.getElementById('v2JobPage').remove());
  await page.click('#tab1');
  assert.match(await page.textContent('#pg1 .v2-job-card'), /3 legs/);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 legs: add a leg by hand, its miles count toward the job, travel between legs is linked', async () => {
  const { page, errors, close } = await openJobs({ income: [income(1, { jobRef: 'J-6666-LEGS', date: '2026-11-03' })], expenses: [] });
  await page.click('#pg1 .v2-job-card');
  const addLeg = async (vals) => {
    await page.click('#v2JobPage [data-leg="add"]');
    await page.click('#v2Chooser [data-act="manual"]');
    for (const [k, v] of Object.entries(vals)) await page.fill(`#v2Chooser [data-f="${k}"]`, v);
    await page.click('#v2Chooser [data-act="save"]');
    await page.waitForSelector('#v2JobPage');
  };
  await addLeg({ reg: 'lc68 zzs', fromPc: 'cv6 5sl', toPc: 'ST18 0RB', toDate: '2026-11-03', miles: '43' });
  await addLeg({ reg: 'DY26BZS', fromPc: 'ST18 0PS', fromDate: '2026-11-03', toPc: 'NR31 9JA', miles: '194' });
  assert.equal(await page.locator('#v2JobPage .v2-leg').count(), 2);
  assert.equal(await page.evaluate(() => DB.jobs['J-6666-LEGS'].legs[0].reg), 'LC68ZZS');
  assert.equal(await page.evaluate(() => DB.income[0].miles), '237');

  await page.click('#v2JobPage [data-leg="travel"]');
  assert.equal(await page.inputValue('#f_cat'), 'Travel (Reimbursed)');
  assert.equal(await page.inputValue('#f4c'), 'J-6666-LEGS');
  assert.equal(await page.inputValue('#f1'), '2026-11-03');
  await page.evaluate(() => closeSheet());
  await page.waitForSelector('#v2JobPage');

  // Delete a leg: miles follow
  await page.click('#v2JobPage .v2-leg >> nth=1');
  await page.click('#v2Chooser [data-act="del"]');
  await page.waitForSelector('#v2JobPage');
  assert.equal(await page.locator('#v2JobPage .v2-leg').count(), 1);
  assert.equal(await page.evaluate(() => DB.income[0].miles), '43');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 legs: abort one leg, the others carry on, and it can be reinstated', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-7777-ABRT', date: '2026-11-03' })],
    expenses: [],
    jobs: { 'J-7777-ABRT': { status: 'active', legs: [
      { reg: 'LC68ZZS', fromPc: 'CV6 5SL', toPc: 'ST18 0RB', fromDate: '2026-11-03', toDate: '2026-11-03', miles: '43' },
      { reg: 'DY26BZS', fromPc: 'ST18 0PS', toPc: 'NR31 9JA', fromDate: '2026-11-03', toDate: '2026-11-03', miles: '194' },
      { reg: 'YM74LMY', fromPc: 'NR6 7AS', toPc: 'WR5 2PR', fromDate: '2026-11-03', toDate: '2026-11-03', miles: '189' },
    ] } },
  });
  await page.click('#pg1 .v2-job-card');
  assert.match(await page.textContent('#v2JobPage .v2-legs-hdr'), /3 · 426 mi/);
  await page.click('#v2JobPage .v2-leg >> nth=1');
  await page.fill('#v2Chooser [data-f="abortCode"]', 'CXL999');
  await page.fill('#v2Chooser [data-f="abortReason"]', 'Car not ready');
  await page.click('#v2Chooser [data-act="abort"]');
  await page.waitForSelector('#v2JobPage .v2-leg-aborted');
  assert.match(await page.textContent('#v2JobPage .v2-legs-hdr'), /2 · 232 mi · 1 aborted/);
  assert.equal(await page.evaluate(() => DB.income[0].miles), '232');
  assert.match(await page.textContent('#v2JobPage .v2-leg-aborted'), /CXL999 — Car not ready/);
  assert.equal(await page.locator('#v2JobPage .v2-leg').count(), 3, 'aborted leg stays on the page');
  // Travel is worked out between the two legs still running (leg 1 to leg 3)
  const gaps = await page.locator('#v2JobPage .v2-gap').allTextContents();
  assert.ok(gaps.some(g => /ST18 0RB → NR6 7AS/.test(g)), gaps.join('|'));
  assert.ok(!gaps.some(g => /NR31 9JA/.test(g)), 'nothing planned from the aborted leg');
  // The job itself is still active and an abort fee can be logged against it
  assert.equal(await page.evaluate(() => DB.jobs['J-7777-ABRT'].status), 'active');
  await page.click('#v2JobPage [data-leg="abort-fee"]');
  assert.equal(await page.inputValue('#f4'), 'J-7777-ABRT');
  await page.evaluate(() => closeSheet());
  await page.waitForSelector('#v2JobPage');

  // Reinstate
  await page.click('#v2JobPage .v2-leg-aborted');
  await page.click('#v2Chooser [data-act="reinstate"]');
  await page.waitForSelector('#v2JobPage .v2-leg');
  assert.equal(await page.locator('#v2JobPage .v2-leg-aborted').count(), 0);
  assert.match(await page.textContent('#v2JobPage .v2-legs-hdr'), /3 · 426 mi/);
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
