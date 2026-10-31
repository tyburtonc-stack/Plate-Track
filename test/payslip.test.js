// Payslip cross-check: matching payslip lines to logged pay and reimbursed expenses (fuzzyMatchPayslip),
// and ticking off paid jobs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const inc = (id, x) => Object.assign({ id, date: '2026-10-20', company: 'BCA', incomeType: 'Delivery', amount: '80', jobRef: '' }, x);
const exp = (id, x) => Object.assign({ id, date: '2026-10-20', category: 'Travel (Reimbursed)', amount: '10', company: 'BCA', jobRef: '', receiptImage: '' }, x);
const match = (page, items, entries) => page.evaluate(({ items, entries }) => {
  const m = fuzzyMatchPayslip(items, entries);
  return {
    matched: m.matched.map(g => g.item.ref + ' ' + g.item.amount + ' -> ' + g.entry.id + (g.amountMatch ? '' : ' (amount differs)') + (g.adoptRef ? ' (adopt ref)' : '')),
    missing: m.missing.map(g => g.item.ref + ' ' + g.item.amount),
    extra: m.extra.map(e => String(e.id)),
  };
}, { items, entries });

test('payslip lines match logged jobs, waiting time and travel by ref', async () => {
  const { page, errors, close } = await openApp({ income: [], expenses: [] });
  // BCA self-bill: travel paid as one INTRAV line covering two receipts
  let r = await match(page,
    [{ ref: '12027220', type: 'JOB', amount: 85 }, { ref: '12027220', type: 'WTG', amount: 15 }, { ref: '12027220', type: 'INTRAV', amount: 18.4 }],
    [inc('j', { jobRef: '12027220', amount: '85' }), inc('w', { jobRef: '12027220', amount: '15', incomeType: 'Waiting Time' }), exp('t1', { jobRef: '12027220', amount: '10' }), exp('t2', { jobRef: '12027220', amount: '8.40' })]);
  assert.equal(r.matched.length, 3);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
  // Engineius invoice: job and reimbursed fuel
  r = await match(page,
    [{ ref: 'J-851B-8E65', amount: 110, company: 'Engineius', description: 'Birmingham to Manchester' }, { ref: 'J-851B-8E65', amount: 18.4, company: 'Engineius', description: 'Additional Charge: Fuel' }],
    [inc('j', { company: 'Engineius', jobRef: 'J-851B-8E65', amount: '110' }), exp('f', { company: 'Engineius', jobRef: 'J-851B-8E65', category: 'Fuel (Reimbursed)', amount: '18.40' })]);
  assert.deepEqual(r.matched, ['J-851B-8E65 110 -> j', 'J-851B-8E65 18.4 -> f']);
  // A missing line and a job not on the slip are both reported
  r = await match(page, [{ ref: '111', type: 'JOB', amount: 50 }], [inc('x', { jobRef: '222', amount: '60' })]);
  assert.deepEqual(r.missing, ['111 50']);
  assert.deepEqual(r.extra, ['x']);
  assert.deepEqual(errors, []);
  await close();
});

test('a job logged without its real ref matches only when it is the one job with that amount', async () => {
  const { page, errors, close } = await openApp({ income: [], expenses: [] });
  const line = [{ ref: 'J-B091-6FDF', amount: 320.67, company: 'Engineius', description: 'Coventry - Worcester' }];
  let r = await match(page, line, [inc('t', { company: 'Engineius', jobRef: 'PT-7KQ2M', amount: '320.67' })]);
  assert.deepEqual(r.matched, ['J-B091-6FDF 320.67 -> t (adopt ref)'], 'temporary ref');
  r = await match(page, line, [inc('n', { company: 'Engineius', amount: '320.67' })]);
  assert.deepEqual(r.matched, ['J-B091-6FDF 320.67 -> n (adopt ref)'], 'no ref');
  // Two £100 jobs with no ref: can't tell which, so neither is matched
  r = await match(page, [{ ref: 'J-1111-AAAA', amount: 100, company: 'Engineius' }],
    [inc('a', { company: 'Engineius', amount: '100' }), inc('b', { company: 'Engineius', amount: '100', date: '2026-10-21' })]);
  assert.deepEqual(r.matched, []);
  assert.deepEqual(r.missing, ['J-1111-AAAA 100']);
  // A job that has a different real ref is never taken this way
  r = await match(page, line, [inc('o', { company: 'Engineius', jobRef: 'J-0000-OTHR', amount: '320.67' })]);
  assert.deepEqual(r.matched, []);
  // Different company: not matched
  r = await match(page, line, [inc('c', { company: 'BCA', amount: '320.67' })]);
  assert.deepEqual(r.matched, []);
  assert.deepEqual(errors, []);
  await close();
});

test('ticking off paid jobs gives a job on a temporary ref the payslip ref, with its expenses and legs', async () => {
  const { page, errors, close } = await openApp({
    income: [inc('t', { company: 'Engineius', jobRef: 'PT-7KQ2M', amount: '320.67' })],
    expenses: [exp('h', { company: 'Engineius', jobRef: 'PT-7KQ2M', category: 'Hotel (Not Reimbursed)', amount: '64' })],
    jobs: { 'PT-7KQ2M': { status: 'active', legs: [{ reg: 'LC68ZZS', fromPc: 'CV6 5SL', toPc: 'ST18 0RB' }] } },
  }, { storage: { pt_payslips: JSON.stringify([{ status: 'done', periodFrom: '2026-10-01', periodTo: '2026-10-31', manualTotal: '320.67', items: [{ ref: 'J-B091-6FDF', amount: 320.67, company: 'Engineius', description: 'Route' }] }]) } });
  await page.evaluate(() => showTab(3));
  assert.match(await page.textContent('#pg3'), /Every payslip line is logged/);
  assert.match(await page.textContent('#pg3'), /J-B091-6FDF is added when you tick off/);
  await page.evaluate(() => psMarkPaid(0));
  const after = await page.evaluate(() => ({ inc: DB.income[0].jobRef, exp: DB.expenses[0].jobRef, meta: DB.jobs['J-B091-6FDF'], old: DB.jobs['PT-7KQ2M'] }));
  assert.equal(after.inc, 'J-B091-6FDF');
  assert.equal(after.exp, 'J-B091-6FDF');
  assert.equal(after.meta.paidJob, true);
  assert.equal(after.meta.legs.length, 1);
  assert.equal(after.old, undefined);
  assert.deepEqual(errors, []);
  await close();
});
