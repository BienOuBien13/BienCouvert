-- ============================================================================
-- Migration : Ajout du lien entre policies et central_cg
-- ============================================================================
-- Cette migration ajoute une colonne central_cg_id dans la table policies
-- pour référencer les Conditions Générales officielles du produit.
-- ============================================================================

-- Ajouter la colonne central_cg_id (nullable car les policies existantes n'en ont pas)
ALTER TABLE policies 
ADD COLUMN IF NOT EXISTS central_cg_id INTEGER REFERENCES central_cg(id) ON DELETE SET NULL;

-- Index pour améliorer les performances des jointures
CREATE INDEX IF NOT EXISTS idx_policies_central_cg_id ON policies(central_cg_id);

-- Commentaire pour documentation
COMMENT ON COLUMN policies.central_cg_id IS 'Référence vers l''entrée central_cg correspondant au produit officiel';

-- ============================================================================
-- Exemples de requêtes après migration
-- ============================================================================

-- Récupérer une policy avec ses CG officielles :
-- SELECT p.*, c.document_url as cg_url, c.product_name, c.version
-- FROM policies p
-- LEFT JOIN central_cg c ON p.central_cg_id = c.id
-- WHERE p.id = 123;

-- Trouver toutes les policies utilisant un produit spécifique :
-- SELECT p.*, u.name as user_name
-- FROM policies p
-- JOIN users u ON p.user_id = u.id
-- WHERE p.central_cg_id = 456;
