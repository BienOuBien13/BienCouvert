-- ============================================================================
-- MIGRATION : Conversion des types textuels vers les codes normalisés
-- ============================================================================

-- Étape 1 : Ajouter une colonne temporaire pour le code dans policies
ALTER TABLE policies ADD COLUMN IF NOT EXISTS type_code VARCHAR(20);

-- Étape 2 : Mapper les types existants vers les codes
UPDATE policies SET type_code = 
  CASE 
    WHEN LOWER(type) IN ('auto', 'automobile', 'voiture') THEN 'AUTO'
    WHEN LOWER(type) IN ('habitation', 'logement', 'maison', 'appartement') THEN 'HABITATION'
    WHEN LOWER(type) IN ('santé', 'sante', 'mutuelle', 'santé complémentaire') THEN 'SANTE'
    WHEN LOWER(type) IN ('prévoyance', 'prevoyance') THEN 'PREVOYANCE'
    WHEN LOWER(type) IN ('professionnelle', 'pro', 'rc pro') THEN 'PRO'
    WHEN LOWER(type) IN ('emprunteur', 'crédit', 'credit') THEN 'EMPRUNTEUR'
    WHEN LOWER(type) IN ('bancaire', 'banque', 'carte bancaire') THEN 'BANCAIRE'
    WHEN LOWER(type) IN ('appareils', 'électronique', 'electronique') THEN 'APPAREILS'
    WHEN LOWER(type) IN ('juridique', 'protection juridique') THEN 'JURIDIQUE'
    WHEN LOWER(type) IN ('voyage', 'travel') THEN 'VOYAGE'
    WHEN LOWER(type) IN ('animaux', 'animal', 'chien', 'chat') THEN 'ANIMAUX'
    WHEN LOWER(type) IN ('vie', 'assurance vie', 'épargne') THEN 'VIE'
    ELSE 'AUTRE'
  END
WHERE type_code IS NULL;

-- Étape 3 : Faire de même pour central_cg
ALTER TABLE central_cg ADD COLUMN IF NOT EXISTS type_code VARCHAR(20);

UPDATE central_cg SET type_code = 
  CASE 
    WHEN LOWER(metadata->>'type') IN ('auto', 'automobile', 'voiture') THEN 'AUTO'
    WHEN LOWER(metadata->>'type') IN ('habitation', 'logement', 'maison', 'appartement') THEN 'HABITATION'
    WHEN LOWER(metadata->>'type') IN ('santé', 'sante', 'mutuelle', 'santé complémentaire') THEN 'SANTE'
    WHEN LOWER(metadata->>'type') IN ('prévoyance', 'prevoyance') THEN 'PREVOYANCE'
    WHEN LOWER(metadata->>'type') IN ('professionnelle', 'pro', 'rc pro') THEN 'PRO'
    WHEN LOWER(metadata->>'type') IN ('emprunteur', 'crédit', 'credit') THEN 'EMPRUNTEUR'
    WHEN LOWER(metadata->>'type') IN ('bancaire', 'banque', 'carte bancaire') THEN 'BANCAIRE'
    WHEN LOWER(metadata->>'type') IN ('appareils', 'électronique', 'electronique') THEN 'APPAREILS'
    WHEN LOWER(metadata->>'type') IN ('juridique', 'protection juridique') THEN 'JURIDIQUE'
    WHEN LOWER(metadata->>'type') IN ('voyage', 'travel') THEN 'VOYAGE'
    WHEN LOWER(metadata->>'type') IN ('animaux', 'animal', 'chien', 'chat') THEN 'ANIMAUX'
    WHEN LOWER(metadata->>'type') IN ('vie', 'assurance vie', 'épargne') THEN 'VIE'
    ELSE 'AUTRE'
  END
WHERE type_code IS NULL;

-- Étape 4 : Ajouter les contraintes de clé étrangère
ALTER TABLE policies 
  ADD CONSTRAINT fk_policies_type 
  FOREIGN KEY (type_code) 
  REFERENCES insurance_types(code);

ALTER TABLE central_cg 
  ADD CONSTRAINT fk_central_cg_type 
  FOREIGN KEY (type_code) 
  REFERENCES insurance_types(code);

-- Étape 5 : Créer des index pour les performances
CREATE INDEX idx_policies_type_code ON policies(type_code);
CREATE INDEX idx_central_cg_type_code ON central_cg(type_code);

-- Note : On garde la colonne 'type' existante pour la rétrocompatibilité
-- Dans une future migration, on pourra la supprimer et renommer type_code en type

COMMENT ON COLUMN policies.type_code IS 'Code normalisé du type d''assurance (FK vers insurance_types)';
COMMENT ON COLUMN central_cg.type_code IS 'Code normalisé du type d''assurance (FK vers insurance_types)';
