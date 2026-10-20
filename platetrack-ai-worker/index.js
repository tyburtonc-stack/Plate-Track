// PlateTrack AI proxy (Cloudflare Worker).
// The app sends Messages API requests here for receipt/payslip scanning and the AI assistant.
// The Anthropic key never leaves this worker, and only signed-in PlateTrack users from the app's
// own site can use it. The model and output limit are fixed here, not chosen by the caller.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
// Claude Opus 5.5 always thinks before answering and the thinking counts toward max_tokens, so
// the worker sets a generous limit itself (only tokens actually used are billed).
const MAX_TOKENS = 16000;
const EFFORT = 'medium';
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
      const message = await client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: EFFORT },
        // If a safety classifier declines, Anthropic re-runs the request on its recommended model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        ...(typeof body.system === 'string' && body.system ? { system: body.system } : {}),
        messages: body.messages,
      });
      if (message.stop_reason === 'refusal') {
        return fail(422, 'The AI declined to process this request.', origin, env);
      }
      // The app reads content[0].text, so return only the answer text (no thinking/fallback blocks).
      return reply({ ...message, content: message.content.filter(b => b.type === 'text') }, 200, origin, env);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        // Pass Anthropic's own explanation through (e.g. invalid key, low credit balance) so the
        // app can show it; it never contains the key itself.
        const detail = (err.error && err.error.error && err.error.error.message) || err.message || '';
        console.warn('anthropic error', user.id, err.status, detail);
        const message = err.status === 429 ? 'AI is busy, please try again shortly.' : `AI service error (${err.status || 'unknown'}): ${detail}`;
        return fail(err.status || 502, message, origin, env);
      }
      console.error('proxy error', err);
      return fail(502, 'AI request failed.', origin, env);
    }
  },
};
