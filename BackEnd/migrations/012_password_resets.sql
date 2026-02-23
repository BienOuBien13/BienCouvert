-- Migration 012 : Table de réinitialisation de mot de passe
-- Remplace les JWT en URL (risque de fuite dans logs/historique) par des tokens opaques UUID
-- TTL 1h imposé côté application ; le job de nettoyage peut purger les expirés.

CREATE TABLE IF NOT EXISTS password_resets (
  token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(320) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email   ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);

-- Auto-purge optionnelle via pg_cron (si disponible) :
-- SELECT cron.schedule('purge-password-resets', '0 * * * *',
--   'DELETE FROM password_resets WHERE expires_at < NOW()');
