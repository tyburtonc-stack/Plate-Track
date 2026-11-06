// Known-answer checks for every money figure. Expected values are worked out by hand from HMRC
// rules (shown in the comments), not from the app, and each scenario runs in several time zones.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const ZONES = ['Europe/London', 'America/Los_Angeles', 'Pacific/Auckland'];
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: got ${a}, expected ${b}`);

// [tax year, profit, income tax, total NI (Class 4 + Class 2)]
const TAX_CASES = [
  ['2026/27', 30000, 3486, 1045.80],   // (30000-12570)x20%; (30000-12570)x6%
  ['2025/26', 30000, 3486, 1045.80],
  ['2024/25', 60000, 11432, 2456.60],  // 37700x20% + 9730x40%; 37700x6% + 9730x2%
  ['2023/24', 30000, 3486, 1748.10],   // Class 4 17430x9% = 1568.70; Class 2 3.45x52 = 179.40
  ['2023/24', 5000, 0, 0],             // under the allowance and the profits limits
  ['2023/24', 140000, 49203, 5367.00], // no allowance; 45% above 125,140: 7540 + 34976 + 14860x45%; C4 3393 + 89730x2% + C2 179.40
  ['2022/23', 140000, 48460, 6346.05], // 45% only above 150,000: 7540 + 102300x40%; C4 38362x9.73% + 89730x2.73% + C2 3.15x52
  ['2022/23', 12000, 0, 172.75],       // C4 92x9.73% = 8.95; Class 2 due from 11,908: 163.80
  ['2021/22', 30000, 3486, 1997.48],   // C4 (30000-9568)x9% = 1838.88; C2 3.05x52 = 158.60
  ['2026/27', 110000, 33432, 3456.60], // allowance 12570-5000 = 7570; taxable 102430
  ['2026/27', 125140, 42516, 3759.40], // allowance gone exactly at 125,140
  ['2026/27', 200000, 76203, 5256.60], // 7540 + 34976 + 74860x45%; 2262 + 149730x2%
  ['2026/27', -500, 0, 0],             // a loss: nothing due
  ['2027/28', 30000, 3486, 1045.80],   // future year: frozen thresholds, latest rates
];

test('income tax and NI match HMRC for each tax year', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] });
  const got = await page.evaluate(cases => cases.map(([ty, p]) => ukTax(p, ty)), TAX_CASES);
  TAX_CASES.forEach(([ty, p, tax, ni], i) => {
    near(got[i].tax, tax, `${ty} £${p} income tax`);
    near(got[i].ni, ni, `${ty} £${p} NI`);
  });
  await close();
});

const TAX_YEAR_CASES = [['2026-04-05', '2025/26'], ['2026-04-06', '2026/27'], ['2027-01-01', '2026/27'], ['2024-02-29', '2023/24'], ['2026-12-31', '2026/27'], ['2027-04-05', '2026/27'], ['', '']];
// Weeks run Monday to Sunday. 25 Oct 2026 is the Sunday the clocks go back; 29 Mar 2026 they go forward.
const WEEK_CASES = [['2026-10-18', '2026-10-12'], ['2026-10-19', '2026-10-19'], ['2026-10-25', '2026-10-19'], ['2026-10-26', '2026-10-26'], ['2026-03-29', '2026-03-23'], ['2026-03-30', '2026-03-30'], ['2027-01-01', '2026-12-28'], ['2024-02-29', '2024-02-26']];

for (const tz of ZONES) {
  test(`tax years and weeks are calendar-correct (${tz})`, async () => {
    const { page, close } = await openApp({ income: [], expenses: [] }, { timezoneId: tz });
    const r = await page.evaluate(([ty, wk]) => ({ ty: ty.map(([d]) => tyear(d)), wk: wk.map(([d]) => getWeekKey(d)) }), [TAX_YEAR_CASES, WEEK_CASES]);
    assert.deepEqual(r.ty, TAX_YEAR_CASES.map(c => c[1]));
    assert.deepEqual(r.wk, WEEK_CASES.map(c => c[1]));
    await close();
  });
}

// One week of data around the clocks going back, plus both sides of the 5/6 April tax-year line.
const SEED = {
  income: [
    { id: 'i1', date: '2026-10-18', company: 'BCA', amount: '70' },        // Sunday of the previous week
    { id: 'i2', date: '2026-10-19', company: 'BCA', amount: '100' },       // Monday
    { id: 'i3', date: '2026-10-25', company: 'Engineius', amount: '50' },  // today (Sunday)
    { id: 'i4', date: '2026-09-30', company: 'BCA', amount: '40' },        // September
    { id: 'i5', date: '2026-04-05', company: 'BCA', amount: '1000' },      // last day of 2025/26
    { id: 'i6', date: '2026-04-06', company: 'BCA', amount: '30000' },     // first day of 2026/27
  ],
  expenses: [
    { id: 'e1', date: '2026-10-24', company: 'BCA', category: 'Fuel (Not Reimbursed)', amount: '30' },
    { id: 'e2', date: '2026-10-25', company: 'Engineius', category: 'Tolls (Reimbursed)', amount: '25' }, // paid back: not a cost
    { id: 'e3', date: '2026-10-25', company: 'Engineius', category: 'Parking (Not Reimbursed)', amount: '5' },
    { id: 'e4', date: '2026-10-26', company: 'BCA', category: 'Other', amount: '10' },                    // next week, still October
  ],
};

for (const tz of ZONES) {
  test(`dashboard figures on Sunday 25 Oct 2026 (${tz})`, async () => {
    const { page, errors, close } = await openApp(SEED, { timezoneId: tz, now: '2026-10-25T12:00:00' });
    const r = await page.evaluate(() => {
      showTab(0);
      const chip = l => [...document.querySelectorAll('#pg0 .stat-chip')].find(c => c.querySelector('.stat-chip-label').textContent === l);
      const bars = [...document.querySelectorAll('#pg0 .week-bar-inner')].map(b => b.className.replace('week-bar-inner', '').trim());
      return {
        today: today(), hero: document.querySelector('#pg0 .dash-hero-amount').textContent,
        week: chip('This Week').querySelector('.stat-chip-val').textContent,
        month: chip('This Month').querySelector('.stat-chip-val').textContent,
        pot: chip('Tax Pot').querySelector('.stat-chip-val').textContent, potSub: chip('Tax Pot').querySelector('.stat-chip-sub').textContent,
        deadline: daysToDeadline(), bars,
      };
    });
    assert.equal(r.today, '2026-10-25');
    assert.equal(r.hero, '£45.00');    // 50 - 5 (the reimbursed toll doesn't count)
    assert.equal(r.week, '£115.00');   // Mon 19 - Sun 25: 100 + 50 - 30 - 5
    assert.equal(r.month, '£175.00');  // October: 70 + 100 + 50 - 30 - 5 - 10
    assert.equal(r.potSub, 'est. 2026/27');
    assert.equal(r.pot, '£4587.70');   // 2026/27 profit 30260 - 45 = 30215 -> tax 3529 + Class 4 1058.70; the 5 April £1000 is 2025/26
    assert.equal(r.deadline, 98);      // to 31 Jan 2027
    assert.deepEqual(r.bars, ['past', 'future', 'future', 'future', 'future', 'loss', 'today']); // Sat is a £30 loss
    assert.deepEqual(errors, []);
    await close();
  });
}

test('Insights totals per tax year and for all years', async () => {
  const { page, close } = await openApp(SEED, { now: '2026-10-25T12:00:00' });
  const r = await page.evaluate(() => {
    const pick = t => ({ inc: t.inc, ded: t.deductible, reimb: t.reimb, profit: t.profit, tax: t.tax, ni: t.ni });
    FYR = '2025/26'; const y25 = pick(calcs());
    FYR = '2026/27'; const y26 = pick(calcs());
    FYR = 'All'; const all = pick(calcs());
    FCO = 'Engineius'; const eng = pick(calcs()); FCO = 'All';
    FDFROM = '2026-10-19'; FDTO = '2026-10-25'; const wk = pick(calcs()); FDFROM = ''; FDTO = '';
    return { y25, y26, all, eng, wk };
  });
  assert.deepEqual([r.y25.inc, r.y25.profit, r.y25.tax, r.y25.ni], [1000, 1000, 0, 0]);
  assert.deepEqual([r.y26.inc, r.y26.ded, r.y26.reimb, r.y26.profit], [30260, 45, 25, 30215]);
  near(r.y26.tax, 3529, '2026/27 tax'); near(r.y26.ni, 1058.70, '2026/27 NI');
  assert.equal(r.all.profit, 31215);
  near(r.all.tax, 3529, 'all-years tax is the sum of each year'); // 2025/26's £1000 is under its allowance
  assert.deepEqual([r.eng.inc, r.eng.ded, r.eng.profit], [50, 5, 45]);
  assert.deepEqual([r.wk.inc, r.wk.ded, r.wk.profit], [150, 35, 115]); // same as This Week on the dashboard
  await close();
});

test('Self Assessment countdown around the deadline', async () => {
  for (const [now, days] of [['2027-01-30T09:00:00', 1], ['2027-01-31T23:30:00', 0], ['2027-02-01T00:30:00', 364], ['2026-04-06T08:00:00', 300]]) {
    const { page, close } = await openApp({ income: [], expenses: [] }, { now });
    assert.equal(await page.evaluate(() => daysToDeadline()), days, now);
    await close();
  }
});
