-- Migration 019: Élargit les colonnes guarantee_label / formula_label / guarantee_key / formula_key
-- en TEXT pour supporter les libellés longs issus des PDFs santé (ex: libellés CPAM détaillés).
-- Problème rencontré: "value too long for type character varying(150)" sur user_coverage_facts.
-- Ajoute aussi coverage_amount sur user_coverage_facts (existait déjà sur coverage_facts).

-- Table centralisée -----------------------------------------------------------
ALTER TABLE coverage_facts
  ALTER COLUMN guarantee_key   TYPE TEXT,
  ALTER COLUMN guarantee_label TYPE TEXT,
  ALTER COLUMN formula_key     TYPE TEXT,
  ALTER COLUMN formula_label   TYPE TEXT;

-- Table utilisateur -----------------------------------------------------------
ALTER TABLE user_coverage_facts
  ALTER COLUMN guarantee_key   TYPE TEXT,
  ALTER COLUMN guarantee_label TYPE TEXT,
  ALTER COLUMN formula_key     TYPE TEXT,
  ALTER COLUMN formula_label   TYPE TEXT;

-- Ajout de coverage_amount si absent (peut déjà exister sur certaines instances) -----
ALTER TABLE user_coverage_facts
  ADD COLUMN IF NOT EXISTS coverage_amount TEXT;
