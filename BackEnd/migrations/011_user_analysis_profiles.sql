-- =============================================================================
-- Migration 011 : Table user_analysis_profiles
-- Stocke les données de profilage détaillé de l'utilisateur (questionnaire AnalysisView)
-- séparément de la table users (qui ne garde que email/nom/mdp).
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_analysis_profiles (
  user_id         INTEGER     NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Foyer
  adults_count              INTEGER     DEFAULT 1,
  children_count            INTEGER     DEFAULT 0,
  household_members_ages    INTEGER[]   DEFAULT '{}',
  has_pets                  BOOLEAN     DEFAULT FALSE,
  pet_details               TEXT,

  -- Habitat
  postal_code               VARCHAR(10),
  housing_status            VARCHAR(20),   -- owner | tenant | landlord
  housing_type              VARCHAR(20),   -- apartment | house
  residence_type            VARCHAR(20),   -- principal | secondary
  housing_surface           INTEGER,
  construction_year         INTEGER,
  has_pool                  BOOLEAN     DEFAULT FALSE,
  has_garden                BOOLEAN     DEFAULT FALSE,

  -- Patrimoine & Finances
  reconstruction_value      INTEGER,
  high_tech_value           INTEGER,
  jewelry_value             INTEGER,
  vehicles_count            INTEGER     DEFAULT 0,
  monthly_income            INTEGER,

  -- Travail & Loisirs
  work_status               VARCHAR(30),   -- salarié | indépendant | fonctionnaire | sans-emploi | retraité
  profession                VARCHAR(100),
  telework_days             INTEGER     DEFAULT 0,
  risky_sports              TEXT[]      DEFAULT '{}',

  -- Santé
  health_needs              TEXT[]      DEFAULT '{}',
  health_specifics          TEXT,

  -- Historique sinistres
  claims_last_5_years       INTEGER     DEFAULT 0,
  risk_tolerance            INTEGER,

  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour accès rapide par user_id (déjà PK mais explicite)
CREATE INDEX IF NOT EXISTS idx_user_analysis_profiles_user ON user_analysis_profiles(user_id);

COMMENT ON TABLE user_analysis_profiles IS
  'Profil de profilage détaillé pour le questionnaire AnalysisView. Séparé de users pour ne pas mélanger données de compte et données de profiling.';
