-- Migration: Vectorisation améliorée page par page avec extraction tableaux
-- Créé le: 2026-02-08
-- Objectif: Améliorer la précision RAG et éliminer les hallucinations sur les tableaux de garanties

-- =====================================================================
-- TABLE 1: central_cg_pages
-- Une ligne par page de PDF pour extraction granulaire
-- =====================================================================
CREATE TABLE IF NOT EXISTS central_cg_pages (
  id BIGSERIAL PRIMARY KEY,
  central_cg_id INT NOT NULL REFERENCES central_cg(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  
  -- Contenu textuel
  content_text TEXT,                    -- Texte brut OCR de la page
  layout_text TEXT,                     -- Texte avec layout préservé (colonnes, retours ligne)
  
  -- Embedding sémantique
  embedding VECTOR(768),                -- Embedding de la page (dimension Gemini text-embedding-004)
  
  -- Données visuelles pour extraction avancée
  page_image_base64 TEXT,               -- Image PNG de la page en base64 (pour Gemini Vision)
  page_width INT,                       -- Largeur image en pixels
  page_height INT,                      -- Hauteur image en pixels
  
  -- Métadonnées structure
  has_table BOOLEAN DEFAULT FALSE,      -- Cette page contient un tableau de garanties
  table_json JSONB,                     -- Tableau reconstruit en JSON structuré
  table_extraction_confidence FLOAT,    -- Confiance de l'extraction (0-1)
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Contraintes
  UNIQUE (central_cg_id, page_number)
);

-- Index pour recherche par similarité sur les pages
CREATE INDEX IF NOT EXISTS idx_cg_pages_embedding 
  ON central_cg_pages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index pour retrouver toutes les pages d'un CG
CREATE INDEX IF NOT EXISTS idx_cg_pages_cg_id 
  ON central_cg_pages(central_cg_id);

-- Index pour les pages avec tableaux
CREATE INDEX IF NOT EXISTS idx_cg_pages_has_table 
  ON central_cg_pages(central_cg_id, has_table) 
  WHERE has_table = TRUE;

COMMENT ON TABLE central_cg_pages IS 'Pages individuelles des CG avec embedding par page pour RAG granulaire';
COMMENT ON COLUMN central_cg_pages.table_json IS 'Structure: {headers: [], rows: [{guarantee: "", formulas: {tiers_eco: "included", ...}}]}';


-- =====================================================================
-- TABLE 2: coverage_facts
-- Une ligne par cellule garantie × formule pour requêtage direct
-- =====================================================================
CREATE TABLE IF NOT EXISTS coverage_facts (
  id BIGSERIAL PRIMARY KEY,
  
  -- Identification du contexte
  insurer_code VARCHAR(50) NOT NULL,         -- Code assureur (ex: 'MAA01')
  insurance_type_code VARCHAR(50) NOT NULL,  -- Type assurance (ex: 'AUTO')
  central_cg_id INT REFERENCES central_cg(id) ON DELETE CASCADE,
  
  -- Clés normalisées
  guarantee_key VARCHAR(150) NOT NULL,       -- Clé garantie normalisée (ex: 'bris_de_glaces')
  guarantee_label VARCHAR(300) NOT NULL,     -- Libellé original (ex: 'Bris de glaces')
  formula_key VARCHAR(150) NOT NULL,         -- Clé formule normalisée (ex: 'tiers_essentiel')
  formula_label VARCHAR(300) NOT NULL,       -- Libellé original (ex: 'TIERS ESSENTIEL')
  
  -- Statut de couverture
  coverage_status VARCHAR(20) NOT NULL       -- 'included' | 'optional' | 'excluded' | 'not_applicable'
    CHECK (coverage_status IN ('included', 'optional', 'excluded', 'not_applicable')),
  
  -- Détails couverture (si disponibles)
  coverage_amount VARCHAR(100),              -- Montant couverture (ex: '100 000 €', 'Illimité')
  franchise VARCHAR(100),                    -- Franchise (ex: '150 €', 'Aucune')
  coverage_notes TEXT,                       -- Notes additionnelles
  
  -- Traçabilité source
  source_page_id BIGINT REFERENCES central_cg_pages(id) ON DELETE SET NULL,
  source_page_number INT,                    -- Numéro de page source
  source_cell JSONB,                         -- Position cellule: {row_index, col_index, row_text, col_text}
  extraction_confidence FLOAT,               -- Confiance extraction (0-1)
  
  -- Audit
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Contrainte unicité
  UNIQUE (insurer_code, insurance_type_code, central_cg_id, guarantee_key, formula_key)
);

-- Index pour lookup rapide garantie × formule
CREATE INDEX IF NOT EXISTS idx_covfacts_lookup
  ON coverage_facts (insurer_code, insurance_type_code, guarantee_key, formula_key);

-- Index pour recherche par garantie seule
CREATE INDEX IF NOT EXISTS idx_covfacts_guarantee
  ON coverage_facts (insurer_code, insurance_type_code, guarantee_key, coverage_status);

-- Index pour recherche par formule
CREATE INDEX IF NOT EXISTS idx_covfacts_formula
  ON coverage_facts (insurer_code, insurance_type_code, formula_key);

-- Index pour le CG source
CREATE INDEX IF NOT EXISTS idx_covfacts_cg_id
  ON coverage_facts (central_cg_id);

COMMENT ON TABLE coverage_facts IS 'Faits structurés garantie×formule extraits des tableaux de synthèse CG';
COMMENT ON COLUMN coverage_facts.guarantee_key IS 'Clé normalisée snake_case pour requêtage (ex: responsabilite_civile)';
COMMENT ON COLUMN coverage_facts.formula_key IS 'Clé normalisée snake_case pour requêtage (ex: tiers_essentiel)';
COMMENT ON COLUMN coverage_facts.coverage_status IS 'included=garantie incluse, optional=en option, excluded=non couverte';


-- =====================================================================
-- TABLE 3: guarantee_catalog (référentiel garanties)
-- Normalisation des garanties pour mapping intelligent
-- =====================================================================
CREATE TABLE IF NOT EXISTS guarantee_catalog (
  id SERIAL PRIMARY KEY,
  guarantee_key VARCHAR(150) UNIQUE NOT NULL,
  guarantee_label VARCHAR(300) NOT NULL,
  insurance_type_code VARCHAR(50) NOT NULL,
  category VARCHAR(100),                     -- ex: 'dommages', 'responsabilite', 'assistance'
  synonyms TEXT[],                           -- Variantes textuelles
  keywords TEXT[],                           -- Mots-clés pour détection
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Garanties auto communes
INSERT INTO guarantee_catalog (guarantee_key, guarantee_label, insurance_type_code, category, synonyms, keywords) VALUES
  ('responsabilite_civile', 'Responsabilité civile', 'AUTO', 'responsabilite', ARRAY['RC', 'Responsabilité'], ARRAY['responsabilité', 'civile', 'dommages', 'tiers']),
  ('defense_recours', 'Défense Pénale et Recours', 'AUTO', 'juridique', ARRAY['Défense et recours', 'Protection juridique'], ARRAY['défense', 'recours', 'juridique', 'avocat']),
  ('bris_de_glaces', 'Bris de glaces', 'AUTO', 'dommages', ARRAY['Vitrage', 'Pare-brise'], ARRAY['bris', 'glace', 'vitrage', 'pare-brise']),
  ('bris_pare_brise', 'Bris de pare-brise', 'AUTO', 'dommages', ARRAY['Pare-brise seul'], ARRAY['pare-brise', 'pare brise']),
  ('vol', 'Vol', 'AUTO', 'dommages', ARRAY['Vol et tentative'], ARRAY['vol', 'tentative']),
  ('incendie', 'Incendie, Explosion, Attentat', 'AUTO', 'dommages', ARRAY['Incendie'], ARRAY['incendie', 'explosion', 'attentat', 'feu']),
  ('dommages_tous_accidents', 'Dommages tous accidents', 'AUTO', 'dommages', ARRAY['Tous risques', 'Dommages collision'], ARRAY['dommages', 'collision', 'accident']),
  ('catastrophes_naturelles', 'Catastrophes naturelles', 'AUTO', 'dommages', ARRAY['Cat nat'], ARRAY['catastrophe', 'naturelle', 'inondation']),
  ('assistance_personnes', 'Assistance aux personnes', 'AUTO', 'assistance', ARRAY['Assistance 0km'], ARRAY['assistance', 'dépannage', 'remorquage']),
  ('dommages_corporels_conducteur', 'Dommages corporels du conducteur', 'AUTO', 'personne', ARRAY['Garantie conducteur'], ARRAY['conducteur', 'blessure', 'corporel'])
ON CONFLICT (guarantee_key) DO NOTHING;

COMMENT ON TABLE guarantee_catalog IS 'Référentiel des garanties standardisées pour mapping intelligent';


-- =====================================================================
-- TABLE 4: formula_catalog (référentiel formules)
-- Normalisation des formules pour mapping
-- =====================================================================
CREATE TABLE IF NOT EXISTS formula_catalog (
  id SERIAL PRIMARY KEY,
  formula_key VARCHAR(150) UNIQUE NOT NULL,
  formula_label VARCHAR(300) NOT NULL,
  insurer_code VARCHAR(50),                  -- NULL = formule générique
  insurance_type_code VARCHAR(50) NOT NULL,
  tier_level INT,                            -- 1=basique, 2=intermédiaire, 3=premium
  synonyms TEXT[],
  keywords TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Formules MAAF Auto
INSERT INTO formula_catalog (formula_key, formula_label, insurer_code, insurance_type_code, tier_level, synonyms, keywords) VALUES
  ('tiers_eco', 'TIERS ECO', 'MAA01', 'AUTO', 1, ARRAY['Tiers Eco'], ARRAY['tiers', 'eco', 'économique']),
  ('tiers', 'TIERS', 'MAA01', 'AUTO', 1, ARRAY['Formule Tiers'], ARRAY['tiers']),
  ('tiers_essentiel', 'TIERS ESSENTIEL', 'MAA01', 'AUTO', 2, ARRAY['Tiers Essentiel+'], ARRAY['tiers', 'essentiel']),
  ('tous_risques_eco', 'TOUS RISQUES ECO', 'MAA01', 'AUTO', 2, ARRAY['TR Eco'], ARRAY['tous', 'risques', 'eco']),
  ('tous_risques_confort', 'TOUS RISQUES CONFORT', 'MAA01', 'AUTO', 3, ARRAY['TR Confort', 'Confort+'], ARRAY['tous', 'risques', 'confort']),
  ('tous_risques_leasing', 'TOUS RISQUES LEASING', 'MAA01', 'AUTO', 3, ARRAY['Leasing', 'LOA'], ARRAY['leasing', 'loa', 'lld'])
ON CONFLICT (formula_key) DO NOTHING;

COMMENT ON TABLE formula_catalog IS 'Référentiel des formules standardisées par assureur';


-- =====================================================================
-- Fonctions helper
-- =====================================================================

-- Fonction trigger pour auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_cg_pages_updated_at BEFORE UPDATE ON central_cg_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coverage_facts_updated_at BEFORE UPDATE ON coverage_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- Vue helper pour lookup rapide
-- =====================================================================
CREATE OR REPLACE VIEW v_coverage_matrix AS
SELECT 
  cf.insurer_code,
  cf.insurance_type_code,
  cf.central_cg_id,
  cf.guarantee_key,
  cf.guarantee_label,
  cf.formula_key,
  cf.formula_label,
  cf.coverage_status,
  cf.coverage_amount,
  cf.franchise,
  cf.source_page_number,
  cg.type as cg_type,
  cg.owner as cg_owner,
  gc.category as guarantee_category
FROM coverage_facts cf
LEFT JOIN central_cg cg ON cf.central_cg_id = cg.id
LEFT JOIN guarantee_catalog gc ON cf.guarantee_key = gc.guarantee_key
ORDER BY cf.insurer_code, cf.insurance_type_code, cf.guarantee_key, cf.formula_key;

COMMENT ON VIEW v_coverage_matrix IS 'Vue simplifiée matrice garanties×formules pour affichage';
