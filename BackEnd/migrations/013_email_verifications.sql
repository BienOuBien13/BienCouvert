-- Migration 013 : Table de vérification d'email à l'inscription
-- Permet de confirmer que l'email fourni est bien valide avant d'activer toutes les fonctionnalités.
-- Le compte reste utilisable mais un bandeau invite à vérifier jusqu'à confirmation.

CREATE TABLE IF NOT EXISTS email_verifications (
  token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(320) NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verif_email   ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verif_user_id ON email_verifications(user_id);

-- Ajouter la colonne email_verified sur users si elle n'existe pas encore
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
