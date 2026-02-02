-- ============================================================================
-- TABLE MASTER DATA : Types d'assurances
-- ============================================================================
-- Cette table référence tous les types d'assurances possibles avec un code unique
-- Les codes sont utilisés partout dans l'application pour garantir la cohérence

CREATE TABLE IF NOT EXISTS insurance_types (
  code VARCHAR(20) PRIMARY KEY,
  label_fr VARCHAR(100) NOT NULL,
  label_en VARCHAR(100),
  description TEXT,
  icon VARCHAR(50),  -- Nom de l'icône Lucide React
  color VARCHAR(50),  -- Classe Tailwind ou code couleur
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_insurance_types_active ON insurance_types(is_active);
CREATE INDEX idx_insurance_types_order ON insurance_types(display_order);

-- Insertion des types standard
INSERT INTO insurance_types (code, label_fr, label_en, description, icon, color, display_order) VALUES
('AUTO', 'Automobile', 'Auto', 'Assurance automobile et deux-roues', 'Car', 'from-red-500 to-orange-500', 1),
('HABITATION', 'Habitation', 'Home', 'Assurance habitation, logement et résidence', 'Home', 'from-blue-500 to-cyan-500', 2),
('SANTE', 'Santé', 'Health', 'Mutuelle santé et complémentaire santé', 'Heart', 'from-pink-500 to-rose-500', 3),
('PREVOYANCE', 'Prévoyance', 'Provident', 'Prévoyance individuelle et collective', 'Shield', 'from-green-500 to-emerald-500', 4),
('PRO', 'Professionnelle', 'Professional', 'Assurance professionnelle (RC Pro, multirisque)', 'Briefcase', 'from-purple-500 to-indigo-500', 5),
('EMPRUNTEUR', 'Emprunteur', 'Borrower', 'Assurance emprunteur et crédit', 'CreditCard', 'from-amber-500 to-yellow-500', 6),
('BANCAIRE', 'Carte Bancaire', 'Banking', 'Assurances liées aux cartes bancaires', 'CreditCard', 'from-indigo-500 to-purple-500', 7),
('APPAREILS', 'Appareils Électroniques', 'Electronics', 'Assurance appareils et équipements électroniques', 'Smartphone', 'from-slate-500 to-slate-600', 8),
('JURIDIQUE', 'Protection Juridique', 'Legal', 'Protection et défense juridique', 'Scale', 'from-slate-600 to-slate-700', 9),
('VOYAGE', 'Voyage', 'Travel', 'Assurance voyage et assistance rapatriement', 'Package', 'from-cyan-500 to-blue-500', 10),
('ANIMAUX', 'Animaux', 'Pets', 'Assurance animaux de compagnie', 'Heart', 'from-orange-500 to-red-500', 11),
('VIE', 'Assurance Vie', 'Life', 'Assurance vie et épargne', 'Heart', 'from-purple-500 to-pink-500', 12),
('AUTRE', 'Autre', 'Other', 'Autre type d''assurance', 'Shield', 'from-slate-500 to-slate-600', 99)
ON CONFLICT (code) DO NOTHING;

-- Trigger pour mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_insurance_types_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_insurance_types_timestamp
BEFORE UPDATE ON insurance_types
FOR EACH ROW
EXECUTE FUNCTION update_insurance_types_timestamp();

-- Commentaires sur la table et colonnes
COMMENT ON TABLE insurance_types IS 'Table de référence des types d''assurances avec codes normalisés';
COMMENT ON COLUMN insurance_types.code IS 'Code unique du type (ex: AUTO, HABITATION)';
COMMENT ON COLUMN insurance_types.label_fr IS 'Libellé en français';
COMMENT ON COLUMN insurance_types.label_en IS 'Libellé en anglais';
COMMENT ON COLUMN insurance_types.icon IS 'Nom de l''icône Lucide React';
COMMENT ON COLUMN insurance_types.color IS 'Classe Tailwind pour les dégradés de couleur';
COMMENT ON COLUMN insurance_types.display_order IS 'Ordre d''affichage dans les listes';
