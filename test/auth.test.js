// Sign-in errors and the forgot-password flow, against a stand-in for Supabase Auth.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./helpers');

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const USER = { id: 'u-dad', email: 'dad@example.com' };

// Supabase stand-in: one good password, a reset endpoint, and the user endpoint for new passwords.
function supabase(log) {
  return route => {
    const req = route.request(), url = req.url();
    log.push(req.method() + ' ' + url.replace(/^https:\/\/[^/]+/, ''));
    if (url.includes('/auth/v1/token?grant_type=password')) {
      const b = JSON.parse(req.postData());
      if (b.password === 'right-pass') return json(route, 200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER });
      return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.includes('/auth/v1/recover')) return json(route, 200, {});
    if (url.includes('/auth/v1/user') && req.method() === 'PUT') {
      if (req.headers().authorization === 'Bearer reset-token') return json(route, 200, USER);
      return json(route, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT: token is expired' });
    }
    return json(route, 200, []); // data/profile calls after sign-in
  };
}

const openSignIn = async page => page.evaluate(() => { document.getElementById('onboarding').className = 'onboarding'; showAuthModal(); authSetMode('signin'); });
const errText = page => page.textContent('#auth-err');

test('a wrong password says so and keeps the sign-in box open', async () => {
  const log = [];
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, { route: supabase(log) });
  await openSignIn(page);
  await page.fill('#auth-email', 'dad@example.com');
  await page.fill('#auth-pw', 'wrong-pass');
  await page.evaluate(() => authSubmit());
  await page.waitForFunction(() => document.getElementById('auth-err').textContent.length > 0);
  assert.equal(await errText(page), 'Wrong email or password. Please try again.');
  assert.equal(await page.evaluate(() => document.getElementById('auth-modal').style.display), 'flex');
  assert.equal(await page.evaluate(() => SUPA_USER), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_sess')), null);
  assert.equal(await page.inputValue('#auth-pw'), ''); // cleared for another try

  await page.fill('#auth-pw', 'right-pass');
  await page.evaluate(() => authSubmit());
  await page.waitForFunction(() => document.getElementById('auth-modal').style.display === 'none');
  assert.equal(await page.evaluate(() => SUPA_USER.email), 'dad@example.com');
  assert.deepEqual(errors, []);
  await close();
});

test('forgot password sends a reset link to the app', async () => {
  const log = [];
  const { page, close } = await openApp({ income: [], expenses: [] }, { route: supabase(log) });
  await openSignIn(page);
  await page.evaluate(() => document.querySelector('#auth-forgot span').click());
  assert.equal(await page.evaluate(() => document.getElementById('auth-pw-wrap').style.display), 'none');
  assert.equal(await page.textContent('#auth-btn'), 'Send Reset Link');
  await page.fill('#auth-email', 'dad@example.com');
  await page.evaluate(() => authSubmit());
  await page.waitForFunction(() => /reset link is on its way/.test(document.getElementById('auth-err').textContent));
  const recover = log.find(l => l.includes('/auth/v1/recover'));
  assert.ok(recover.includes('redirect_to=' + encodeURIComponent('https://tyburtonc-stack.github.io/Plate-Track/')), recover);
  await close();
});

test('opening the reset link sets a new password and signs in', async () => {
  const log = [];
  const hash = '#access_token=reset-token&expires_in=3600&refresh_token=rt2&token_type=bearer&type=recovery';
  const { page, errors, close } = await openApp({ income: [], expenses: [] }, { route: supabase(log), hash });
  await page.waitForSelector('#newpw-overlay');
  assert.equal(await page.evaluate(() => location.hash), ''); // token removed from the address bar
  await page.fill('#newpw-1', 'abc');
  await page.evaluate(() => document.getElementById('newpw-btn').click());
  assert.equal(await page.textContent('#newpw-err'), 'Use at least 6 characters.');
  await page.fill('#newpw-1', 'new-pass-1'); await page.fill('#newpw-2', 'new-pass-2');
  await page.evaluate(() => document.getElementById('newpw-btn').click());
  assert.equal(await page.textContent('#newpw-err'), "The two passwords don't match.");
  await page.fill('#newpw-2', 'new-pass-1');
  await page.evaluate(() => document.getElementById('newpw-btn').click());
  await page.waitForFunction(() => !document.getElementById('newpw-overlay'));
  assert.equal(await page.evaluate(() => SUPA_USER.email), 'dad@example.com');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pt_sess')).access_token), 'reset-token');
  assert.ok(log.some(l => l.startsWith('PUT') && l.includes('/auth/v1/user')));
  assert.deepEqual(errors, []);
  await close();
});

test('an expired reset link explains what to do', async () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  const { page, close } = await openApp({ income: [], expenses: [] }, { route: supabase([]), hash });
  await page.waitForFunction(() => document.getElementById('auth-modal').style.display === 'flex');
  assert.match(await errText(page), /expired or was already used/);
  assert.equal(await page.textContent('#auth-btn'), 'Send Reset Link');
  await close();
});
