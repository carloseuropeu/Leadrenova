-- Migration: add phone and site_web columns to permis_construire
-- Run this in the Supabase SQL Editor before triggering enrich_leads

ALTER TABLE permis_construire
  ADD COLUMN IF NOT EXISTS phone   text;

ALTER TABLE permis_construire
  ADD COLUMN IF NOT EXISTS site_web text;
