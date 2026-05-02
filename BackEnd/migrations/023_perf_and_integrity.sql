-- ============================================================================
-- Migration 023 : Performance & intégrité
--
-- Objectifs :
--   1. Accélérer la recherche full-text ILIKE de l'assistant (RAGAgent fallback)
--      via un index trigram sur central_cg_pages.content_text.
--   2. Accélérer resolveCoverageFacts (assistant) avec un index composite sur
--      coverage_facts (central_cg_id, formula_key) — requêtes Niveau 1 & 2.
--   3. Intégrité référentielle : ON DELETE SET NULL sur document_catalogue.central_cg_id
--      pour éviter les orphelins quand un central_cg est supprimé.
--   4. Index sur policies(central_cg_id) — utilisé par resolveCoverageFacts.
--
-- Idempotent : toutes les opérations utilisent IF NOT EXISTS / IF EXISTS.
-- ============================================================================

-- ── 1. Extension trigram pour ILIKE rapide ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Index trigram sur le texte des pages CG (recherche full-text rapide) ─
-- Permet au RAGAgent (fallback ILIKE) d'éviter le table scan sur central_cg_pages.
-- Gain attendu : 1-2s → < 100ms sur dataset typique.
CREATE INDEX IF NOT EXISTS idx_central_cg_pages_content_trgm
  ON central_cg_pages USING gin (content_text gin_trgm_ops);

-- ── 3. Index composite coverage_facts pour resolveCoverageFacts ─────────────
-- Niveaux 1, 2, 3 de resolveCoverageFacts filtrent sur central_cg_id puis formula_key.
CREATE INDEX IF NOT EXISTS idx_coverage_facts_cg_formula
  ON coverage_facts (central_cg_id, formula_key);

-- Index pour le tri/group by guarantee_key (ordering final)
CREATE INDEX IF NOT EXISTS idx_coverage_facts_guarantee
  ON coverage_facts (central_cg_id, guarantee_key);

-- ── 4. Index sur policies pour les jointures fréquentes ─────────────────────
CREATE INDEX IF NOT EXISTS idx_policies_central_cg
  ON policies (central_cg_id) WHERE central_cg_id IS NOT NULL;

-- ── 5. Intégrité référentielle document_catalogue → central_cg ──────────────
-- Évite les références orphelines après suppression d'un central_cg.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'document_catalogue'
  ) THEN
    -- Supprime l'ancienne contrainte si elle existe (sans cascade)
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_document_catalogue_central_cg'
        AND table_name = 'document_catalogue'
    ) THEN
      ALTER TABLE document_catalogue DROP CONSTRAINT fk_document_catalogue_central_cg;
    END IF;

    -- Ajoute la contrainte avec ON DELETE SET NULL
    ALTER TABLE document_catalogue
      ADD CONSTRAINT fk_document_catalogue_central_cg
      FOREIGN KEY (central_cg_id) REFERENCES central_cg(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ── 6. Index pour filtrage par status (admin lists) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_cg_owner ON user_cg(owner) WHERE owner IS NOT NULL;

-- ── 7. ANALYZE pour mettre à jour les statistiques du planner ───────────────
ANALYZE central_cg_pages;
ANALYZE coverage_facts;
ANALYZE policies;

SELECT '✅ Migration 023 (performance + intégrité) appliquée' AS status;
