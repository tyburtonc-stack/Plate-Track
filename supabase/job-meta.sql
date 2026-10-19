-- Run once in Supabase (Dashboard → SQL Editor → New Query).
-- Lets job statuses, job notes and quick notes sync between devices.
-- Until this is run, the app keeps that data on the device only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_meta jsonb;
