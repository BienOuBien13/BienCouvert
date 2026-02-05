-- Migration 007: Restructuration de la table central_cg
-- Suppression des doublons et normalisation des colonnes

BEGIN;

-- 1. Créer une table temporaire avec la nouvelle structure
CREATE TABLE central_cg_new (
    id SERIAL PRIMARY KEY,
    insurer_code VARCHAR(50) NOT NULL,
    insurance_type_code VARCHAR(50) NOT NULL,
    version VARCHAR(50),
    type VARCHAR(100),
    owner VARCHAR(255),
    detail TEXT,
    url TEXT,
    target_filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    content_text TEXT,
    embedding vector(768),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrer les données existantes vers la nouvelle structure
INSERT INTO central_cg_new (
    id,
    insurer_code,
    insurance_type_code,
    version,
    type,
    owner,
    detail,
    url,
    target_filename,
    status,
    content_text,
    embedding,
    metadata,
    created_at,
    updated_at
)
SELECT 
    id,
    COALESCE(insurer_code, insurer) as insurer_code,
    COALESCE(type_code, 'UNKNOWN') as insurance_type_code,
    version,
    NULL as type,
    NULL as owner,
    NULL as detail,
    document_url as url,
    NULL as target_filename,
    'active' as status,
    content_text,
    embedding,
    jsonb_build_object(
        'document_hash', document_hash,
        'product_name', product_name,
        'indexed_formules', '[]'::jsonb,
        'indexed_options', '{}'::jsonb,
        'description', ''
    ) || COALESCE(metadata, '{}'::jsonb) as metadata,
    created_at,
    updated_at
FROM central_cg;

-- 3. Supprimer l'ancienne table et renommer la nouvelle
DROP TABLE IF EXISTS central_cg CASCADE;
ALTER TABLE central_cg_new RENAME TO central_cg;

-- 4. Recréer les index
CREATE INDEX IF NOT EXISTS idx_central_cg_embedding ON central_cg 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_central_cg_insurer_type ON central_cg(insurer_code, insurance_type_code);
CREATE INDEX IF NOT EXISTS idx_central_cg_status ON central_cg(status);
CREATE INDEX IF NOT EXISTS idx_central_cg_url ON central_cg(url);

-- 5. Ajouter les contraintes de clés étrangères si les tables de référence existent
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insurers') THEN
        ALTER TABLE central_cg ADD CONSTRAINT fk_central_cg_insurer_code 
            FOREIGN KEY (insurer_code) REFERENCES insurers(code);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insurance_types') THEN
        ALTER TABLE central_cg ADD CONSTRAINT fk_central_cg_insurance_type 
            FOREIGN KEY (insurance_type_code) REFERENCES insurance_types(code);
    END IF;
END $$;

-- 6. Réinitialiser la séquence
SELECT setval('central_cg_id_seq', (SELECT MAX(id) FROM central_cg));

COMMIT;
