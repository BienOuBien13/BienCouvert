-- Insertion des liens assureurs-types uniquement pour les assureurs valides
-- Version corrigée qui vérifie d'abord l'existence des assureurs

-- Vider la table si elle existe déjà
TRUNCATE TABLE insurers_insurance_types;

-- Insérer seulement les combinaisons où l'assureur et le type existent
INSERT INTO insurers_insurance_types (insurer_code, insurance_type_code)
SELECT DISTINCT 
    cg.insurer_code, 
    cg.insurance_type_code
FROM central_cg cg
INNER JOIN insurers i ON cg.insurer_code = i.code
INNER JOIN insurance_types it ON cg.insurance_type_code = it.code
WHERE cg.status = 'active'
ON CONFLICT (insurer_code, insurance_type_code) DO NOTHING;

-- Afficher le résultat
SELECT 
    COUNT(*) as total_links, 
    COUNT(DISTINCT insurer_code) as unique_insurers,
    COUNT(DISTINCT insurance_type_code) as unique_types
FROM insurers_insurance_types;
