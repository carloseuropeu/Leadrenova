-- Run this in the Supabase SQL Editor before the first cron import.

-- 1. Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS permis_construire (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_postal       text,
  commune           text,
  departement       text,
  type_travaux      text,
  surface_m2        numeric,
  nom_petitionnaire text,
  date_autorisation text,
  processed_month   text,
  created_at        timestamptz DEFAULT now()
);

-- 2. Add processed_month to an existing table (safe if column already exists)
ALTER TABLE permis_construire
  ADD COLUMN IF NOT EXISTS processed_month text;

-- 3. Unique constraint required by the upsert in api/import-sitadel.js
ALTER TABLE permis_construire
  ADD CONSTRAINT permis_unique
  UNIQUE (nom_petitionnaire, date_autorisation, commune);

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_permis_code_postal     ON permis_construire (code_postal);
CREATE INDEX IF NOT EXISTS idx_permis_processed_month ON permis_construire (processed_month);
