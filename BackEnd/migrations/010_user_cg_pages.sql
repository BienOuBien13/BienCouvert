-- Migration 010: Vectorisation page par page pour les CG personnalisées (user_cg)
-- Créé le: 2026-02-21
-- Objectif: Appliquer la même logique de vectorisation granulaire que pour central_cg
--           aux CG upload par les utilisateurs, avec stockage user_cg_pages et user_coverage_facts

-- =====================================================================
-- TABLE 1: user_cg_pages
-- Miroir de central_cg_pages, mais liée à user_cg
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_cg_pages (
  id BIGSERIAL PRIMARY KEY,
  user_cg_id INT NOT NULL REFERENCES user_cg(id) ON DELETE CASCADE,
  page_number INT NOT NULL,

  -- Contenu textuel
  content_text TEXT,
  layout_text TEXT,

  -- Embedding sémantique
  embedding VECTOR(768),

  -- Données visuelles
  page_image_base64 TEXT,
  page_width INT,
  page_height INT,

  -- Métadonnées structure
  has_table BOOLEAN DEFAULT FALSE,
  table_json JSONB,
  table_extraction_confidence FLOAT,

  -- Classification sémantique (identique à central_cg_pages)
  chunk_type VARCHAR(50) DEFAULT 'general',
  guarantee_codes TEXT[],
  article_ref VARCHAR(100),
  classification_confidence FLOAT,

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_cg_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_user_cg_pages_embedding
  ON user_cg_pages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_user_cg_pages_cg_id
  ON user_cg_pages(user_cg_id);

CREATE INDEX IF NOT EXISTS idx_user_cg_pages_has_table
  ON user_cg_pages(user_cg_id, has_table)
  WHERE has_table = TRUE;

COMMENT ON TABLE user_cg_pages IS 'Pages individuelles des CG personnalisées utilisateur avec embedding par page';

-- =====================================================================
-- TABLE 2: user_coverage_facts
-- Faits de couverture extraits des CG personnalisées
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_coverage_facts (
  id BIGSERIAL PRIMARY KEY,

  -- Identification du contexte
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  user_cg_id INT NOT NULL REFERENCES user_cg(id) ON DELETE CASCADE,
  insurer_code VARCHAR(50) NOT NULL,
  insurance_type_code VARCHAR(50) NOT NULL,

  -- Clés normalisées
  guarantee_key VARCHAR(150) NOT NULL,
  guarantee_label VARCHAR(300) NOT NULL,
  formula_key VARCHAR(150) NOT NULL,
  formula_label VARCHAR(300) NOT NULL,

  -- Statut
  coverage_status VARCHAR(20) NOT NULL
    CHECK (coverage_status IN ('included', 'optional', 'excluded', 'not_applicable')),

  -- Détails
  coverage_amount VARCHAR(100),
  franchise VARCHAR(100),
  coverage_notes TEXT,

  -- Traçabilité
  source_page_id BIGINT REFERENCES user_cg_pages(id) ON DELETE SET NULL,
  source_page_number INT,
  extraction_confidence FLOAT,

  -- Audit
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_cg_id, guarantee_key, formula_key)
);

CREATE INDEX IF NOT EXISTS idx_user_covfacts_lookup
  ON user_coverage_facts (user_cg_id, guarantee_key, formula_key);

CREATE INDEX IF NOT EXISTS idx_user_covfacts_cg_id
  ON user_coverage_facts (user_cg_id);

COMMENT ON TABLE user_coverage_facts IS 'Faits de couverture extraits des CG personnalisées utilisateur';

-- =====================================================================
-- Colonnes de statut vectorisation sur user_cg (miroir de central_cg)
-- =====================================================================
ALTER TABLE user_cg
  ADD COLUMN IF NOT EXISTS vectorization_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pages_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_processed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tables_extracted INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vectorized_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS vectorization_error TEXT,
  ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;
