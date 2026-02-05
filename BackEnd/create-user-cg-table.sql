-- Table pour stocker les conditions générales uploadées par les utilisateurs
-- Même structure que central_cg mais avec owner qui référence l'utilisateur

CREATE TABLE IF NOT EXISTS user_cg (
    id SERIAL PRIMARY KEY,
    insurer_code VARCHAR(10) NOT NULL,
    insurance_type_code VARCHAR(10) NOT NULL,
    version VARCHAR(10) DEFAULT '001',
    type VARCHAR(20) DEFAULT 'CG',
    owner VARCHAR(255) NOT NULL, -- Email de l'utilisateur propriétaire
    detail TEXT,
    url TEXT,
    target_filename VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    content_text TEXT,
    embedding VECTOR(768),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Contrainte pour référencer l'assureur
    CONSTRAINT fk_user_cg_insurer 
        FOREIGN KEY (insurer_code) 
        REFERENCES insurers(code) 
        ON DELETE CASCADE,
    
    -- Contrainte pour référencer le type d'assurance
    CONSTRAINT fk_user_cg_insurance_type 
        FOREIGN KEY (insurance_type_code) 
        REFERENCES insurance_types(code) 
        ON DELETE CASCADE
);

-- Index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_user_cg_owner ON user_cg(owner);
CREATE INDEX IF NOT EXISTS idx_user_cg_insurer ON user_cg(insurer_code);
CREATE INDEX IF NOT EXISTS idx_user_cg_insurance_type ON user_cg(insurance_type_code);
CREATE INDEX IF NOT EXISTS idx_user_cg_status ON user_cg(status);

-- Index pour la recherche vectorielle
CREATE INDEX IF NOT EXISTS idx_user_cg_embedding ON user_cg USING ivfflat (embedding vector_cosine_ops);

-- Commentaires
COMMENT ON TABLE user_cg IS 'Conditions générales uploadées par les utilisateurs';
COMMENT ON COLUMN user_cg.owner IS 'Email de l''utilisateur propriétaire du document';
COMMENT ON COLUMN user_cg.metadata IS 'Métadonnées enrichies: formules, options, résumé court';
