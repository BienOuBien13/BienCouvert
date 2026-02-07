-- Script de diagnostic pour vérifier les codes dans les tables

-- 1. Vérifier les codes de types d'assurance
SELECT code, "labelFr" as label FROM insurance_types ORDER BY code;

-- 2. Vérifier les codes d'assureurs
SELECT code, label FROM insurers ORDER BY code;

-- 3. Vérifier les données dans central_cg
SELECT 
    insurance_type_code, 
    insurer_code, 
    COUNT(*) as count,
    MAX(status) as status
FROM central_cg 
GROUP BY insurance_type_code, insurer_code
ORDER BY insurance_type_code, insurer_code;

-- 4. Vérifier un exemple spécifique
SELECT * FROM central_cg 
WHERE insurance_type_code LIKE 'AU%' 
  AND insurer_code LIKE 'MA%' 
LIMIT 5;
