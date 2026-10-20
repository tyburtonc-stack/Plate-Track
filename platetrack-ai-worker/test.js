// Runs the worker against local stand-ins for Supabase and the Anthropic API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import worker from './index.js';

let server, base, lastAnthropicBody, lastAnthropicHeaders;
before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      if (req.url === '/auth/v1/user') {
        const ok = req.headers.authorization === 'Bearer good-token';
        res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(ok ? { id: 'user-1' } : { msg: 'bad jwt' }));
      }
      if (req.url === '/fail/v1/messages?beta=true') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }));
      }
      if (req.url === '/refuse/v1/messages?beta=true') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
          content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null }, usage: { input_tokens: 1, output_tokens: 0 } }));
      }
      if (req.url === '/v1/messages?beta=true') {
        lastAnthropicBody = JSON.parse(raw);
        lastAnthropicHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Opus 5.5 replies start with a thinking block (empty text under the default display).
        return res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: lastAnthropicBody.model,
          content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const env = () => ({ SUPABASE_URL: base, SUPABASE_ANON_KEY: 'anon', ALLOWED_ORIGINS: 'https://tyburtonc-stack.github.io', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: base });
const call = (opts = {}) => worker.fetch(new Request('https://platetrack-ai.example/', {
  method: opts.method || 'POST',
  headers: { 'Content-Type': 'application/json', Origin: opts.origin ?? 'https://tyburtonc-stack.github.io', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) },
  body: opts.method === 'OPTIONS' ? undefined : JSON.stringify(opts.body ?? { model: 'claude-opus-5-5', max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }] }),
}), env());

test('rejects callers who are not signed in', async () => {
  assert.equal((await call()).status, 401);
  assert.equal((await call({ token: 'forged' })).status, 401);
});

test('rejects requests from other websites', async () => {
  assert.equal((await call({ token: 'good-token', origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ token: 'good-token', origin: '' })).status, 403);
});

test('signed-in request goes through with the model, effort and limits fixed by the server', async () => {
  const res = await call({ token: 'good-token' });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(out.content, [{ type: 'text', text: 'ok' }]); // thinking block stripped, so content[0] is the answer
  assert.equal(lastAnthropicBody.model, 'claude-opus-5-5');
  assert.equal(lastAnthropicBody.max_tokens, 16000);
  assert.deepEqual(lastAnthropicBody.output_config, { effort: 'medium' });
  assert.equal(lastAnthropicBody.fallbacks, 'default');
  assert.match(lastAnthropicHeaders['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(lastAnthropicBody.thinking, undefined);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://tyburtonc-stack.github.io');
});

test('passes the system prompt and images through', async () => {
  const messages = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'text', text: 'read this' }] }];
  await call({ token: 'good-token', body: { max_tokens: 300, system: 'You read receipts.', messages } });
  assert.equal(lastAnthropicBody.system, 'You read receipts.');
  assert.deepEqual(lastAnthropicBody.messages, messages);
});

test('CORS preflight allows the Authorization header', async () => {
  const res = await call({ method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('Anthropic errors are passed through so the app can show them', async () => {
  const env2 = { ...env(), ANTHROPIC_BASE_URL: base + '/fail' };
  const res = await worker.fetch(new Request('https://platetrack-ai.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://tyburtonc-stack.github.io', Authorization: 'Bearer good-token' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  }), env2);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error.message, /credit balance is too low/);
});

test('a refusal comes back as a readable error', async () => {
  const res = await worker.fetch(new Request('https://platetrack-ai.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://tyburtonc-stack.github.io', Authorization: 'Bearer good-token' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  }), { ...env(), ANTHROPIC_BASE_URL: base + '/refuse' });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error.message, /declined/);
});
