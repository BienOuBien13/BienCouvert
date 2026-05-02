-- ============================================================================
-- Migration 024 : Ajout insurance_sub_type_code dans document_catalogue
--
-- Permet plusieurs contrats du même type pour un assureur donné.
-- Exemples : MAIF/HAB01 → RAQVAM, RAQVAM2 ; ou habitation_principale / pno
--
-- Change également la contrainte UNIQUE pour tenir compte du sous-type.
-- ============================================================================

-- 1. Ajouter la colonne (nullable — la plupart des entrées n'ont pas de sous-type)
ALTER TABLE document_catalogue
    ADD COLUMN IF NOT EXISTS insurance_sub_type_code VARCHAR(50) DEFAULT NULL;

-- 2. Supprimer l'ancienne contrainte UNIQUE (insurer + type + doc_type)
ALTER TABLE document_catalogue
    DROP CONSTRAINT IF EXISTS document_catalogue_insurer_code_insurance_type_code_doc_type_key;

-- 3. Créer une nouvelle contrainte unique tenant compte du sous-type
--    COALESCE gère les NULLs : deux entrées sans sous-type restent uniques sur (insurer, type, doctype)
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_catalogue_full
    ON document_catalogue (insurer_code, insurance_type_code, (COALESCE(insurance_sub_type_code, '')), doc_type);

-- 4. Index pour les requêtes par sous-type
CREATE INDEX IF NOT EXISTS idx_doc_catalogue_subtype
    ON document_catalogue (insurance_sub_type_code)
    WHERE insurance_sub_type_code IS NOT NULL;

SELECT 'Migration 024 terminée — insurance_sub_type_code ajouté à document_catalogue' AS message;
