#!/bin/bash
echo "Population de la table insurers_insurance_types..."
PGPASSWORD=Remi1982 psql -h localhost -U remijolivalt -d assurclair << 'EOF'
TRUNCATE TABLE insurers_insurance_types;

INSERT INTO insurers_insurance_types (insurer_code, insurance_type_code)
SELECT DISTINCT 
    cg.insurer_code, 
    cg.insurance_type_code
FROM central_cg cg
INNER JOIN insurers i ON cg.insurer_code = i.code
INNER JOIN insurance_types it ON cg.insurance_type_code = it.code
WHERE cg.status = 'active'
ON CONFLICT (insurer_code, insurance_type_code) DO NOTHING;

SELECT COUNT(*) as total_links FROM insurers_insurance_types;
EOF
echo "✅ Table populée"
