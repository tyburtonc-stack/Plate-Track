-- Row Level Security for PlateTrack.
-- Run once in Supabase (Dashboard → SQL Editor → New query → paste → Run). Safe to run again.
--
-- The app talks to Supabase with the public "anon" key, which is in the page source. Without
-- these rules anyone holding that key could read or change every user's income, expenses and
-- receipts. With them, a signed-in user can only see and change their own rows and files.

-- ── Tables ────────────────────────────────────────────────────────────────
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- users: one row per account, keyed by the auth user id
DROP POLICY IF EXISTS "pt users select own" ON public.users;
DROP POLICY IF EXISTS "pt users insert own" ON public.users;
DROP POLICY IF EXISTS "pt users update own" ON public.users;
CREATE POLICY "pt users select own" ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "pt users insert own" ON public.users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "pt users update own" ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- income
DROP POLICY IF EXISTS "pt income select own" ON public.income;
DROP POLICY IF EXISTS "pt income insert own" ON public.income;
DROP POLICY IF EXISTS "pt income update own" ON public.income;
DROP POLICY IF EXISTS "pt income delete own" ON public.income;
CREATE POLICY "pt income select own" ON public.income FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pt income insert own" ON public.income FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pt income update own" ON public.income FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "pt income delete own" ON public.income FOR DELETE TO authenticated USING (user_id = auth.uid());

-- expenses
DROP POLICY IF EXISTS "pt expenses select own" ON public.expenses;
DROP POLICY IF EXISTS "pt expenses insert own" ON public.expenses;
DROP POLICY IF EXISTS "pt expenses update own" ON public.expenses;
DROP POLICY IF EXISTS "pt expenses delete own" ON public.expenses;
CREATE POLICY "pt expenses select own" ON public.expenses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pt expenses insert own" ON public.expenses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pt expenses update own" ON public.expenses FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "pt expenses delete own" ON public.expenses FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Receipt photos (Storage bucket "Receipts", files stored as {userId}/{expenseId}.jpg) ──
UPDATE storage.buckets SET public = false WHERE id = 'Receipts';

-- An older dashboard-made policy that only checked the bucket, not the owner, so any signed-in
-- user could reach every receipt. Policies are OR'd together, so it has to go.
DROP POLICY IF EXISTS "Users can manage their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "pt receipts select own" ON storage.objects;
DROP POLICY IF EXISTS "pt receipts insert own" ON storage.objects;
DROP POLICY IF EXISTS "pt receipts update own" ON storage.objects;
DROP POLICY IF EXISTS "pt receipts delete own" ON storage.objects;
CREATE POLICY "pt receipts select own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'Receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pt receipts insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'Receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pt receipts update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'Receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pt receipts delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'Receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Check ─────────────────────────────────────────────────────────────────
-- Every row below should say rls_on = true. Any other policies listed for these tables that
-- allow "public" or "anon" access (e.g. old "Enable read access for all users" policies)
-- should be deleted in Dashboard → Authentication → Policies.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on,
       (SELECT string_agg(p.policyname || ' [' || array_to_string(p.roles, ',') || ']', '; ')
          FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('users', 'income', 'expenses')
ORDER BY 1;
