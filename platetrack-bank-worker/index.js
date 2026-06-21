const PLAID_URLS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

function plaidUrl(env) {
  return PLAID_URLS[env] || PLAID_URLS.sandbox;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

async function plaidPost(env, path, body) {
  const base = plaidUrl(env.PLAID_ENV);
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  return res.json();
}

async function supabaseQuery(env, method, path, body, token) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : '',
  };
  if (token) headers['Authorization'] = 'Bearer ' + env.SUPABASE_SERVICE_KEY;
  const res = await fetch(env.SUPABASE_URL + '/rest/v1' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + t);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function verifyUser(env, authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const res = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + token },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

function mapPlaidCategory(categories, merchantName) {
  const cats = (categories || []).map(function (c) { return c.toLowerCase(); });
  const merchant = (merchantName || '').toLowerCase();

  if (cats.includes('gas stations') || cats.includes('fuel') || merchant.includes('petrol') || merchant.includes('fuel') || merchant.includes('shell') || merchant.includes('bp ') || merchant.includes('esso') || merchant.includes('texaco'))
    return 'Fuel (Not Reimbursed)';
  if (cats.includes('electric vehicle charging') || merchant.includes('ev charg') || merchant.includes('tesla') || merchant.includes('gridserve') || merchant.includes('pod point') || merchant.includes('ionity'))
    return 'EV Charging (Not Reimbursed)';
  if (cats.includes('parking') || merchant.includes('parking') || merchant.includes('ncp') || merchant.includes('parkopedia'))
    return 'Parking (Not Reimbursed)';
  if (cats.includes('tolls') || merchant.includes('toll') || merchant.includes('dart charge') || merchant.includes('congestion'))
    return 'Tolls (Not Reimbursed)';
  if (cats.includes('hotels') || cats.includes('lodging') || merchant.includes('hotel') || merchant.includes('premier inn') || merchant.includes('travelodge'))
    return 'Hotel (Not Reimbursed)';
  if (cats.includes('car wash') || merchant.includes('car wash') || merchant.includes('wash'))
    return 'Cleaning (Not Reimbursed)';
  if (cats.includes('taxi') || cats.includes('ride share') || cats.includes('travel') || cats.includes('airlines') || cats.includes('railways') || merchant.includes('uber') || merchant.includes('trainline') || merchant.includes('national rail') || merchant.includes('tfl'))
    return 'Travel (Not Reimbursed)';

  return 'Other';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    const user = await verifyUser(env, request.headers.get('Authorization'));
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);

    try {
      if (path === '/create-link-token') {
        return await handleCreateLinkToken(env, user, origin);
      }
      if (path === '/exchange-token') {
        const body = await request.json();
        return await handleExchangeToken(env, user, body, origin);
      }
      if (path === '/sync-transactions') {
        const body = await request.json();
        return await handleSyncTransactions(env, user, body, origin);
      }
      if (path === '/disconnect') {
        const body = await request.json();
        return await handleDisconnect(env, user, body, origin);
      }
      if (path === '/connections') {
        return await handleGetConnections(env, user, origin);
      }
      if (path === '/pending') {
        return await handleGetPending(env, user, origin);
      }
      if (path === '/dismiss') {
        const body = await request.json();
        return await handleDismiss(env, user, body, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      console.error(e);
      return json({ error: e.message || 'Internal error' }, 500, origin);
    }
  },
};

async function handleCreateLinkToken(env, user, origin) {
  const data = await plaidPost(env, '/link/token/create', {
    user: { client_user_id: user.id },
    client_name: 'PlateTrack',
    products: ['transactions'],
    country_codes: ['GB'],
    language: 'en',
  });
  if (data.error_code) return json({ error: data.error_message }, 400, origin);
  return json({ link_token: data.link_token }, 200, origin);
}

async function handleExchangeToken(env, user, body, origin) {
  if (!body.public_token) return json({ error: 'Missing public_token' }, 400, origin);

  const exchange = await plaidPost(env, '/item/public_token/exchange', {
    public_token: body.public_token,
  });
  if (exchange.error_code) return json({ error: exchange.error_message }, 400, origin);

  let institutionName = 'Unknown Bank';
  if (body.institution_id) {
    const inst = await plaidPost(env, '/institutions/get_by_id', {
      institution_id: body.institution_id,
      country_codes: ['GB'],
    });
    if (inst.institution) institutionName = inst.institution.name;
  }

  await supabaseQuery(env, 'POST', '/bank_connections', {
    user_id: user.id,
    institution_name: institutionName,
    institution_id: body.institution_id || '',
    plaid_access_token: exchange.access_token,
    plaid_item_id: exchange.item_id,
    cursor: '',
    status: 'active',
  });

  return json({ success: true, institution_name: institutionName }, 200, origin);
}

async function handleSyncTransactions(env, user, body, origin) {
  if (!body.connection_id) return json({ error: 'Missing connection_id' }, 400, origin);

  const uid = encodeURIComponent(user.id);
  const cid = encodeURIComponent(body.connection_id);
  const conns = await supabaseQuery(env, 'GET',
    '/bank_connections?id=eq.' + cid + '&user_id=eq.' + uid + '&select=*');
  if (!conns || conns.length === 0) return json({ error: 'Connection not found' }, 404, origin);
  const conn = conns[0];

  let cursor = conn.cursor || '';
  let added = 0, modified = 0, hasMore = true;

  while (hasMore) {
    const syncBody = { access_token: conn.plaid_access_token };
    if (cursor) syncBody.cursor = cursor;
    const data = await plaidPost(env, '/transactions/sync', syncBody);
    if (data.error_code) return json({ error: data.error_message }, 400, origin);

    const newTxns = (data.added || []).concat(data.modified || []);
    for (const txn of newTxns) {
      if (txn.amount <= 0) continue;

      const row = {
        user_id: user.id,
        bank_connection_id: conn.id,
        plaid_transaction_id: txn.transaction_id,
        date: txn.date,
        amount: Math.abs(txn.amount),
        merchant_name: txn.merchant_name || txn.name || '',
        category_suggestion: mapPlaidCategory(
          txn.personal_finance_category ? [txn.personal_finance_category.primary] : (txn.category || []),
          txn.merchant_name || txn.name || ''
        ),
        original_category: txn.category || [],
        description: txn.name || '',
        status: 'pending',
      };

      await supabaseQuery(env, 'POST', '/pending_transactions', row);
      added++;
    }
    modified += (data.modified || []).length;
    cursor = data.next_cursor || '';
    hasMore = data.has_more || false;
  }

  await supabaseQuery(env, 'PATCH',
    '/bank_connections?id=eq.' + cid, { cursor, updated_at: new Date().toISOString() });

  return json({ added, modified }, 200, origin);
}

async function handleDisconnect(env, user, body, origin) {
  if (!body.connection_id) return json({ error: 'Missing connection_id' }, 400, origin);

  const uid = encodeURIComponent(user.id);
  const cid = encodeURIComponent(body.connection_id);
  const conns = await supabaseQuery(env, 'GET',
    '/bank_connections?id=eq.' + cid + '&user_id=eq.' + uid + '&select=*');
  if (!conns || conns.length === 0) return json({ error: 'Connection not found' }, 404, origin);

  try {
    await plaidPost(env, '/item/remove', { access_token: conns[0].plaid_access_token });
  } catch (_) {}

  await supabaseQuery(env, 'PATCH',
    '/bank_connections?id=eq.' + cid, { status: 'disconnected', plaid_access_token: '' });

  await supabaseQuery(env, 'DELETE',
    '/pending_transactions?bank_connection_id=eq.' + cid + '&status=eq.pending');

  return json({ success: true }, 200, origin);
}

async function handleGetConnections(env, user, origin) {
  const uid = encodeURIComponent(user.id);
  const rows = await supabaseQuery(env, 'GET',
    '/bank_connections?user_id=eq.' + uid + '&status=eq.active&select=id,institution_name,updated_at');
  return json({ connections: rows || [] }, 200, origin);
}

async function handleGetPending(env, user, origin) {
  const uid = encodeURIComponent(user.id);
  const rows = await supabaseQuery(env, 'GET',
    '/pending_transactions?user_id=eq.' + uid + '&status=eq.pending&select=*&order=date.desc&limit=100');
  return json({ transactions: rows || [] }, 200, origin);
}

async function handleDismiss(env, user, body, origin) {
  if (!body.transaction_id) return json({ error: 'Missing transaction_id' }, 400, origin);
  const uid = encodeURIComponent(user.id);
  const tid = encodeURIComponent(body.transaction_id);
  await supabaseQuery(env, 'PATCH',
    '/pending_transactions?id=eq.' + tid + '&user_id=eq.' + uid, { status: 'dismissed' });
  return json({ success: true }, 200, origin);
}
