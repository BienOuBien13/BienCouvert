-- ============================================================================
-- Schéma de base de données PostgreSQL pour AssurClair
-- ============================================================================
-- Ce fichier crée les tables nécessaires pour l'application AssurClair
-- sur la VM Azure avec PostgreSQL + pgvector
-- ============================================================================

-- Extension pgvector pour le stockage de vecteurs (déjà créée par le superuser)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TABLE: users
-- Stocke les utilisateurs de l'application avec authentification
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    password VARCHAR(255) NOT NULL,        -- Hash bcrypt du mot de passe
    profile TEXT,                          -- JSON stringifié du profil utilisateur
    is_admin BOOLEAN DEFAULT false,
    gemini_ai_consent BOOLEAN DEFAULT false, -- Consentement pour traitement par Gemini AI (RGPD)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche rapide par email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- TABLE: policies
-- Stocke les polices d'assurance des utilisateurs
-- ============================================================================
CREATE TABLE IF NOT EXISTS policies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_number VARCHAR(100),
    insurer VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,           -- Type d'assurance (habitation, auto, etc.)
    premium DECIMAL(10, 2),               -- Prime annuelle
    coverage DECIMAL(12, 2),              -- Montant de couverture
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active',  -- active, expired, cancelled
    document_url TEXT,                    -- URL ou chemin du document
    document_data TEXT,                   -- Données du document en base64
    metadata JSONB,                       -- Métadonnées supplémentaires en JSON
    central_cg_id INTEGER REFERENCES central_cg(id) ON DELETE SET NULL,  -- Lien vers CG indexée
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche rapide par utilisateur
CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type);

-- ============================================================================
-- TABLE: central_cg
-- Référentiel central des Conditions Générales indexées
-- ============================================================================
CREATE TABLE IF NOT EXISTS central_cg (
    id SERIAL PRIMARY KEY,
    insurer VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    document_url TEXT,
    document_hash VARCHAR(64),            -- SHA-256 du document pour déduplication
    content_text TEXT,                    -- Texte extrait du PDF pour recherche
    embedding vector(768),                -- Vecteur d'embedding pour recherche sémantique
    metadata JSONB,                       -- Métadonnées (date de validité, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche vectorielle (cosinus similarity)
CREATE INDEX IF NOT EXISTS idx_central_cg_embedding ON central_cg 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Index pour recherche par assureur et produit
CREATE INDEX IF NOT EXISTS idx_central_cg_insurer_product ON central_cg(insurer, product_name);

-- ============================================================================
-- TABLE: chat_history
-- Historique des conversations avec l'IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_id INTEGER REFERENCES policies(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    model VARCHAR(100),                   -- Modèle IA utilisé
    tokens_used INTEGER,                  -- Nombre de tokens consommés
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche par utilisateur et date
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);

-- ============================================================================
-- TABLE: analysis_results
-- Résultats d'analyse de polices par l'IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    analysis_type VARCHAR(100) NOT NULL,  -- coverage_analysis, comparison, risk_assessment
    result JSONB NOT NULL,                -- Résultat de l'analyse en JSON
    score DECIMAL(5, 2),                  -- Score de confiance (0-100)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche par police
CREATE INDEX IF NOT EXISTS idx_analysis_results_policy_id ON analysis_results(policy_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_type ON analysis_results(analysis_type);

-- ============================================================================
-- Triggers pour mise à jour automatique de updated_at
-- ============================================================================

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour chaque table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
CREATE TRIGGER update_policies_updated_at 
    BEFORE UPDATE ON policies 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_central_cg_updated_at ON central_cg;
CREATE TRIGGER update_central_cg_updated_at 
    BEFORE UPDATE ON central_cg 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Affichage du résumé
-- ============================================================================
SELECT 'Schéma AssurClair créé avec succès!' as message;
SELECT 'Tables créées:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
