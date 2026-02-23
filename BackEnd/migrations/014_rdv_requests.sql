-- Migration 014 : Table de persistance des demandes de RDV expert
-- Toutes les demandes sont stockées même en cas d'échec SMTP.
-- Permet l'audit, le suivi et le re-traitement manuel.

CREATE TABLE IF NOT EXISTS rdv_requests (
  id          SERIAL PRIMARY KEY,
  user_email  VARCHAR(320),                        -- Email de l'utilisateur (peut être null si non connecté)
  phone       VARCHAR(30) NOT NULL,
  day         VARCHAR(50) NOT NULL,                -- Ex: "Demain"
  slot        VARCHAR(50) NOT NULL,                -- Ex: "Après-midi"
  policies    TEXT[],                              -- Noms des contrats concernés
  email_sent  BOOLEAN NOT NULL DEFAULT FALSE,      -- True si email envoyé avec succès
  email_error TEXT,                                -- Détail de l'erreur SMTP si applicable
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdv_requests_email      ON rdv_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_rdv_requests_created_at ON rdv_requests(created_at);
