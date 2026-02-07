-- Table de liaison entre assureurs et types d'assurance
-- Permet de filtrer les assureurs disponibles par type d'assurance

CREATE TABLE IF NOT EXISTS insurers_insurance_types (
    id SERIAL PRIMARY KEY,
    insurer_code VARCHAR(10) NOT NULL,
    insurance_type_code VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Contrainte d'unicité : un assureur ne peut être lié qu'une seule fois à un type
    CONSTRAINT uq_insurer_insurance_type UNIQUE (insurer_code, insurance_type_code),
    
    -- Clés étrangères
    CONSTRAINT fk_insurer 
        FOREIGN KEY (insurer_code) 
        REFERENCES insurers(code) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_insurance_type 
        FOREIGN KEY (insurance_type_code) 
        REFERENCES insurance_types(code) 
        ON DELETE CASCADE
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_insurers_insurance_types_insurer ON insurers_insurance_types(insurer_code);
CREATE INDEX IF NOT EXISTS idx_insurers_insurance_types_type ON insurers_insurance_types(insurance_type_code);

-- Données initiales basées sur les CG existantes dans central_cg
INSERT INTO insurers_insurance_types (insurer_code, insurance_type_code)
SELECT DISTINCT insurer_code, insurance_type_code 
FROM central_cg 
WHERE status = 'active'
ON CONFLICT (insurer_code, insurance_type_code) DO NOTHING;

-- Commentaires
COMMENT ON TABLE insurers_insurance_types IS 'Table de liaison entre assureurs et types d''assurance disponibles';
COMMENT ON COLUMN insurers_insurance_types.insurer_code IS 'Code de l''assureur (ex: MAAF, MAIF)';
COMMENT ON COLUMN insurers_insurance_types.insurance_type_code IS 'Code du type d''assurance (ex: AUT, HAB, SAN)';
