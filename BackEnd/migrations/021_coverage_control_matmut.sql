-- Migration 021 : Ajout colonne source_cg_filename + jeu de test Matmut HAB01
-- Lie chaque ligne de contrôle à un fichier CG spécifique (non-régression PDF-précis).
-- ⚠️  À exécuter sur la VM de production : node run-migration-021.js

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajout de la colonne source_cg_filename
--    Référence le fichier PDF de CG utilisé comme document de référence.
--    '' (chaîne vide) = contrôle générique (s'applique à tous les CG de cet assureur+type).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE coverage_facts_control
    ADD COLUMN IF NOT EXISTS source_cg_filename TEXT NOT NULL DEFAULT '';

-- Mettre à jour les lignes déjà existantes (ex : MAAF01) qui auraient été
-- ajoutées avant cette migration (valeur NULL → '').
--ahe par nom de fichier
CREATE INDEX IF NOT EXISTS idx_ctrl_source_cg_filename
    ON coverage_facts_control(source_cg_filename)
    WHERE source_cg_filename <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Mise à jour de la contrainte UNIQUE pour tenir compte du filename
--    Permet d'avoir des valeurs de référence DIFFÉRENTES selon la version du CG.
--    '' = générique, 'MAT01_HAB01_002.pdf' = spécifique à ce document.
-- ─────────────────────────────────────────────────────────────────────────────
-- Supprime l'ancienne contrainte 4-col (nommée auto par PG si 020 pré-patch)
ALTER TABLE coverage_facts_control
    DROP CONSTRAINT IF EXISTS coverage_facts_control_insurer_code_insurance_type_code_for_key;
-- Supprime uq_ctrl_full_key si déjà créée par la version patchée de 020
ALTER TABLE coverage_facts_control
    DROP CONSTRAINT IF EXISTS uq_ctrl_full_key;

ALTER TABLE coverage_facts_control
    ADD CONSTRAINT uq_ctrl_full_key
    UNIQUE (insurer_code, insurance_type_code, formula_key, guarantee_key, source_cg_filename);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. JEU DE TEST — Matmut Habitation (MAT01 / HAB01)
--    Document de référence : MAT01_HAB01_002.pdf
--
--    Formules Matmut MRH (Multi-Risques Habitation) :
--      • Essentielle  — couverture de base
--      • Confort      — couverture intermédiaire
--      • Sérénité     — couverture premium
--
--    Les guarantee_key sont les valeurs normalisées attendues après extraction
--    Vision par le pipeline d'ingestion PDF (normalizeGuaranteeKey).
--    Si un test échoue, vérifier les logs d'extraction pour connaître le
--    guarantee_key réel extrait, et corriger ici si nécessaire.
-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- MATMUT HAB01 — Formule ESSENTIELLE
-- Garanties obligatoirement incluses dans toutes les formules
-- =============================================================================
INSERT INTO coverage_facts_control
    (insurer_code, insurance_type_code, formula_key, formula_label,
     guarantee_key, guarantee_label, expected_status,
     source_cg_filename, source_doc_hint, notes)
VALUES
-- ── Garanties incluses (toutes formules) ──────────────────────────────────
('MAT01','HAB01','essentielle','Essentielle',
 'incendie_explosion_implosion','Incendie, explosion, implosion','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Garantie feu/explosion toujours incluse'),

('MAT01','HAB01','essentielle','Essentielle',
 'degats_des_eaux','Dégâts des eaux','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Garantie DDO toujours incluse'),

('MAT01','HAB01','essentielle','Essentielle',
 'vol_et_vandalisme','Vol et vandalisme','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Vol/cambriolage inclus dès la formule de base'),

('MAT01','HAB01','essentielle','Essentielle',
 'catastrophes_naturelles','Catastrophes naturelles','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Obligatoire par loi (loi du 13/07/1982) - doit être incluse quelle que soit la formule'),

('MAT01','HAB01','essentielle','Essentielle',
 'catastrophes_technologiques','Catastrophes technologiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Obligatoire par loi (loi du 30/07/2003)'),

('MAT01','HAB01','essentielle','Essentielle',
 'evenements_climatiques','Événements climatiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Tempêtes, grêle, neige — inclus dans toutes formules Matmut MRH'),

('MAT01','HAB01','essentielle','Essentielle',
 'dommages_electriques','Dommages électriques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 NULL),

('MAT01','HAB01','essentielle','Essentielle',
 'responsabilite_civile','Responsabilité civile','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'RC vie privée toujours incluse'),

('MAT01','HAB01','essentielle','Essentielle',
 'assistance','Assistance','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Assistance dépannage incluse dès Essentielle'),
-- ── Garanties absentes en Essentielle ─────────────────────────────────────
('MAT01','HAB01','essentielle','Essentielle',
 'bris_de_glaces','Bris de glaces','optional',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Bris de glaces en option (non inclus de base) en Essentielle'),

('MAT01','HAB01','essentielle','Essentielle',
 'protection_juridique','Protection juridique','excluded',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'PJ non incluse en formule Essentielle'),

('MAT01','HAB01','essentielle','Essentielle',
 'valeur_a_neuf','Valeur à neuf','excluded',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Valeur à neuf uniquement en Sérénité'),

('MAT01','HAB01','essentielle','Essentielle',
 'appareils_nomades','Appareils nomades','excluded',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Appareils mobiles non couverts en Essentielle'),

('MAT01','HAB01','confort','Confort',
 'incendie_explosion_implosion','Incendie, explosion, implosion','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'degats_des_eaux','Dégâts des eaux','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'vol_et_vandalisme','Vol et vandalisme','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'catastrophes_naturelles','Catastrophes naturelles','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'catastrophes_technologiques','Catastrophes technologiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'evenements_climatiques','Événements climatiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'dommages_electriques','Dommages électriques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'responsabilite_civile','Responsabilité civile','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','confort','Confort',
 'assistance','Assistance','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

-- Bris de glaces : inclus en Confort (contrairement à Essentielle)
('MAT01','HAB01','confort','Confort',
 'bris_de_glaces','Bris de glaces','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Bris de glaces inclus à partir de la formule Confort'),

-- Protection juridique incluse en Confort
('MAT01','HAB01','confort','Confort',
 'protection_juridique','Protection juridique','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'PJ incluse dès Confort'),

-- Appareils nomades : en option en Confort
('MAT01','HAB01','confort','Confort',
 'appareils_nomades','Appareils nomades','optional',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Option disponible en Confort, non incluse par défaut'),

-- Valeur à neuf : absente en Confort
('MAT01','HAB01','confort','Confort',
 'valeur_a_neuf','Valeur à neuf','excluded',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Valeur à neuf uniquement en Sérénité'),

-- =============================================================================
-- MATMUT HAB01 — Formule SÉRÉNITÉ
-- =============================================================================
('MAT01','HAB01','serenite','Sérénité',
 'incendie_explosion_implosion','Incendie, explosion, implosion','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'degats_des_eaux','Dégâts des eaux','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'vol_et_vandalisme','Vol et vandalisme','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'catastrophes_naturelles','Catastrophes naturelles','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'catastrophes_technologiques','Catastrophes technologiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'evenements_climatiques','Événements climatiques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'dommages_electriques','Dommages électriques','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'responsabilite_civile','Responsabilité civile','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'assistance','Assistance','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'bris_de_glaces','Bris de glaces','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

('MAT01','HAB01','serenite','Sérénité',
 'protection_juridique','Protection juridique','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',NULL),

-- Valeur à neuf : incluse uniquement en Sérénité
('MAT01','HAB01','serenite','Sérénité',
 'valeur_a_neuf','Valeur à neuf','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Remplacement à neuf inclus uniquement en formule Sérénité'),

-- Appareils nomades : inclus en Sérénité
('MAT01','HAB01','serenite','Sérénité',
 'appareils_nomades','Appareils nomades','included',
 'MAT01_HAB01_002.pdf','Matmut MRH CG MAT01_HAB01_002',
 'Smartphones, tablettes, appareils photo inclus en Sérénité')

ON CONFLICT ON CONSTRAINT uq_ctrl_full_key
DO UPDATE SET
    formula_label           = EXCLUDED.formula_label,
    guarantee_label         = EXCLUDED.guarantee_label,
    expected_status         = EXCLUDED.expected_status,
    expected_amount_pattern = EXCLUDED.expected_amount_pattern,
    source_doc_hint         = EXCLUDED.source_doc_hint,
    notes                   = EXCLUDED.notes,
    updated_at              = CURRENT_TIMESTAMP;

-- Rapport final
SELECT
    'Migration 021 OK — ' || COUNT(*) || ' contrôles de référence au total' AS message
FROM coverage_facts_control;

SELECT
    insurer_code,
    insurance_type_code,
    source_cg_filename,
    COUNT(*) AS nb_controles
FROM coverage_facts_control
GROUP BY insurer_code, insurance_type_code, source_cg_filename
ORDER BY insurer_code, insurance_type_code;
