-- Migration 012: Redimensionner les colonnes embedding de vector(768) à vector(3072)
-- Raison: gemini-embedding-001 (seul modèle disponible) produit des vecteurs de 3072 dimensions
-- Tables concernées: central_cg, central_cg_pages, user_cg, user_cg_pages

-- Les index ivfflat doivent être supprimés avant ALTER COLUMN (incompatible avec changement de type)

-- ─── central_cg ───────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_central_cg_embedding;
ALTER TABLE central_cg ALTER COLUMN embedding TYPE vector(3072);
CREATE INDEX IF NOT EXISTS idx_central_cg_embedding
  ON central_cg USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── central_cg_pages ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_cg_pages_embedding;
ALTER TABLE central_cg_pages ALTER COLUMN embedding TYPE vector(3072);
CREATE INDEX IF NOT EXISTS idx_cg_pages_embedding
  ON central_cg_pages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── user_cg ──────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_user_cg_embedding;
ALTER TABLE user_cg ALTER COLUMN embedding TYPE vector(3072);
CREATE INDEX IF NOT EXISTS idx_user_cg_embedding
  ON user_cg USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ─── user_cg_pages ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_user_cg_pages_embedding;
ALTER TABLE user_cg_pages ALTER COLUMN embedding TYPE vector(3072);
CREATE INDEX IF NOT EXISTS idx_user_cg_pages_embedding
  ON user_cg_pages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
