-- Migration 009: Phase 1 - Classification sémantique des chunks
-- Date: 2026-02-19
-- Objectif: Ajouter le typage sémantique des pages CG pour un RAG plus précis
--           + suivi de statut de vectorisation par CG

BEGIN;

-- =====================================================================
-- 1. Enrichissement de central_cg_pages avec classification sémantique
-- =====================================================================

-- Type de chunk (permet de filtrer précisément lors de la recherche RAG)
ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS chunk_type TEXT
    CHECK (chunk_type IN (
      'definition',    -- Définitions contractuelles
      'garantie',      -- Description d'une garantie
      'exclusion',     -- Clause d'exclusion
      'restriction',   -- Franchise / plafond / condition
      'tableau',       -- Tableau de synthèse garanties × formules
      'general',       -- Texte général / administratif
      'inconnu'        -- Pas encore classifié
    )) DEFAULT 'inconnu';

-- Codes garanties détectés dans cette page (ex: ['RC','VOL','BRIS_GLACE'])
ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS guarantee_codes TEXT[] DEFAULT '{}';

-- Référence à l'article contractuel source (ex: 'Article 12.3')
ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS article_ref TEXT;

-- Score de confiance de la classification (0-1)
ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS classification_confidence FLOAT DEFAULT 0;

-- =====================================================================
-- 2. Suivi du statut de vectorisation dans central_cg
-- =====================================================================

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorization_status TEXT
    CHECK (vectorization_status IN (
      'pending',       -- En attente de vectorisation
      'processing',    -- Vectorisation en cours
      'done',          -- Vectorisation terminée avec succès
      'failed',        -- Echec de la vectorisation
      'partial'        -- Vectorisation partielle (certaines pages ont échoué)
    )) DEFAULT 'pending';

-- Statistiques de vectorisation
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS pages_total INT DEFAULT 0;
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS pages_processed INT DEFAULT 0;
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS tables_extracted INT DEFAULT 0;
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorized_at TIMESTAMP;
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorization_error TEXT;

-- Mettre à jour le statut des CG existantes qui ont déjà des pages vectorisées
UPDATE central_cg cg
SET 
  vectorization_status = 'done',
  pages_processed = (
    SELECT COUNT(*) FROM central_cg_pages p WHERE p.central_cg_id = cg.id
  ),
  tables_extracted = (
    SELECT COUNT(*) FROM central_cg_pages p WHERE p.central_cg_id = cg.id AND p.has_table = TRUE
  ),
  vectorized_at = (
    SELECT MAX(updated_at) FROM central_cg_pages p WHERE p.central_cg_id = cg.id
  )
WHERE EXISTS (
  SELECT 1 FROM central_cg_pages p WHERE p.central_cg_id = cg.id
);

-- =====================================================================
-- 3. Index pour les nouvelles colonnes
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_cg_pages_chunk_type 
  ON central_cg_pages(central_cg_id, chunk_type);

CREATE INDEX IF NOT EXISTS idx_cg_pages_guarantee_codes 
  ON central_cg_pages USING GIN(guarantee_codes);

CREATE INDEX IF NOT EXISTS idx_central_cg_vectorization_status 
  ON central_cg(vectorization_status);

-- =====================================================================
-- 4. Vue enrichie pour le RAG (remplace la version sans chunk_type)
-- =====================================================================

CREATE OR REPLACE VIEW v_rag_chunks AS
SELECT
  p.id,
  p.central_cg_id,
  p.page_number,
  p.content_text,
  p.embedding,
  p.chunk_type,
  p.guarantee_codes,
  p.article_ref,
  p.has_table,
  p.classification_confidence,
  cg.insurer_code,
  cg.insurance_type_code,
  cg.version,
  i.label AS insurer_label,
  it.label_fr AS type_label
FROM central_cg_pages p
JOIN central_cg cg ON p.central_cg_id = cg.id
LEFT JOIN insurers i ON cg.insurer_code = i.code
LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
WHERE cg.status = 'active';

COMMENT ON VIEW v_rag_chunks IS 'Vue RAG enrichie avec classification sémantique des chunks';

COMMIT;
