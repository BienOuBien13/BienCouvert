-- Migration 004: Migration des données existantes vers les codes assureurs
-- Date: 2026-02-02
-- Description: Ajout de insurer_code aux tables et migration des données

-- ============================================================================
-- ÉTAPE 1 : Ajout des colonnes insurer_code
-- ============================================================================

-- Ajout de insurer_code à la table policies
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS insurer_code VARCHAR(50);

-- Ajout de insurer_code à la table central_cg
ALTER TABLE central_cg
ADD COLUMN IF NOT EXISTS insurer_code VARCHAR(50);

-- ============================================================================
-- ÉTAPE 2 : Migration des données existantes
-- ============================================================================

-- Migration policies.insurer → policies.insurer_code
UPDATE policies
SET insurer_code = CASE
  -- Générali (toutes les variantes)
  WHEN LOWER(insurer) IN ('generali', 'générali', 'central generali', 'central générali', 'generali central', 'générali central') 
    THEN 'CENTRAL_GENERALI'
  
  -- AXA
  WHEN LOWER(insurer) IN ('axa', 'axa france', 'axa assurance', 'direct assurance')
    THEN 'AXA'
  
  -- Allianz
  WHEN LOWER(insurer) IN ('allianz', 'allianz france')
    THEN 'ALLIANZ'
  
  -- Groupama
  WHEN LOWER(insurer) IN ('groupama', 'amaguiz')
    THEN 'GROUPAMA'
  
  -- Crédit Agricole
  WHEN LOWER(insurer) IN ('crédit agricole', 'credit agricole', 'ca assurances', 'predica', 'pacifica')
    THEN 'CREDIT_AGRICOLE'
  
  -- MACIF
  WHEN LOWER(insurer) IN ('macif')
    THEN 'MACIF'
  
  -- MAIF
  WHEN LOWER(insurer) IN ('maif')
    THEN 'MAIF'
  
  -- MAAF (groupe Covéa)
  WHEN LOWER(insurer) IN ('maaf', 'covéa', 'covea')
    THEN 'MAAF'
  
  -- GMF (groupe Covéa)
  WHEN LOWER(insurer) IN ('gmf')
    THEN 'GMF'
  
  -- MMA (groupe Covéa)
  WHEN LOWER(insurer) IN ('mma', 'mutuelles du mans', 'zero trace')
    THEN 'MMA'
  
  -- Matmut
  WHEN LOWER(insurer) IN ('matmut')
    THEN 'MATMUT'
  
  -- Aviva
  WHEN LOWER(insurer) IN ('aviva', 'aviva france')
    THEN 'AVIVA'
  
  -- Swiss Life
  WHEN LOWER(insurer) IN ('swiss life', 'swisslife')
    THEN 'SWISS_LIFE'
  
  -- CNP Assurances
  WHEN LOWER(insurer) IN ('cnp', 'cnp assurances')
    THEN 'CNP'
  
  -- AG2R La Mondiale
  WHEN LOWER(insurer) IN ('ag2r', 'ag2r la mondiale')
    THEN 'AG2R'
  
  -- Malakoff Humanis
  WHEN LOWER(insurer) IN ('malakoff', 'malakoff humanis', 'humanis')
    THEN 'MALAKOFF'
  
  -- Harmonie Mutuelle
  WHEN LOWER(insurer) IN ('harmonie', 'harmonie mutuelle')
    THEN 'HARMONIE'
  
  -- MGEN
  WHEN LOWER(insurer) IN ('mgen')
    THEN 'MGEN'
  
  -- April
  WHEN LOWER(insurer) IN ('april', 'april assurances')
    THEN 'APRIL'
  
  -- Néo-assureurs
  WHEN LOWER(insurer) IN ('luko')
    THEN 'LUKO'
  WHEN LOWER(insurer) IN ('friday')
    THEN 'FRIDAY'
  WHEN LOWER(insurer) IN ('acheel')
    THEN 'ACHEEL'
  
  -- Par défaut : AUTRE
  ELSE 'AUTRE'
END
WHERE insurer IS NOT NULL;

-- Migration central_cg.insurer → central_cg.insurer_code
UPDATE central_cg
SET insurer_code = CASE
  -- Générali (toutes les variantes)
  WHEN LOWER(insurer) IN ('generali', 'générali', 'central generali', 'central générali', 'generali central', 'générali central') 
    THEN 'CENTRAL_GENERALI'
  
  -- AXA
  WHEN LOWER(insurer) IN ('axa', 'axa france', 'axa assurance', 'direct assurance')
    THEN 'AXA'
  
  -- Allianz
  WHEN LOWER(insurer) IN ('allianz', 'allianz france')
    THEN 'ALLIANZ'
  
  -- Groupama
  WHEN LOWER(insurer) IN ('groupama', 'amaguiz')
    THEN 'GROUPAMA'
  
  -- Crédit Agricole
  WHEN LOWER(insurer) IN ('crédit agricole', 'credit agricole', 'ca assurances', 'predica', 'pacifica')
    THEN 'CREDIT_AGRICOLE'
  
  -- MACIF
  WHEN LOWER(insurer) IN ('macif')
    THEN 'MACIF'
  
  -- MAIF
  WHEN LOWER(insurer) IN ('maif')
    THEN 'MAIF'
  
  -- MAAF (groupe Covéa)
  WHEN LOWER(insurer) IN ('maaf', 'covéa', 'covea')
    THEN 'MAAF'
  
  -- GMF (groupe Covéa)
  WHEN LOWER(insurer) IN ('gmf')
    THEN 'GMF'
  
  -- MMA (groupe Covéa)
  WHEN LOWER(insurer) IN ('mma', 'mutuelles du mans', 'zero trace')
    THEN 'MMA'
  
  -- Matmut
  WHEN LOWER(insurer) IN ('matmut')
    THEN 'MATMUT'
  
  -- Aviva
  WHEN LOWER(insurer) IN ('aviva', 'aviva france')
    THEN 'AVIVA'
  
  -- Swiss Life
  WHEN LOWER(insurer) IN ('swiss life', 'swisslife')
    THEN 'SWISS_LIFE'
  
  -- CNP Assurances
  WHEN LOWER(insurer) IN ('cnp', 'cnp assurances')
    THEN 'CNP'
  
  -- AG2R La Mondiale
  WHEN LOWER(insurer) IN ('ag2r', 'ag2r la mondiale')
    THEN 'AG2R'
  
  -- Malakoff Humanis
  WHEN LOWER(insurer) IN ('malakoff', 'malakoff humanis', 'humanis')
    THEN 'MALAKOFF'
  
  -- Harmonie Mutuelle
  WHEN LOWER(insurer) IN ('harmonie', 'harmonie mutuelle')
    THEN 'HARMONIE'
  
  -- MGEN
  WHEN LOWER(insurer) IN ('mgen')
    THEN 'MGEN'
  
  -- April
  WHEN LOWER(insurer) IN ('april', 'april assurances')
    THEN 'APRIL'
  
  -- Néo-assureurs
  WHEN LOWER(insurer) IN ('luko')
    THEN 'LUKO'
  WHEN LOWER(insurer) IN ('friday')
    THEN 'FRIDAY'
  WHEN LOWER(insurer) IN ('acheel')
    THEN 'ACHEEL'
  
  -- Par défaut : AUTRE
  ELSE 'AUTRE'
END
WHERE insurer IS NOT NULL;

-- ============================================================================
-- ÉTAPE 3 : Ajout des contraintes de clés étrangères
-- ============================================================================

-- Contrainte FK pour policies.insurer_code
ALTER TABLE policies
ADD CONSTRAINT fk_policies_insurer_code
FOREIGN KEY (insurer_code) REFERENCES insurers(code)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Contrainte FK pour central_cg.insurer_code
ALTER TABLE central_cg
ADD CONSTRAINT fk_central_cg_insurer_code
FOREIGN KEY (insurer_code) REFERENCES insurers(code)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================================================
-- ÉTAPE 4 : Création des index
-- ============================================================================

CREATE INDEX idx_policies_insurer_code ON policies(insurer_code);
CREATE INDEX idx_central_cg_insurer_code ON central_cg(insurer_code);

-- ============================================================================
-- ÉTAPE 5 : Statistiques de migration
-- ============================================================================

-- Afficher les statistiques de migration
DO $$
DECLARE
  policies_migrated INTEGER;
  cg_migrated INTEGER;
BEGIN
  SELECT COUNT(*) INTO policies_migrated FROM policies WHERE insurer_code IS NOT NULL;
  SELECT COUNT(*) INTO cg_migrated FROM central_cg WHERE insurer_code IS NOT NULL;
  
  RAISE NOTICE '✅ Migration terminée:';
  RAISE NOTICE '  - Policies migrées: %', policies_migrated;
  RAISE NOTICE '  - Central CG migrées: %', cg_migrated;
END $$;
