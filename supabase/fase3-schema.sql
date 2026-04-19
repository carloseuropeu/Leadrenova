-- ═══════════════════════════════════════════════════════════════════
-- LeadRénov — Phase 3 Schema : Devis & Factures
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── Champs facturation sur profiles ─────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS siret               TEXT,
  ADD COLUMN IF NOT EXISTS tva_number          TEXT,
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS is_micro_entreprise BOOLEAN NOT NULL DEFAULT false;

-- ── Table devis ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  numero           TEXT NOT NULL,
  objet            TEXT,
  lignes           JSONB NOT NULL DEFAULT '[]',   -- LigneDevis[]
  montant_ht       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_rate         NUMERIC(5,2)  NOT NULL DEFAULT 20,
  montant_tva      NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_ttc      NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut           TEXT NOT NULL DEFAULT 'brouillon'
                     CHECK (statut IN ('brouillon','envoye','accepte','refuse')),
  validite_jours   INT  NOT NULL DEFAULT 30,
  notes            TEXT,
  sent_at          TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table factures ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  devis_id         UUID REFERENCES devis(id) ON DELETE SET NULL,
  numero           TEXT NOT NULL,
  objet            TEXT,
  lignes           JSONB NOT NULL DEFAULT '[]',   -- LigneDevis[]
  montant_ht       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_rate         NUMERIC(5,2)  NOT NULL DEFAULT 20,
  montant_tva      NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_ttc      NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut           TEXT NOT NULL DEFAULT 'brouillon'
                     CHECK (statut IN ('brouillon','envoyee','payee','retard','annulee')),
  date_emission    DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance    DATE NOT NULL,
  date_paiement    DATE,
  notes            TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── auto-update updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER factures_updated_at
  BEFORE UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS devis_user_id_idx    ON devis(user_id);
CREATE INDEX IF NOT EXISTS devis_lead_id_idx    ON devis(lead_id);
CREATE INDEX IF NOT EXISTS factures_user_id_idx ON factures(user_id);
CREATE INDEX IF NOT EXISTS factures_lead_id_idx ON factures(lead_id);
CREATE INDEX IF NOT EXISTS factures_devis_id_idx ON factures(devis_id);

-- ── Row Level Security — devis ───────────────────────────────────
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devis_select_own"
  ON devis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "devis_insert_own"
  ON devis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "devis_update_own"
  ON devis FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "devis_delete_own"
  ON devis FOR DELETE
  USING (auth.uid() = user_id);

-- ── Row Level Security — factures ────────────────────────────────
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_select_own"
  ON factures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "factures_insert_own"
  ON factures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "factures_update_own"
  ON factures FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "factures_delete_own"
  ON factures FOR DELETE
  USING (auth.uid() = user_id);
