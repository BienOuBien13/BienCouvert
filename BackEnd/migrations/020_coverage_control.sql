-- Migration 020 : Table de contrôle non-régression pour l'extraction de tableaux de garanties
-- Permet de vérifier que l'ingestion PDF produit bien les coverage_facts attendus.
-- ⚠️  À exécuter sur la VM de production : node run-migration-020.js

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : coverage_facts_control
-- Contient les valeurs de référence attendues (garantie × formule × statut)
-- pour un ensemble de CG représentatifs. Sert de jeu de test de non-régression.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coverage_facts_control (
    id                      SERIAL PRIMARY KEY,

    -- Clé de jointure vers coverage_facts
    insurer_code            TEXT NOT NULL,
    insurance_type_code     TEXT NOT NULL,
    formula_key             TEXT NOT NULL,   -- snake_case normalised
    formula_label           TEXT NOT NULL,   -- libellé lisible
    guarantee_key           TEXT NOT NULL,   -- snake_case normalised
    guarantee_label         TEXT NOT NULL,   -- libellé lisible

    -- Valeur attendue
    expected_status         TEXT NOT NULL
                                CHECK (expected_status IN ('included','excluded','optional','not_applicable')),
    expected_amount_pattern TEXT,            -- regex optionnel sur coverage_amount (NULL = pas de vérif montant)
    optional_match          BOOLEAN DEFAULT false,   -- true = 'optional' accepté comme équivalent à 'included'

    -- Contexte documentaire
    source_doc_hint         TEXT,            -- ex: "MAAF Auto CG 2024_v2"
    notes                   TEXT,

    -- Résultat du dernier passage de vérification
    last_check_at           TIMESTAMP,
    last_check_result       TEXT
                                CHECK (last_check_result IN ('passed','failed','not_found','pending')),
    last_actual_status      TEXT,
    last_actual_amount      TEXT,
    last_check_error        TEXT,

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (insurer_code, insurance_type_code, formula_key, guarantee_key)
);

CREATE INDEX IF NOT EXISTS idx_ctrl_insurer_type
    ON coverage_facts_control(insurer_code, insurance_type_code);

CREATE INDEX IF NOT EXISTS idx_ctrl_check_result
    ON coverage_facts_control(last_check_result);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_coverage_facts_control_updated_at ON coverage_facts_control;
CREATE TRIGGER update_coverage_facts_control_updated_at
    BEFORE UPDATE ON coverage_facts_control
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- JEU DE DONNÉES DE RÉFÉRENCE
-- Contrôles représentatifs sur les types les plus courants
-- (AUTO AUT01, HABITATION HAB01, SANTÉ SAN01)
-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- AUTO — Formule Tiers (minimum légal)
-- =============================================================================
INSERT INTO coverage_facts_control
    (insurer_code, insurance_type_code, formula_key, formula_label,
     guarantee_key, guarantee_label, expected_status, notes, source_doc_hint)
VALUES
-- Responsabilité civile TOUJOURS incluse en Tiers
('MAAF01','AUT01','tiers','Tiers',
 'responsabilite_civile','Responsabilité civile','included',
 'RC obligatoire en France quel que soit le niveau de formule','MAAF Auto CG'),

-- Dommages au véhicule exclu en Tiers de base
('MAAF01','AUT01','tiers','Tiers',
 'dommages_collision','Dommages collision','excluded',
 'Franchise dommages exclue en formule Tiers stricte','MAAF Auto CG'),

-- Vol exclu en Tiers strict
('MAAF01','AUT01','tiers','Tiers',
 'vol','Vol','excluded',
 NULL,'MAAF Auto CG'),

-- Bris de glace exclu en Tiers strict
('MAAF01','AUT01','tiers','Tiers',
 'bris_de_glaces','Bris de glaces','excluded',
 NULL,'MAAF Auto CG'),

-- =============================================================================
-- AUTO — Formule Tiers+ / Tiers Essentiel+ (intermédiaire)
-- =============================================================================
('MAAF01','AUT01','tiers_essentiel_plus','Tiers Essentiel+',
 'responsabilite_civile','Responsabilité civile','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tiers_essentiel_plus','Tiers Essentiel+',
 'bris_de_glaces','Bris de glaces','included',
 'Bris de glace inclus à partir de Tiers+','MAAF Auto CG'),

('MAAF01','AUT01','tiers_essentiel_plus','Tiers Essentiel+',
 'vol','Vol','included',
 'Vol inclus en Tiers+','MAAF Auto CG'),

('MAAF01','AUT01','tiers_essentiel_plus','Tiers Essentiel+',
 'incendie','Incendie','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tiers_essentiel_plus','Tiers Essentiel+',
 'dommages_collision','Dommages collision','excluded',
 'Dommages propres exclus même en Tiers+','MAAF Auto CG'),

-- =============================================================================
-- AUTO — Formule Tous Risques
-- =============================================================================
('MAAF01','AUT01','tous_risques','Tous Risques',
 'responsabilite_civile','Responsabilité civile','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tous_risques','Tous Risques',
 'dommages_collision','Dommages collision','included',
 'Dommages propres inclus en Tous Risques','MAAF Auto CG'),

('MAAF01','AUT01','tous_risques','Tous Risques',
 'vol','Vol','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tous_risques','Tous Risques',
 'incendie','Incendie','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tous_risques','Tous Risques',
 'bris_de_glaces','Bris de glaces','included',NULL,'MAAF Auto CG'),

('MAAF01','AUT01','tous_risques','Tous Risques',
 'assistance','Assistance','included',NULL,'MAAF Auto CG'),

-- =============================================================================
-- HABITATION HAB01 — Formule Essentielle
-- =============================================================================
('MAAF01','HAB01','essentielle','Essentielle',
 'incendie','Incendie','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','essentielle','Essentielle',
 'degats_des_eaux','Dégâts des eaux','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','essentielle','Essentielle',
 'vol_cambriolage','Vol / cambriolage','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','essentielle','Essentielle',
 'responsabilite_civile','Responsabilité civile','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','essentielle','Essentielle',
 'protection_juridique','Protection juridique','excluded',
 'PJ non incluse en formule de base','MAAF Habitation CG'),

('MAAF01','HAB01','essentielle','Essentielle',
 'equipements_electroniques','Équipements électroniques','excluded',
 'Option à souscrire séparément en formule Essentielle','MAAF Habitation CG'),

-- =============================================================================
-- HABITATION HAB01 — Formule Confort (intermédiaire)
-- =============================================================================
('MAAF01','HAB01','confort','Confort',
 'incendie','Incendie','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','confort','Confort',
 'degats_des_eaux','Dégâts des eaux','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','confort','Confort',
 'vol_cambriolage','Vol / cambriolage','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','confort','Confort',
 'protection_juridique','Protection juridique','included',
 'PJ incluse dès Confort','MAAF Habitation CG'),

-- =============================================================================
-- HABITATION HAB01 — Formule Premium / Sérénité
-- =============================================================================
('MAAF01','HAB01','premium','Premium',
 'incendie','Incendie','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','premium','Premium',
 'vol_cambriolage','Vol / cambriolage','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','premium','Premium',
 'protection_juridique','Protection juridique','included',NULL,'MAAF Habitation CG'),

('MAAF01','HAB01','premium','Premium',
 'equipements_electroniques','Équipements électroniques','included',
 'Couverture appareils incluse en Premium','MAAF Habitation CG'),

-- =============================================================================
-- SANTÉ SAN01 — Formule Base
-- =============================================================================
('MAAF01','SAN01','base','Base',
 'hospitalisation','Hospitalisation','included',NULL,'MAAF Santé CG'),

('MAAF01','SAN01','base','Base',
 'consultation_medecin','Consultation médecin généraliste','included',NULL,'MAAF Santé CG'),

('MAAF01','SAN01','base','Base',
 'optique','Optique (montures + verres)','excluded',
 'Optique non couverte en formule Base','MAAF Santé CG'),

('MAAF01','SAN01','base','Base',
 'dentaire','Soins dentaires','included',
 'Remboursement partiel en Base','MAAF Santé CG'),

-- =============================================================================
-- SANTÉ SAN01 — Formule Renforcée
-- =============================================================================
('MAAF01','SAN01','renforcee','Renforcée',
 'hospitalisation','Hospitalisation','included',NULL,'MAAF Santé CG'),

('MAAF01','SAN01','renforcee','Renforcée',
 'optique','Optique (montures + verres)','included',
 'Optique prise en charge en formule Renforcée','MAAF Santé CG'),

('MAAF01','SAN01','renforcee','Renforcée',
 'dentaire','Soins dentaires','included',NULL,'MAAF Santé CG'),

('MAAF01','SAN01','renforcee','Renforcée',
 'medecines_douces','Médecines douces (ostéopathie, etc.)','optional',
 'En option dans certaines versions','MAAF Santé CG')

ON CONFLICT (insurer_code, insurance_type_code, formula_key, guarantee_key)
DO UPDATE SET
    formula_label          = EXCLUDED.formula_label,
    guarantee_label        = EXCLUDED.guarantee_label,
    expected_status        = EXCLUDED.expected_status,
    expected_amount_pattern= EXCLUDED.expected_amount_pattern,
    source_doc_hint        = EXCLUDED.source_doc_hint,
    notes                  = EXCLUDED.notes,
    updated_at             = CURRENT_TIMESTAMP;

SELECT 'Migration 020 OK — ' || COUNT(*) || ' contrôles de référence chargés' AS message
FROM coverage_facts_control;
