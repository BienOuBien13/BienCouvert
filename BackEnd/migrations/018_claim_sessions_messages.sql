-- ============================================================================
-- Migration 018 — Ajout historique de chat dans claim_sessions
-- Ajoute une colonne messages (JSONB) pour stocker la conversation IA
-- par session sinistre
-- ============================================================================
ALTER TABLE claim_sessions
  ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]';

-- Index pour recherche rapide si besoin futur
COMMENT ON COLUMN claim_sessions.messages IS
  'Tableau de messages [{role: user|assistant, content: string, ts: string}]';
