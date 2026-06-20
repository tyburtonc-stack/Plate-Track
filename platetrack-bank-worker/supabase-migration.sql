-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Creates the tables needed for Plaid bank account integration

-- 1. Bank connections table (stores Plaid access tokens)
CREATE TABLE IF NOT EXISTS bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_name text NOT NULL DEFAULT 'Unknown Bank',
  institution_id text NOT NULL DEFAULT '',
  plaid_access_token text NOT NULL,
  plaid_item_id text NOT NULL DEFAULT '',
  cursor text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Pending transactions table (bank transactions awaiting review)
CREATE TABLE IF NOT EXISTS pending_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_connection_id uuid REFERENCES bank_connections(id) ON DELETE CASCADE,
  plaid_transaction_id text UNIQUE,
  date date NOT NULL,
  amount numeric NOT NULL,
  merchant_name text NOT NULL DEFAULT '',
  category_suggestion text NOT NULL DEFAULT 'Other',
  original_category jsonb DEFAULT '[]',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Row Level Security: users can only access their own data
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_transactions ENABLE ROW LEVEL SECURITY;

-- Bank connections: users can read their own, service role handles writes
CREATE POLICY "Users read own bank connections"
  ON bank_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages bank connections"
  ON bank_connections FOR ALL
  USING (auth.role() = 'service_role');

-- Pending transactions: users can read + update their own
CREATE POLICY "Users read own pending transactions"
  ON pending_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own pending transactions"
  ON pending_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages pending transactions"
  ON pending_transactions FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_connections_user ON bank_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_txn_user_status ON pending_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_txn_plaid_id ON pending_transactions(plaid_transaction_id);
