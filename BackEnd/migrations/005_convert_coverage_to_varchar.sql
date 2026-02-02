-- Migration 005: Modification de la colonne coverage pour stocker la formule
-- Date: 2026-02-02
-- Description: Convertir coverage de DECIMAL en VARCHAR pour stocker les noms de formules

-- Étape 1: Vérifier le type actuel
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'policies' 
    AND column_name = 'coverage' 
    AND data_type = 'numeric'
  ) THEN
    -- Étape 2: Modifier le type de colonne
    ALTER TABLE policies ALTER COLUMN coverage TYPE VARCHAR(100);
    RAISE NOTICE 'Colonne coverage convertie en VARCHAR(100)';
  ELSE
    RAISE NOTICE 'Colonne coverage déjà VARCHAR ou inexistante';
  END IF;
END $$;

-- Étape 3: Ajouter un commentaire explicatif
COMMENT ON COLUMN policies.coverage IS 'Formule d''assurance souscrite (ex: "Tous Risques", "Tiers+", "Plénitude")';

-- Note: Les données existantes seront automatiquement converties (NULL ou nombres → NULL)
