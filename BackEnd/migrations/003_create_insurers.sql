-- Migration 003: Création de la table master data des assureurs
-- Date: 2026-02-02
-- Description: Table normalisée des assureurs avec codes de référence

-- Création de la table insurers
CREATE TABLE IF NOT EXISTS insurers (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(150) NOT NULL,
  full_name VARCHAR(250),
  description TEXT,
  logo_url VARCHAR(500),
  website_url VARCHAR(250),
  phone VARCHAR(20),
  email VARCHAR(150),
  color VARCHAR(50),              -- Couleur de la marque (classe Tailwind ou hex)
  display_order INTEGER DEFAULT 999,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_insurers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insurers_updated_at
BEFORE UPDATE ON insurers
FOR EACH ROW
EXECUTE FUNCTION update_insurers_updated_at();

-- Insertion des principaux assureurs français
INSERT INTO insurers (code, label, full_name, description, display_order, is_active) VALUES
  ('CENTRAL_GENERALI', 'Générali Central', 'Générali France - Central Générali', 'Assureur historique, leader européen', 1, true),
  ('GENERALI', 'Générali', 'Générali France', 'Groupe Générali', 2, true),
  ('AXA', 'AXA', 'AXA France', 'Leader mondial de l''assurance', 3, true),
  ('ALLIANZ', 'Allianz', 'Allianz France', 'Groupe allemand, leader européen', 4, true),
  ('GROUPAMA', 'Groupama', 'Groupama', 'Groupe mutualiste français', 5, true),
  ('CREDIT_AGRICOLE', 'Crédit Agricole', 'Crédit Agricole Assurances', 'Bancassurance', 6, true),
  ('MACIF', 'MACIF', 'Mutuelle Assurance des Commerçants et Industriels de France', 'Mutuelle française', 7, true),
  ('MAIF', 'MAIF', 'Mutuelle Assurance des Instituteurs de France', 'Mutuelle française', 8, true),
  ('MAAF', 'MAAF', 'Mutuelle d''Assurance Artisanale de France', 'Membre du groupe Covéa', 9, true),
  ('GMF', 'GMF', 'Garantie Mutuelle des Fonctionnaires', 'Membre du groupe Covéa', 10, true),
  ('MMA', 'MMA', 'Mutuelles du Mans Assurances', 'Membre du groupe Covéa', 11, true),
  ('MATMUT', 'Matmut', 'Mutuelle Assurance des Travailleurs Mutualistes', 'Mutuelle française', 12, true),
  ('AVIVA', 'Aviva', 'Aviva France', 'Groupe britannique', 13, true),
  ('SWISS_LIFE', 'Swiss Life', 'Swiss Life France', 'Assurance vie et prévoyance', 14, true),
  ('CNP', 'CNP Assurances', 'Caisse Nationale de Prévoyance', 'Leader français assurance de personnes', 15, true),
  ('AG2R', 'AG2R La Mondiale', 'AG2R La Mondiale', 'Protection sociale', 16, true),
  ('MALAKOFF', 'Malakoff Humanis', 'Malakoff Humanis', 'Protection sociale et santé', 17, true),
  ('HARMONIE', 'Harmonie Mutuelle', 'Harmonie Mutuelle', 'Mutuelle santé', 18, true),
  ('MGEN', 'MGEN', 'Mutuelle Générale de l''Éducation Nationale', 'Mutuelle des enseignants', 19, true),
  ('APRIL', 'April', 'April Assurances', 'Courtage et assurance', 20, true),
  ('DIRECT_ASSURANCE', 'Direct Assurance', 'Direct Assurance', 'Assurance en ligne (groupe AXA)', 21, true),
  ('AMAGUIZ', 'Amaguiz', 'Amaguiz', 'Assurance en ligne (groupe Groupama)', 22, true),
  ('LUKO', 'Luko', 'Luko', 'Néo-assureur digital', 23, true),
  ('FRIDAY', 'Friday', 'Friday', 'Néo-assureur digital', 24, true),
  ('ACHEEL', 'Acheel', 'Acheel', 'Néo-assureur digital', 25, true),
  ('AUTRE', 'Autre', 'Autre assureur', 'Assureur non référencé', 999, true);

-- Index pour les recherches
CREATE INDEX idx_insurers_label ON insurers(label);
CREATE INDEX idx_insurers_active ON insurers(is_active);
CREATE INDEX idx_insurers_display_order ON insurers(display_order);

-- Commentaires
COMMENT ON TABLE insurers IS 'Table master data des assureurs avec codes normalisés';
COMMENT ON COLUMN insurers.code IS 'Code unique de l''assureur (PRIMARY KEY)';
COMMENT ON COLUMN insurers.label IS 'Nom commercial court';
COMMENT ON COLUMN insurers.full_name IS 'Raison sociale complète';
COMMENT ON COLUMN insurers.logo_url IS 'URL du logo de l''assureur';
COMMENT ON COLUMN insurers.display_order IS 'Ordre d''affichage dans les listes';
