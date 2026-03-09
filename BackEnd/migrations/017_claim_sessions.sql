-- ============================================================================
-- Migration 017 : Ajout de la table claim_sessions
-- Assistant Sinistre BienCouvert — Document-Driven Claim Assistant
-- ============================================================================

CREATE TABLE IF NOT EXISTS claim_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id    INTEGER REFERENCES policies(id) ON DELETE SET NULL,
  status       VARCHAR(30) NOT NULL DEFAULT 'qualification',
  -- possible values: qualification | analyzing | plan | letter | done
  claim_data   JSONB NOT NULL DEFAULT '{}',
  -- {type_assurance, evenement, date_incident, lieu, tiers, dommages[], urgence, details}
  analysis     JSONB,
  -- {isCovered, confidence, franchise, declarationDeadlineDays, declarationDeadlineDate,
  --  requiredDocs[], obligations[], reasoning, riskLevel}
  action_plan  JSONB,
  -- [{step, label, deadline, priority, done}]
  letter_content TEXT,
  title        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claim_sessions_user_id ON claim_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_claim_sessions_status  ON claim_sessions(status);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_claim_sessions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_claim_sessions_updated_at ON claim_sessions;
CREATE TRIGGER trg_claim_sessions_updated_at
  BEFORE UPDATE ON claim_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_claim_sessions_timestamp();
