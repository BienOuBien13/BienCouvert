-- Migration 013: Revenir à vector(768) pour central_cg
-- (migration 012 a partiellement tourné - central_cg altéré à 3072 mais index non créé)
-- Solution: utiliser outputDimensionality: 768 de gemini-embedding-001
-- Note: l'index ivfflat sera créé séparément après le chargement des données

DROP INDEX IF EXISTS idx_central_cg_embedding;
ALTER TABLE central_cg ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);
