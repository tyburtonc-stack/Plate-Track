// Import from Excel, CSV, pasted cells and notes. Run with `npm test` (builds first).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { openApp } = require('./helpers');

const FIX = path.join(__dirname, 'fixtures');
const NOW = { now: '2026-10-23T12:00:00' };

async function startImport(page) {
  await page.evaluate(() => openImport());
}
async function paste(page, text, button = 'Read pasted text') {
  await startImport(page);
  await page.fill('#imp-text', text);
  await page.click(`#imp-body button:has-text("${button}")`);
}
const items = page => page.evaluate(() => IMP.items.map(it => ({ kind: it.kind, sel: it.sel, dup: it.dup, errs: it.errs, rec: it.rec })));

test('dates, amounts, times and expense categories are read the UK way', async () => {
  const { page, close } = await openApp(null, NOW);
  const r = await page.evaluate(() => ({
    dates: ['03/10/2026', '3-10-26', '2026-10-03', '2026-10-03T00:00:00', '3rd Oct 2026', 'Fri 3 October', 'October 3, 2026', '3/10', '10/13/2026', '46298', '31/02/2026', 'soon'].map(impDate),
    yearless: impDate('20/12'),
    amounts: ['£1,234.50', '85', '(12.00)', '-7.5', 'GBP 3.10', 'abc', ''].map(impAmount),
    times: ['9:30', '09:30:00', '3.45pm', '12am', '0930', '0.395833333', '2026-10-03 17:05', 'x'].map(impTime),
    cats: ['Shell diesel', 'Train back', 'Travelodge', 'BP Pulse charge', 'Dartford crossing', 'NCP car park', 'Lunch', 'Fuel (Not Reimbursed)', 'taxi - not reimbursed'].map(t => impCategory(t, '', '')),
    reimbCol: [impCategory('Fuel', 'No', 'BCA'), impCategory('Parking', 'Yes', '')],
  }));
  assert.deepEqual(r.dates, ['2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-03', '2026-10-13', '2026-10-03', '', '']);
  assert.equal(r.yearless, '2025-12-20'); // no year and it would be in the future: last year
  assert.deepEqual(r.amounts.slice(0, 5), [1234.5, 85, 12, 7.5, 3.1]);
  assert.ok(Number.isNaN(r.amounts[5]) && Number.isNaN(r.amounts[6]));
  assert.deepEqual(r.times, ['09:30', '09:30', '15:45', '00:00', '09:30', '09:30', '17:05', '']);
  assert.deepEqual(r.cats, ['Fuel (Reimbursed)', 'Travel (Reimbursed)', 'Hotel (Reimbursed)', 'EV Charging (Reimbursed)', 'Tolls (Reimbursed)', 'Parking (Reimbursed)', 'Other', 'Fuel (Not Reimbursed)', 'Travel (Not Reimbursed)']);
  assert.deepEqual(r.reimbCol, ['Fuel (Not Reimbursed)', 'Parking (Reimbursed)']);
  await close();
});

for (const file of ['import-sample.xlsx', 'import-sample-office.xlsx']) {
  test(`Excel file ${file}: finds the headings under a title, maps columns and imports income and expenses`, async () => {
    const { page, errors, close } = await openApp({ income: [], expenses: [] }, NOW);
    await startImport(page);
    await page.setInputFiles('#impdatafile', path.join(FIX, file));
    await page.waitForFunction(() => IMP && IMP.step === 'review');
    const setup = await page.evaluate(() => ({ kind: IMP.kind, sheets: IMP.sheets.map(s => s.name), headers: IMP.headers, map: IMP.map }));
    assert.equal(setup.kind, 'income');
    assert.deepEqual(setup.sheets, ['Jobs', 'Expenses']); // the empty sheet is left out
    assert.deepEqual(setup.headers, ['Date', 'Client', 'Job No', 'Reg', 'Pay (£)', 'Start', 'Finish', 'Notes']);
    assert.deepEqual(setup.map, ['date', 'company', 'jobRef', 'registration', 'amount', 'startTime', 'endTime', 'description']);
    const inc = await items(page);
    assert.equal(inc.length, 3);
    assert.deepEqual(inc[0].rec, { date: '2026-10-03', amount: '85.50', company: 'BCA', jobRef: 'J-1234-AB56', description: 'Leeds to Manchester', incomeType: 'Delivery', startTime: '09:30', endTime: '15:45', miles: '', registration: 'AB12 CDE', startPostcode: '', endPostcode: '', receiptImage: '' });
    assert.equal(inc[2].rec.amount, '1234.56');
    assert.match(await page.textContent('#imp-body'), /Also add new companies: Movex/);
    assert.equal(await page.textContent('#imp-foot button'), 'Import 3 entries');
    await page.click('#imp-foot button');
    let db = await page.evaluate(() => ({ income: DB.income, cos: coNames(), open: document.getElementById('impModal').className }));
    assert.equal(db.income.length, 3);
    assert.equal(new Set(db.income.map(x => String(x.id))).size, 3);
    assert.ok(db.cos.includes('Movex'));
    assert.equal(db.open, 'imp-overlay');

    await startImport(page);
    await page.setInputFiles('#impdatafile', path.join(FIX, file));
    await page.waitForFunction(() => IMP && IMP.step === 'review');
    assert.equal(await page.evaluate(() => IMP.items.filter(it => it.dup).length), 3); // already imported
    await page.selectOption('#imp-body select', '1');
    assert.equal(await page.evaluate(() => IMP.kind), 'expense');
    const exp = await items(page);
    assert.deepEqual(exp.map(x => [x.rec.date, x.rec.amount, x.rec.category, x.rec.description]), [
      ['2026-10-03', '22.40', 'Travel (Reimbursed)', 'Train back to Leeds'],
      ['2026-10-04', '45.00', 'Fuel (Not Reimbursed)', 'Shell diesel'],
      ['2026-10-04', '6.99', 'Other', 'Lunch'],
    ]);
    await page.click('#imp-foot button');
    db = await page.evaluate(() => DB);
    assert.equal(db.income.length, 3);
    assert.equal(db.expenses.length, 3);
    assert.deepEqual(errors, []);
    await close();
  });
}

test("PlateTrack's own CSV export imports back the same, and a second import is all duplicates", async () => {
  const seed = {
    income: [{ id: 1, date: '2026-10-01', company: 'BCA', incomeType: 'Waiting Time', amount: '40', jobRef: '123', startTime: '08:00', endTime: '09:00', miles: '12', registration: 'AB12CDE', startPostcode: 'LS1 1AA', endPostcode: 'M1 1AA', description: 'Waited, "long" one' }],
    expenses: [{ id: 2, date: '2026-10-02', category: 'Parking (Not Reimbursed)', amount: '3.5', company: 'BCA', jobRef: '123', receipt: 'R9', description: 'NCP, Leeds', receiptImage: '' }],
  };
  const { page, errors, close } = await openApp(seed, NOW);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => generateCSV())]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  await page.evaluate(() => { DB.income = []; DB.expenses = []; saveDB(); });
  await startImport(page);
  await page.setInputFiles('#impdatafile', { name: 'platetrack.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForFunction(() => IMP && IMP.step === 'review');
  await page.click('#imp-foot button');
  const db = await page.evaluate(() => DB);
  const strip = x => { const { id, ...rest } = x; return rest; };
  assert.deepEqual(strip(db.income[0]), { ...strip(seed.income[0]), amount: '40.00', receiptImage: '' });
  assert.deepEqual(strip(db.expenses[0]), { ...strip(seed.expenses[0]), amount: '3.50' });

  await startImport(page);
  await page.setInputFiles('#impdatafile', { name: 'platetrack.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForFunction(() => IMP && IMP.step === 'review');
  assert.deepEqual((await items(page)).map(x => [x.dup, x.sel]), [[true, false], [true, false]]);
  assert.equal(await page.textContent('#imp-foot button'), 'Nothing selected');
  assert.deepEqual(errors, []);
  await close();
});

test('cells pasted from Excel (tab-separated, no headings) are read by what is in them', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] }, NOW);
  await paste(page, '03/10/2026\tBCA\t£85.00\tLeeds to York\n04/10/2026\tEngineius\t£120.50\tYork to Hull\n');
  const r = await page.evaluate(() => ({ map: IMP.map, kind: IMP.kind }));
  assert.equal(r.kind, 'income');
  assert.deepEqual(r.map, ['date', 'company', 'amount', 'description']);
  assert.deepEqual((await items(page)).map(x => [x.rec.date, x.rec.company, x.rec.amount, x.rec.description]), [
    ['2026-10-03', 'BCA', '85.00', 'Leeds to York'],
    ['2026-10-04', 'Engineius', '120.50', 'York to Hull'],
  ]);
  // Changing a column's match moves it off any other column using that field.
  await page.evaluate(() => impSetMap(3, 'company'));
  assert.deepEqual(await page.evaluate(() => IMP.map), ['date', '', 'amount', 'company']);
  await close();
});

test('notes are read line by line, with dates carried down and several amounts split', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] }, NOW);
  await paste(page, 'Mon 6th Oct\nBCA Leeds to Manchester £85, train back £22.40\n\n7/10 Engineius J-851B-8E65 AB12CDE £120\nremember to call mum\nparking 4.50');
  const r = await items(page);
  assert.deepEqual(r.map(x => [x.kind, x.rec.date, x.rec.amount, x.rec.company, x.rec.category || x.rec.incomeType, x.rec.description]), [
    ['income', '2026-10-06', '85.00', 'BCA', 'Delivery', 'BCA Leeds to Manchester'],
    ['expense', '2026-10-06', '22.40', '', 'Travel (Reimbursed)', 'train back'],
    ['income', '2026-10-07', '120.00', 'Engineius', 'Delivery', 'Engineius J-851B-8E65 AB12CDE'],
    ['expense', '2026-10-07', '4.50', '', 'Parking (Reimbursed)', 'parking'],
  ]);
  assert.equal(r[2].rec.jobRef, 'J-851B-8E65');
  assert.equal(r[2].rec.registration, 'AB12CDE');
  assert.match(await page.textContent('#imp-body'), /Sort out with AI/);
  await close();
});

test('a row with no date can be given one before importing', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] }, NOW);
  await paste(page, 'Date,Amount,Company\n,50,BCA\n05/10/2026,60,BCA');
  let r = await items(page);
  assert.deepEqual(r.map(x => [x.sel, x.errs]), [[false, ['No date']], [true, []]]);
  await page.fill('#imp-body input[type=date]', '2026-10-04');
  r = await items(page);
  assert.deepEqual(r.map(x => [x.sel, x.rec.date]), [[true, '2026-10-04'], [true, '2026-10-05']]);
  await page.click('#imp-foot button');
  assert.equal(await page.evaluate(() => DB.income.length), 2);
  await close();
});

test('Sort out with AI sends the notes to the AI worker and shows its rows for review', async () => {
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, NOW);
  await page.evaluate(() => {
    SUPA_USER = { id: 'u1' }; SUPA_SESSION = { access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 };
    window.__sent = [];
    window.fetch = async (url, opts) => {
      if (String(url).startsWith(AI_PROXY_URL)) {
        window.__sent.push(JSON.parse(opts.body));
        const rows = [
          { kind: 'income', date: '2026-10-06', amount: 85, company: 'BCA', incomeType: null, category: null, reimbursed: null, description: 'Leeds to Manchester' },
          { kind: 'expense', date: '2026-10-06', amount: 22.4, company: null, category: 'Travel', reimbursed: false, description: 'Train back' },
        ];
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ rows }) }] }));
      }
      return new Response('[]');
    };
  });
  await paste(page, 'monday did the leeds-manc bca run, 85 quid. train home 22.40 (bca dont pay that)', 'Sort out with AI');
  await page.waitForFunction(() => IMP && IMP.step === 'review');
  const sent = await page.evaluate(() => window.__sent);
  assert.equal(sent.length, 1);
  assert.match(sent[0].messages[0].content, /bca dont pay that/);
  assert.match(sent[0].messages[0].content, /Today is 2026-10-23/);
  const r = await items(page);
  assert.deepEqual(r.map(x => [x.kind, x.rec.amount, x.rec.company, x.rec.category || x.rec.incomeType]), [
    ['income', '85.00', 'BCA', 'Delivery'],
    ['expense', '22.40', '', 'Travel (Not Reimbursed)'],
  ]);
  assert.match(await page.textContent('#imp-body'), /Sorted by AI/);
  await page.click('#imp-foot button');
  assert.deepEqual(await page.evaluate(() => [DB.income.length, DB.expenses.length]), [1, 1]);
  assert.deepEqual(errors, []);
  await close();
});

test('signed out, Sort out with AI asks the user to sign in', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] }, NOW);
  await paste(page, 'some notes £5', 'Sort out with AI');
  assert.equal(await page.evaluate(() => IMP.step), 'start');
  assert.match(await page.textContent('#toast'), /sign in/i);
  await close();
});

test('an import can be removed later, taking only the entries it added, on the device and in the cloud', async () => {
  const mine = { id: 99, date: '2026-10-01', company: 'BCA', incomeType: 'Delivery', amount: '50', jobRef: '', description: 'typed in by hand' };
  const { page, errors, close } = await openApp({ income: [mine], expenses: [] }, NOW);
  await paste(page, 'Date,Amount,Company,Notes\n03/10/2026,85,BCA,first\n04/10/2026,90,BCA,second\n05/10/2026,95,BCA,third');
  await page.click('#imp-foot button');
  let st = await page.evaluate(() => ({ n: DB.income.length, imports: DB.imports, meta: JSON.parse(jobMetaJSON()) }));
  assert.equal(st.n, 4);
  assert.equal(st.imports.length, 1);
  assert.equal(st.imports[0].label, 'Pasted text');
  assert.equal(st.imports[0].income.length, 3);
  assert.deepEqual(st.meta.imports, st.imports); // syncs between devices with the job notes

  // The user deletes one imported entry by hand; the import now has 2 left.
  await page.evaluate(() => { DB.income = DB.income.filter(x => x.description !== 'third'); saveDB(); });
  await page.evaluate(() => {
    SUPA_USER = { id: 'u1' }; SUPA_SESSION = { access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 };
    window.__calls = [];
    window.fetch = async (url, opts) => { window.__calls.push({ url: String(url), method: (opts && opts.method) || 'GET' }); return new Response('[]'); };
  });
  await startImport(page);
  assert.match(await page.textContent('#imp-body'), /Recent imports[\s\S]*Pasted text[\s\S]*2 entries/);
  await page.click('#imp-body .imp-rm');
  await page.click('#sc-yes');
  st = await page.evaluate(() => ({ income: DB.income.map(x => x.description), imports: DB.imports, saved: JSON.parse(localStorage.getItem('pt9')).income.length, calls: window.__calls }));
  assert.deepEqual(st.income, ['typed in by hand']);
  assert.deepEqual(st.imports, []);
  assert.equal(st.saved, 1);
  const del = st.calls.filter(c => c.method === 'DELETE');
  assert.equal(del.length, 1);
  assert.match(del[0].url, /\/rest\/v1\/income\?id=in\.\(\d+,\d+\)$/);
  assert.doesNotMatch(await page.textContent('#imp-body'), /Recent imports/);
  assert.deepEqual(errors, []);
  await close();
});

test('users who never import keep the same synced job notes as before', async () => {
  const { page, close } = await openApp({ income: [], expenses: [] }, NOW);
  assert.deepEqual(JSON.parse(await page.evaluate(() => jobMetaJSON())), { jobs: {}, notes: [] });
  await close();
});
