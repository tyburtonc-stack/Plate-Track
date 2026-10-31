// Testing phase: invite-only sign-up and the tester terms (INVITE_ONLY in index.html, supabase/invites.sql).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const USER = { id: 'u-new', email: 'sam@example.com', user_metadata: {} };

// Supabase stand-in: sign-up refuses emails not on the invite list the way the invites.sql trigger makes it.
function supabase(log, invited) {
  return route => {
    const req = route.request(), url = req.url();
    log.push({ method: req.method(), path: url.replace(/^https:\/\/[^/]+/, ''), body: req.postData() });
    if (url.includes('/auth/v1/signup')) {
      const b = JSON.parse(req.postData());
      if (!invited.includes(b.email)) return json(route, 500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' });
      return json(route, 200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 4102444800, user: Object.assign({}, USER, { email: b.email, user_metadata: b.data || {} }) });
    }
    if (url.includes('/auth/v1/user') && req.method() === 'PUT') return json(route, 200, Object.assign({}, USER, { user_metadata: JSON.parse(req.postData()).data }));
    return json(route, 200, []);
  };
}
const openSignUp = async page => page.evaluate(() => { document.getElementById('onboarding').className = 'onboarding'; showAuthModal(); authSetMode('signup'); });

test('sign-up is invite-only: asks for the tester terms, and explains when an email is not invited', async () => {
  const log = [];
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, { route: supabase(log, ['sam@example.com']) });
  await openSignUp(page);
  assert.match(await page.textContent('#auth-sub'), /invite-only while it's being tested/);
  assert.equal(await page.isVisible('#auth-terms'), true);
  // The terms open from the sign-up box
  await page.click('#auth-terms >> text=tester terms');
  assert.match(await page.textContent('#terms-overlay'), /All rights reserved/);
  await page.click('#terms-close');
  await page.fill('#auth-email', 'stranger@example.com');
  await page.fill('#auth-pw', 'secret123');
  await page.click('#auth-btn');
  assert.match(await page.textContent('#auth-err'), /agree to the tester terms/);
  assert.equal(log.filter(l => l.path.includes('/signup')).length, 0, 'nothing sent without agreeing');
  await page.check('#auth-terms-cb');
  await page.click('#auth-btn');
  await page.waitForFunction(() => document.getElementById('auth-err').textContent.length > 0);
  assert.match(await page.textContent('#auth-err'), /hasn't been invited to test PlateTrack yet/);
  // An invited email signs up, with the terms agreement stored on the account
  await page.fill('#auth-email', 'sam@example.com');
  await page.click('#auth-btn');
  await page.waitForFunction(() => SUPA_USER && SUPA_USER.email === 'sam@example.com');
  const sent = JSON.parse(log.filter(l => l.path.includes('/signup')).pop().body);
  assert.equal(sent.data.tester_terms, '1');
  assert.equal(await page.locator('#terms-overlay').count(), 0, 'no second terms prompt after agreeing at sign-up');
  // Sign-in mode doesn't show the tick box
  await page.evaluate(() => { showAuthModal(); authSetMode('signin'); });
  assert.equal(await page.isVisible('#auth-terms'), false);
  assert.deepEqual(errors, []);
  await close();
});

test('an account made before the terms is asked once; agreeing saves it to the account', async () => {
  const log = [];
  const session = JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 4102444800, user: { id: 'u-old', email: 'dad@example.com', user_metadata: {} } });
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, { route: supabase(log, []), storage: { pt_sess: session }, terms: true });
  await page.waitForSelector('#terms-overlay');
  assert.match(await page.textContent('#terms-overlay'), /PlateTrack tester terms/);
  await page.click('#terms-yes');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pt_sess')).user.user_metadata.tester_terms === '1');
  const put = log.find(l => l.method === 'PUT' && l.path.includes('/auth/v1/user'));
  assert.equal(JSON.parse(put.body).data.tester_terms, '1');
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#terms-overlay').count(), 0, 'not asked again');
  assert.deepEqual(errors, []);
  await close();
});

test('choosing Sign out on the terms signs the account out', async () => {
  const session = JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 4102444800, user: { id: 'u-old', email: 'dad@example.com', user_metadata: {} } });
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, { route: supabase([], []), storage: { pt_sess: session }, terms: true });
  await page.waitForSelector('#terms-overlay');
  await page.click('#terms-out');
  await page.waitForFunction(() => !SUPA_USER);
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_sess')), null);
  assert.deepEqual(errors, []);
  await close();
});
