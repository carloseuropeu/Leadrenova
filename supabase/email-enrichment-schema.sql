-- Migration: add email enrichment columns to permis_construire
-- Run this in the Supabase SQL Editor before deploying api/prospect.js enrichment

ALTER TABLE permis_construire
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_permis_email ON permis_construire (email);
