-- Migration 008: Ajout colonne pdf_base64 pour stocker le PDF source
-- Date: 2026-02-14
-- Objectif: Permettre re-vectorisation et traçabilité du PDF uploadé via admin

BEGIN;

-- Ajouter la colonne pdf_base64 pour stocker le fichier source
ALTER TABLE central_cg ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;

-- Index pour vérifier présence du PDF (utile pour audit/re-vectorisation)
CREATE INDEX IF NOT EXISTS idx_central_cg_has_pdf 
  ON central_cg((pdf_base64 IS NOT NULL))
  WHERE pdf_base64 IS NOT NULL;

COMMENT ON COLUMN central_cg.pdf_base64 IS 'PDF source en base64 pour vectorisation et traçabilité';

COMMIT;
