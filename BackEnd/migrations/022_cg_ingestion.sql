-- ============================================================================
-- Migration 022 — Infrastructure d'ingestion automatique de CG
-- ============================================================================
-- Ajoute :
--   1. Colonnes de configuration de crawl sur la table `insurers`
--   2. Table `cg_ingestion_jobs` pour le suivi des jobs d'ingestion
-- ============================================================================

-- ─── 1. Colonnes de crawl sur insurers ──────────────────────────────────────

ALTER TABLE insurers
  ADD COLUMN IF NOT EXISTS cg_search_enabled   BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS cg_search_patterns  JSONB    DEFAULT '{}'::jsonb;

-- Exemple de valeur pour cg_search_patterns :
-- {
--   "cg_page_urls":    ["https://www.axa.fr/aide/documents-contractuels.html"],
--   "pdf_url_patterns": ["conditions-generales", "notice-information"],
--   "exclude_patterns": ["bulletin-adhesion", "formulaire", "mandat"]
-- }

COMMENT ON COLUMN insurers.cg_search_enabled  IS 'Active la découverte automatique de CG pour cet assureur';
COMMENT ON COLUMN insurers.cg_search_patterns IS 'JSONB : cg_page_urls[], pdf_url_patterns[], exclude_patterns[]';

-- ─── 2. Table de suivi des jobs d'ingestion ──────────────────────────────────

CREATE TABLE IF NOT EXISTS cg_ingestion_jobs (
  id                    SERIAL PRIMARY KEY,
  run_id                UUID         NOT NULL DEFAULT gen_random_uuid(),  -- groupe tous les jobs d'un lancement
  insurer_code          VARCHAR(20)  NOT NULL,
  insurance_type_code   VARCHAR(20)  NOT NULL,
  source_url            TEXT,
  status                VARCHAR(20)  NOT NULL DEFAULT 'pending',
    -- pending | fetching | classifying | vectorizing | done | skipped | error
  confidence            DECIMAL(4,2),   -- score de classification (0-1)
  classifier_result     JSONB,          -- réponse brute de l'agent CLASSIFIER
  error_message         TEXT,
  central_cg_id         INTEGER REFERENCES central_cg(id) ON DELETE SET NULL,
  pdf_sha256            CHAR(64),       -- déduplication par hash
  pages_count           INTEGER,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_run_id
  ON cg_ingestion_jobs(run_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_status
  ON cg_ingestion_jobs(status);

CREATE INDEX IF NOT EXISTS idx_ingestion_insurer_type
  ON cg_ingestion_jobs(insurer_code, insurance_type_code);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_cg_ingestion_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cg_ingestion_updated_at ON cg_ingestion_jobs;
CREATE TRIGGER trg_cg_ingestion_updated_at
  BEFORE UPDATE ON cg_ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION update_cg_ingestion_updated_at();
