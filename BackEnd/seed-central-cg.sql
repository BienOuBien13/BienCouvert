-- ============================================================================
-- Données de base pour central_cg (référentiel des CG)
-- ============================================================================
-- Contient des exemples de produits d'assurance avec leurs CG officielles
-- À adapter avec vos vrais URLs de CG
-- ============================================================================

-- Exemples de produits d'assurance habitation
INSERT INTO central_cg (insurer, product_name, version, document_url, metadata) VALUES
('Allianz', 'Habitation Essentielle', '2024', 
 'https://www.allianz.fr/content/dam/onemarketing/azfr/allianz-fr/documents/assurance-habitation/cg-habitation-essentielle.pdf',
 '{"type": "habitation", "validFrom": "2024-01-01", "coverage": ["incendie", "dégâts des eaux", "vol"]}'),

('AXA', 'Habitation Confort', '2024', 
 'https://www.axa.fr/content/dam/axa-fr/documents/conditions-generales/habitation-confort-cg.pdf',
 '{"type": "habitation", "validFrom": "2024-01-01", "coverage": ["incendie", "dégâts des eaux", "vol", "bris de glace"]}'),

('MAIF', 'Rythme Habitation', '2024', 
 'https://www.maif.fr/content/pdf/conditions-generales-habitation.pdf',
 '{"type": "habitation", "validFrom": "2024-01-01", "coverage": ["incendie", "dégâts des eaux", "vol", "catastrophe naturelle"]}');

-- Exemples de produits d'assurance auto
INSERT INTO central_cg (insurer, product_name, version, document_url, metadata) VALUES
('Allianz', 'Auto Tous Risques', '2024', 
 'https://www.allianz.fr/content/dam/onemarketing/azfr/allianz-fr/documents/assurance-auto/cg-auto-tous-risques.pdf',
 '{"type": "auto", "validFrom": "2024-01-01", "coverage": ["responsabilité civile", "tous dommages", "vol", "incendie"]}'),

('AXA', 'Auto Premium', '2024', 
 'https://www.axa.fr/content/dam/axa-fr/documents/conditions-generales/auto-premium-cg.pdf',
 '{"type": "auto", "validFrom": "2024-01-01", "coverage": ["responsabilité civile", "tous dommages", "assistance", "véhicule de remplacement"]}'),

('MAIF', 'Auto Protection Juridique', '2024', 
 'https://www.maif.fr/content/pdf/conditions-generales-auto.pdf',
 '{"type": "auto", "validFrom": "2024-01-01", "coverage": ["responsabilité civile", "protection juridique", "défense pénale"]}');

-- Exemples de produits d'assurance santé
INSERT INTO central_cg (insurer, product_name, version, document_url, metadata) VALUES
('Harmonie Mutuelle', 'Santé Modulaire', '2024', 
 'https://www.harmonie-mutuelle.fr/documents/cg-sante-modulaire.pdf',
 '{"type": "sante", "validFrom": "2024-01-01", "coverage": ["hospitalisation", "soins courants", "optique", "dentaire"]}'),

('MGEN', 'Santé Active', '2024', 
 'https://www.mgen.fr/documents/conditions-generales-sante-active.pdf',
 '{"type": "sante", "validFrom": "2024-01-01", "coverage": ["hospitalisation", "médecine douce", "prévention"]}');

-- ============================================================================
-- Exemple de liaison : associer une policy existante à un produit central
-- ============================================================================

-- Supposons que POL-1769196850479 est une assurance habitation AXA
-- 1. Récupérer l'ID du produit dans central_cg :
-- SELECT id FROM central_cg WHERE insurer = 'AXA' AND product_name = 'Habitation Confort';

-- 2. Lier la policy au produit (remplacer 2 par l'ID récupéré) :
-- UPDATE policies SET central_cg_id = 2 WHERE policy_number = 'POL-1769196850479';

-- Vérification du lien :
-- SELECT 
--     p.policy_number, 
--     p.insurer, 
--     p.type,
--     c.product_name,
--     c.version,
--     c.document_url as url_cg_officielle
-- FROM policies p
-- LEFT JOIN central_cg c ON p.central_cg_id = c.id
-- WHERE p.policy_number = 'POL-1769196850479';
