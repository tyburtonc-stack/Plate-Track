// PlateTrack AI proxy (Cloudflare Worker).
// The app sends Messages API requests here for receipt/payslip scanning and the AI assistant.
// The Anthropic key never leaves this worker, and only signed-in PlateTrack users from the app's
// own site can use it. The model and output limit are fixed here, not chosen by the caller.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS_CAP = 3000;
const MAX_BODY_BYTES = 8 * 1024 * 1024; // a few compressed receipt photos at most

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
  });
}

// Same error shape as the Messages API, which the app already reads (d.error.message).
const fail = (status, message, origin, env) => reply({ type: 'error', error: { type: 'proxy_error', message } }, status, origin, env);

// Ask Supabase whether the bearer token belongs to a signed-in user.
async function signedInUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    if (request.method !== 'POST') return fail(405, 'Method not allowed', origin, env);
    if (!allowed.includes(origin)) return fail(403, 'Requests must come from the PlateTrack app.', origin, env);

    const size = Number(request.headers.get('Content-Length') || 0);
    if (size > MAX_BODY_BYTES) return fail(413, 'Request too large.', origin, env);

    const user = await signedInUser(request, env);
    if (!user) return fail(401, 'Please sign in to use AI features.', origin, env);

    let body;
    try { body = await request.json(); } catch { return fail(400, 'Invalid JSON.', origin, env); }
    if (!Array.isArray(body.messages) || body.messages.length === 0) return fail(400, 'messages is required.', origin, env);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: Math.min(Math.max(1, Number(body.max_tokens) || 1000), MAX_TOKENS_CAP),
        ...(typeof body.system === 'string' && body.system ? { system: body.system } : {}),
        messages: body.messages,
      });
      return reply(message, 200, origin, env);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.warn('anthropic error', user.id, err.status, err.message);
        return fail(err.status || 502, err.status === 429 ? 'AI is busy, please try again shortly.' : 'AI request failed.', origin, env);
      }
      console.error('proxy error', err);
      return fail(502, 'AI request failed.', origin, env);
    }
  },
};
