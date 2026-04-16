-- ── RLS policies for the `leads` table ──────────────────────────
-- Run this in the Supabase SQL Editor after enabling RLS on the table.
--
-- Enable RLS (idempotent):
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────────
-- Each user can only read their own leads.
CREATE POLICY "leads_select_own"
  ON leads
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── INSERT ───────────────────────────────────────────────────────
-- Users can only insert rows where user_id matches their own UID.
CREATE POLICY "leads_insert_own"
  ON leads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── UPDATE ───────────────────────────────────────────────────────
-- Users can only update their own leads.
CREATE POLICY "leads_update_own"
  ON leads
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── DELETE ───────────────────────────────────────────────────────
-- Users can only delete their own leads.
CREATE POLICY "leads_delete_own"
  ON leads
  FOR DELETE
  USING (auth.uid() = user_id);
