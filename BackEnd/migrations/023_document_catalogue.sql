-- ============================================================================
-- Migration 023 : Table de suivi documentaire (document_catalogue)
-- Matrice complète : assureur × type d'assurance × type de document
-- Permet la veille automatique, le versioning et la traçabilité
-- ============================================================================

-- Table principale de catalogue
CREATE TABLE IF NOT EXISTS document_catalogue (
    id                    SERIAL PRIMARY KEY,
    insurer_code          VARCHAR(50) NOT NULL,
    insurance_type_code   VARCHAR(50) NOT NULL,
    doc_type              VARCHAR(50) NOT NULL DEFAULT 'CG',  -- CG | IPID | notice | tableau_garanties

    -- Statut de la cellule dans la matrice
    matrix_status         VARCHAR(20) DEFAULT 'unknown'
        CHECK (matrix_status IN ('indexed','missing','outdated','discovered','error','unknown')),

    -- Document actuellement indexé
    central_cg_id         INTEGER REFERENCES central_cg(id) ON DELETE SET NULL,
    current_url           TEXT,
    current_version       VARCHAR(100),
    current_sha256        CHAR(64),
    indexed_at            TIMESTAMP,

    -- Dernière découverte (peut différer du doc indexé)
    discovered_url        TEXT,
    discovered_version    VARCHAR(100),
    discovered_sha256     CHAR(64),
    discovered_at         TIMESTAMP,

    -- Planification des vérifications
    last_checked_at       TIMESTAMP,
    next_check_at         TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
    check_frequency_days  INTEGER DEFAULT 30,

    -- Métadonnées
    classifier_result     JSONB,           -- dernier résultat CLASSIFIER
    formula_hints         TEXT[],          -- formules détectées
    auto_ingest           BOOLEAN DEFAULT false,
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW(),

    UNIQUE(insurer_code, insurance_type_code, doc_type)
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_doc_catalogue_status ON document_catalogue(matrix_status);
CREATE INDEX IF NOT EXISTS idx_doc_catalogue_next_check ON document_catalogue(next_check_at)
    WHERE matrix_status IN ('indexed', 'outdated', 'unknown');
CREATE INDEX IF NOT EXISTS idx_doc_catalogue_insurer ON document_catalogue(insurer_code);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_document_catalogue_updated_at ON document_catalogue;
CREATE TRIGGER update_document_catalogue_updated_at
    BEFORE UPDATE ON document_catalogue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Remplissage initial : une ligne par combinaison (assureur × type × CG)
-- pour les assureurs et types actifs existants
-- ============================================================================
INSERT INTO document_catalogue (insurer_code, insurance_type_code, doc_type, matrix_status)
SELECT i.code, t.code, 'CG', 'unknown'
FROM insurers i
CROSS JOIN insurance_types t
WHERE i.is_active = true AND t.is_active = true
ON CONFLICT (insurer_code, insurance_type_code, doc_type) DO NOTHING;

-- Synchroniser les documents déjà indexés dans central_cg
UPDATE document_catalogue dc
SET matrix_status = 'indexed',
    central_cg_id = cg.id,
    current_url   = cg.url,
    indexed_at    = cg.created_at,
    current_sha256 = NULL
FROM central_cg cg
WHERE cg.insurer_code = dc.insurer_code
  AND cg.insurance_type_code = dc.insurance_type_code
  AND dc.doc_type = 'CG'
  AND cg.status = 'active';

SELECT 'Migration 023 document_catalogue terminée' AS message;
