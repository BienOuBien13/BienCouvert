-- Migration 013: Revenir à vector(768) pour central_cg
-- (migration 012 a partiellement tourné - central_cg altéré à 3072 mais index non créé)
-- Solution: utiliser outputDimensionality: 768 de gemini-embedding-001

DROP INDEX IF EXISTS idx_central_cg_embedding;
ALTER TABLE central_cg ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);
CREATE INDEX IF NOT EXISTS idx_central_cg_embedding
  ON central_cg USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
