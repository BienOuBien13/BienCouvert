-- ============================================================================
-- Migration 026 : Ajout de l'assureur générique "AUTRE"
--
-- Objectif :
--   Permettre l'upload d'une CG personnalisée pour un assureur non référencié
--   (insurer_code = 'AUTRE'). Sans cet enregistrement, l'INSERT dans user_cg
--   viole la FK fk_user_cg_insurer → insurers(code).
--
-- Idempotent : INSERT ... WHERE NOT EXISTS.
-- ============================================================================

INSERT INTO insurers (
  code, label, full_name, description,
  logo_url, website_url, phone, email, color,
  display_order, is_active, created_at, updated_at
)
SELECT
  'AUTRE', 'Autre', 'Autre assureur',
  'Assureur non répertorié dans le référentiel BienCouvert.',
  '', '', '', '', '#D97706',
  9999, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM insurers WHERE code = 'AUTRE'
);

SELECT 'Migration 026 appliquée : assureur AUTRE ajouté' AS status;
