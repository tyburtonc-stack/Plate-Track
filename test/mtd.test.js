// Making Tax Digital screen in v2 (v2/mtd.js): eligibility, quarterly figures, deadlines and the CSV.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const inc = (id, date, amount) => ({ id, date, company: 'BCA', incomeType: 'Delivery', amount: String(amount), jobRef: 'J' + id });
const exp = (id, date, category, amount) => ({ id, date, category, amount: String(amount), company: 'BCA', jobRef: '', receiptImage: '' });
const openV2 = (seed, opts) => openApp(seed, Object.assign({ hash: 'v2/', now: '2026-10-25T12:00:00' }, opts));

test('MTD: works out when it starts from each year\'s income', async () => {
  // £35,000 in 2025/26 is over £30,000: MTD from 6 April 2027
  let app = await openV2({ income: [inc(1, '2025-06-01', 20000), inc(2, '2026-02-01', 15000)], expenses: [] });
  await app.page.evaluate(() => showTab(3));
  assert.match(await app.page.textContent('#pg3 .mtd-entry'), /MTD starts for you on 6 April 2027/);
  assert.match(await app.page.textContent('#pg0'), /Making Tax Digital/, 'Overview shows it within a year of starting');
  await app.page.click('#pg3 .mtd-entry');
  const txt = await app.page.textContent('#mtdPage');
  assert.match(txt, /MTD starts for you on 6 April 2027/);
  assert.match(txt, /2025\/26£35000\.00 of £30,000/);
  assert.deepEqual(app.errors, []);
  await app.close();

  // Under every threshold: not yet, and nothing on Overview
  app = await openV2({ income: [inc(1, '2025-06-01', 9000)], expenses: [] });
  assert.doesNotMatch(await app.page.textContent('#pg0'), /Making Tax Digital/);
  await app.page.evaluate(() => showTab(3));
  assert.match(await app.page.textContent('#pg3 .mtd-entry'), /Not required yet/);
  await app.close();
});

test('MTD: quarterly and year-to-date figures, HMRC categories, deadlines and sent ticks', async () => {
  const { page, errors, close } = await openV2({
    // £60,000 in 2024/25: MTD applies from 6 April 2026
    income: [inc(1, '2024-09-01', 60000), inc(2, '2026-04-10', 1000), inc(3, '2026-07-05', 500), inc(4, '2026-08-01', 2000)],
    expenses: [
      exp('f', '2026-04-12', 'Fuel (Not Reimbursed)', 100),
      exp('h', '2026-08-02', 'Hotel (Not Reimbursed)', 80),
      exp('c', '2026-08-03', 'Cleaning (Not Reimbursed)', 20),
      exp('r', '2026-08-04', 'Travel (Reimbursed)', 50),
    ],
  });
  // Q1 (to 5 Jul, due 7 Aug) is overdue; Overview says so
  assert.match(await page.textContent('#pg0 .mtd-entry'), /Q1 update \(to 5 Jul\) overdue since 7 Aug/);
  await page.evaluate(() => openMTD());
  const q = await page.locator('#mtdPage .mtd-q').allTextContents();
  assert.match(q[0], /Income£1500\.00Expenses£100\.00Profit£1400\.00/);
  assert.match(q[0], /Overdue/);
  assert.match(q[1], /Income£2000\.00Expenses£100\.00Profit£1900\.00/);
  assert.match(q[1], /Year to date \(what the update sends\): income £3500\.00 · expenses £200\.00 · profit £3300\.00/);
  assert.match(q[1], /Due in 13 days/);
  assert.match(q[2], /In progress/);
  const cats = await page.locator('#mtdPage .mtd-card').nth(2).textContent();
  assert.match(cats, /Car, van and travel expenses.*£180\.00/);
  assert.match(cats, /Other business expenses.*£20\.00/);
  assert.match(cats, /£50\.00 of reimbursed expenses are left out/);
  assert.match(cats, /under £90,000/);
  // Tick Q1 as sent: the next deadline becomes Q2
  await page.check('#mtdPage [data-sent="2026/27-1"]');
  assert.match(await page.textContent('#mtdPage .mtd-q >> nth=0'), /✓ Sent/);
  await page.click('#mtdPage .mtd-back');
  assert.match(await page.textContent('#pg0 .mtd-entry'), /Q2 update \(to 5 Oct\) due 7 Nov · 13 days/);
  assert.deepEqual(errors, []);
  await close();
});

test('MTD: calendar quarters move the boundaries; the CSV has quarterly and year-to-date columns', async () => {
  const { page, errors, close } = await openV2({
    income: [inc(1, '2026-04-03', 300), inc(2, '2026-07-02', 700)],
    expenses: [exp('f', '2026-07-03', 'Fuel (Not Reimbursed)', 40), exp('o', '2026-04-20', 'Other', 10)],
  });
  await page.evaluate(() => openMTD('2026/27'));
  assert.match(await page.textContent('#mtdPage .mtd-q >> nth=0'), /6 Apr – 5 Jul.*Income£700\.00/);
  await page.click('#mtdPage [data-cal="1"]');
  assert.match(await page.textContent('#mtdPage .mtd-q >> nth=0'), /1 Apr – 30 Jun.*Income£300\.00/);
  const csv = await page.evaluate(() => mtdCSV('2026/27'));
  const rows = csv.trim().split('\n');
  assert.ok(rows.includes('Update periods,Calendar quarters (1 April)'));
  assert.ok(rows.includes('Q1,2026-04-01,2026-06-30,2026-08-07,300.00,0.00,10.00,10.00,290.00,300.00,0.00,10.00,10.00,290.00'), rows.join('\n'));
  assert.ok(rows.includes('Q2,2026-07-01,2026-09-30,2026-11-07,700.00,40.00,0.00,40.00,660.00,1000.00,40.00,10.00,50.00,950.00'));
  assert.ok(rows.includes('Fuel (Not Reimbursed),"Car, van and travel expenses",40.00'));
  assert.deepEqual(errors, []);
  await close();
});
