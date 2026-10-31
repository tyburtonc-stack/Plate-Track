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
  assert.match(text, /£15\.00 exp\./);
  assert.equal(await page.locator('#pg1 .v2-pill-exp').count(), 1, 'orange expense pill');
  assert.doesNotMatch(await page.textContent('#pg1'), /Hi |This week/, 'no greeting on the Jobs page');
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

test('v2 job without a ref uses its reg as the ref; the company ref replaces it and moves everything', async () => {
  const { page, errors, close } = await openJobs({ income: [income(7, { registration: 'lc21 pdz' })], expenses: [] });
  await page.click('#pg1 .v2-job-card');
  assert.equal(await page.locator('#v2JobPage .v2-act').count(), 4, 'expense buttons work without a ref');
  await page.click('#v2JobPage [data-act="travel"]');
  assert.equal(await page.inputValue('#f4c'), 'LC21PDZ');
  await page.fill('#f3', '9.80');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage .v2-ref-needed'), /Using the reg LC21PDZ as the job ref/);
  assert.equal(await page.evaluate(() => DB.jobs.LC21PDZ.tempRef), true);
  await page.fill('#v2JobPage .v2-ref-input', 'J-4444-DDDD');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForFunction(() => DB.income[0].jobRef === 'J-4444-DDDD');
  assert.equal(await page.evaluate(() => DB.expenses[0].jobRef), 'J-4444-DDDD');
  assert.equal(await page.evaluate(() => DB.jobs['J-4444-DDDD'].tempRef), undefined);
  assert.equal(await page.locator('#v2JobPage .v2-ref-needed').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 reg refs: a reg already used by another job gets the date added; no reg means asking for one', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'LC21PDZ', date: '2026-10-01' }), income(2, { registration: 'LC21PDZ', date: '2026-11-04' }), income(3, { date: '2026-10-02' })],
    expenses: [],
  });
  await page.evaluate(() => openJobDetail('__2', '2'));
  await page.click('#v2JobPage [data-act="exp"]');
  assert.equal(await page.inputValue('#f4c'), 'LC21PDZ-0411');
  await page.evaluate(() => closeSheet());
  await page.waitForSelector('#v2JobPage');
  // A job with neither a ref nor a reg: the buttons ask for one, and a typed reg is used as the reg
  await page.evaluate(() => openJobDetail('__3', '3'));
  assert.match(await page.textContent('#v2JobPage .v2-ref-needed'), /No job ref or reg yet/);
  await page.click('#v2JobPage [data-act="exp"]');
  assert.equal(await page.locator('#overlay.open').count(), 0, 'no expense form without a ref or reg');
  await page.fill('#v2JobPage .v2-ref-input', 'yk19 abc');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForFunction(() => DB.income.some(x => String(x.id) === '3' && x.jobRef === 'YK19ABC'));
  const j = await page.evaluate(() => { const x = DB.income.find(i => String(i.id) === '3'); return { reg: x.registration, temp: DB.jobs.YK19ABC.tempRef }; });
  assert.deepEqual(j, { reg: 'YK19ABC', temp: true });
  assert.deepEqual(errors, []);
  await close();
});

test('v2 switches older PT- refs to the reg when it starts', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'PT-URL4E', date: '2026-11-04' })],
    expenses: [{ id: 'e1', date: '2026-11-04', category: 'Hotel (Not Reimbursed)', amount: '64', company: 'BCA', jobRef: 'PT-URL4E', receipt: '', description: '', receiptImage: '' }],
    jobs: { 'PT-URL4E': { status: 'active', legs: [{ reg: 'LC21PDZ', fromPc: 'LE12 5SH', toPc: 'LS9 0PS' }] } },
  });
  const d = await page.evaluate(() => ({ inc: DB.income[0].jobRef, exp: DB.expenses[0].jobRef, legs: DB.jobs.LC21PDZ.legs.length, temp: DB.jobs.LC21PDZ.tempRef, old: DB.jobs['PT-URL4E'] }));
  assert.deepEqual(d, { inc: 'LC21PDZ', exp: 'LC21PDZ', legs: 1, temp: true, old: undefined });
  assert.match(await page.textContent('#pg1 .v2-job-card'), /LC21PDZ/);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 Jobs search finds jobs by reg (with or without a space), leg reg, ref and postcode', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-1000-AAAA', registration: 'AB12CDE', startPostcode: 'LE12 5SH' }), income(2, { jobRef: 'J-2000-BBBB', date: '2026-10-19' })],
    expenses: [],
    jobs: { 'J-2000-BBBB': { legs: [{ reg: 'YM74LMY', fromPc: 'NR6 7AS', toPc: 'WR5 2PR', fromAddr: 'Catton Chase, Norwich' }] } },
  });
  const count = async q => { await page.fill('#v2-job-search', q); return page.locator('#pg1 .v2-job-card').count(); };
  assert.equal(await count('ab12 cde'), 1);
  assert.equal(await count('AB12CDE'), 1);
  assert.equal(await count('ym74'), 1);
  assert.equal(await count('J-2000'), 1);
  assert.equal(await count('le12 5sh'), 1);
  assert.equal(await count('norwich'), 1);
  assert.equal(await count('zz99'), 0);
  assert.match(await page.textContent('#pg1'), /No jobs match/);
  assert.equal(await count(''), 2);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'v2-job-search', 'typing keeps the keyboard up');
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
  // No job ref on the screenshots: the job uses leg 1's reg, and the legs move to the company ref once typed in
  assert.equal(await page.evaluate(() => DB.income[0].jobRef), 'LC68ZZS');
  assert.equal(await page.evaluate(() => DB.jobs.LC68ZZS.legs.length), 3);
  await page.fill('#v2JobPage .v2-ref-input', 'J-9999-ROUTE');
  await page.click('#v2JobPage .v2-ref-save');
  await page.waitForFunction(() => DB.jobs['J-9999-ROUTE']);
  assert.equal(await page.evaluate(() => DB.jobs['J-9999-ROUTE'].legs.length), 3);
  assert.equal(await page.evaluate(() => DB.jobs.LC68ZZS), undefined);
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

const exp = (id, extra) => Object.assign({ id, date: '2026-10-20', category: 'Fuel (Not Reimbursed)', amount: '12', company: 'BCA', jobRef: '', receipt: '', description: '', receiptImage: '' }, extra);

test('v2 job page shows pay, expenses, net and miles at the top', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-8888-TOTS', amount: '200', miles: '100' })],
    expenses: [exp('e1', { jobRef: 'J-8888-TOTS', amount: '30' }), exp('e2', { jobRef: 'J-8888-TOTS', category: 'Travel (Reimbursed)', amount: '18.40', receiptImage: 'supabase:x/e2.jpg' })],
  }, { now: '2026-10-25T12:00:00' });
  await page.click('#pg1 .v2-job-card');
  const tiles = await page.locator('#v2JobPage .v2-tile').allTextContents();
  assert.match(tiles[0], /Pay£200\.00/);
  assert.match(tiles[1], /Expenses£30\.00£18\.40 reimbursed/);
  assert.match(tiles[2], /Net£170\.00/);
  assert.match(tiles[3], /Miles100£2\.00\/mi/);
  assert.match(await page.textContent('#v2JobPage .v2-nudge-sm'), /1 expense on this job has no receipt photo/);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 copy job: new entry dated today with no ref, legs copied without dates or aborts', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-9000-COPY', amount: '150', startPostcode: 'CV6 5SL', endPostcode: 'WR5 2PR' })],
    expenses: [exp('e1', { jobRef: 'J-9000-COPY' })],
    jobs: { 'J-9000-COPY': { status: 'complete', legs: [
      { reg: 'AA11AAA', fromPc: 'CV6 5SL', toPc: 'ST18 0RB', fromDate: '2026-10-20', toDate: '2026-10-20', fromTime: '09:00', miles: '43' },
      { reg: 'BB22BBB', fromPc: 'ST18 0PS', toPc: 'WR5 2PR', fromDate: '2026-10-20', toDate: '2026-10-21', status: 'aborted', abortCode: 'X', miles: '80' }] } },
  }, { now: '2026-10-28T12:00:00' });
  await page.click('#pg1 .v2-job-card');
  await page.click('#v2JobPage .v2-copy-job');
  await page.waitForSelector('#overlay.open');
  assert.equal(await page.inputValue('#f1'), '2026-10-28');
  assert.equal(await page.inputValue('#f3'), '150');
  assert.equal(await page.inputValue('#f4'), '');
  await page.fill('#f4', 'J-9001-NEXT');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.match(await page.textContent('#v2JobPage'), /J-9001-NEXT/);
  const copy = await page.evaluate(() => ({ n: DB.income.length, legs: DB.jobs['J-9001-NEXT'] && DB.jobs['J-9001-NEXT'].legs, orphan: Object.keys(DB.jobs).filter(k => k.indexOf('__') === 0), exp: DB.expenses.filter(e => e.jobRef === 'J-9001-NEXT').length }));
  assert.equal(copy.n, 2);
  assert.equal(copy.legs.length, 2, 'legs moved to the ref typed in the form');
  assert.deepEqual(copy.orphan, []);
  assert.equal(copy.legs[0].fromDate, '');
  assert.equal(copy.legs[0].fromTime, '09:00');
  assert.equal(copy.legs[1].status, undefined);
  assert.equal(copy.exp, 0, 'expenses are not copied');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 swipe a job left to delete it; its expenses stay', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-1234-GONE' }), income(2, { jobRef: 'J-1234-GONE', incomeType: 'Waiting Time', amount: '10' }), income(3, { jobRef: 'J-5678-KEEP', date: '2026-10-19' })],
    expenses: [exp('e1', { jobRef: 'J-1234-GONE' })],
    jobs: { 'J-1234-GONE': { status: 'active', legs: [{ reg: 'AA11AAA', fromPc: 'CV6 5SL', toPc: 'ST18 0RB' }] } },
  });
  const card = page.locator('#pg1 .v2-job-card').first();
  const box = await card.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, y);
  await page.mouse.up();
  await page.waitForSelector('#pg1 .v2-swipe.open');
  assert.equal(await page.locator('#v2JobPage').count(), 0, 'a swipe does not open the job');
  await page.click('#pg1 .v2-swipe.open .v2-swipe-del');
  const msg = await page.textContent('body');
  assert.match(msg, /Delete job J-1234-GONE\?/);
  assert.match(msg, /2 pay entries go with it/);
  assert.match(msg, /Its 1 expense stays in your Expenses list/);
  await page.click('#sc-yes');
  await page.waitForFunction(() => DB.income.length === 1);
  const after = await page.evaluate(() => ({ inc: DB.income.map(x => x.jobRef), exp: DB.expenses.length, meta: DB.jobs['J-1234-GONE'] }));
  assert.deepEqual(after.inc, ['J-5678-KEEP']);
  assert.equal(after.exp, 1);
  assert.equal(after.meta, undefined);
  assert.equal(await page.locator('#pg1 .v2-job-card').count(), 1);
  // A plain tap still opens a job
  await page.click('#pg1 .v2-job-card');
  await page.waitForSelector('#v2JobPage');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 missing receipt nudge: lists this tax year\'s expenses of £10+ with no photo, and can be dismissed', async () => {
  const { page, errors, close } = await openJobs({
    income: [income(1, { jobRef: 'J-2222-RCPT' })],
    expenses: [
      exp('big', { jobRef: 'J-2222-RCPT', amount: '25', category: 'Hotel (Not Reimbursed)' }),
      exp('small', { amount: '4.50' }),
      exp('photo', { amount: '40', receiptImage: 'supabase:u/photo.jpg' }),
      exp('old', { amount: '60', date: '2025-12-01' }),
      exp('big2', { amount: '11', date: '2026-09-01' }),
    ],
  }, { now: '2026-10-25T12:00:00' });
  assert.match(await page.textContent('#pg1 .v2-nudge'), /2 expenses over £10 have no receipt photo/);
  await page.click('#pg1 .v2-nudge');
  assert.equal(await page.locator('#v2Chooser .v2-nudge-row').count(), 2);
  await page.click('#v2Chooser [data-skip="big2"]');
  assert.equal(await page.locator('#v2Chooser .v2-nudge-row').count(), 1);
  await page.click('#v2Chooser [data-photo="big"]');
  await page.waitForSelector('#overlay.open');
  assert.equal(await page.inputValue('#f3'), '25');
  await page.evaluate(() => closeSheet());
  assert.match(await page.textContent('#pg1 .v2-nudge'), /1 expense over £10 has no receipt photo/);
  assert.deepEqual(errors, []);
  await close();
});

test('v2 does not keep the job screenshot in the job record', async () => {
  const { page, errors, close } = await openJobs({ income: [], expenses: [] });
  await page.click('#fabBtn');
  await page.click('#v2Chooser [data-act="manual"]');
  await page.evaluate(() => { window._incomeImgData = 'data:image/jpeg;base64,AAAA'; });
  await page.fill('#f3', '50');
  await page.evaluate(() => doSave());
  await page.waitForSelector('#v2JobPage');
  assert.equal(await page.evaluate(() => DB.income[0].receiptImage), '');
  assert.deepEqual(errors, []);
  await close();
});

test('v2 legs without a time stay in the order added on the same day', async () => {
  const { page, errors, close } = await openJobs({ income: [income(1, { jobRef: 'J-3000-SORT', date: '2026-11-04' })], expenses: [],
    jobs: { 'J-3000-SORT': { legs: [
      { reg: 'AAA1', fromPc: 'LE12 5SH', fromDate: '2026-11-04', fromTime: '08:00' },
      { reg: 'BBB2', fromPc: 'LS10 1AB', fromDate: '2026-11-04' },
      { reg: 'CCC3', fromPc: 'B6 7EU', fromDate: '2026-11-03' }] } } });
  await page.click('#pg1 .v2-job-card');
  await page.click('#v2JobPage [data-leg="edit"] >> nth=0');
  await page.click('#v2Chooser [data-act="save"]');
  await page.waitForSelector('#v2JobPage');
  assert.deepEqual(await page.locator('#v2JobPage .v2-leg-reg').allTextContents(), ['CCC3', 'AAA1', 'BBB2']);
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
