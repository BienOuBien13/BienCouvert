/**
 * Service d'initialisation des tables de la base de données
 * Exécute les migrations DDL (CREATE TABLE IF NOT EXISTS) au démarrage.
 * Chaque function est idempotente : elle ne fait rien si les tables existent déjà.
 */

import { query } from '../db';

/** Initialise la table password_resets (migration 012) */
export async function initPasswordResetsTable(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       VARCHAR(320) NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
        used        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_password_resets_email   ON password_resets(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at)`);
    console.log('✅ Table password_resets prête');
  } catch (err: any) {
    console.error('❌ initPasswordResetsTable:', err.message);
  }
}

/** Initialise la table email_verifications + colonne users.email_verified (migration 013) */
export async function initEmailVerificationsTable(): Promise<void> {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       VARCHAR(320) NOT NULL,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
        verified_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_email_verif_email   ON email_verifications(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_email_verif_user_id ON email_verifications(user_id)`);
    console.log('✅ Table email_verifications prête');
  } catch (err: any) {
    console.error('❌ initEmailVerificationsTable:', err.message);
  }
}

/** Initialise la table rdv_requests (migration 014) */
export async function initRdvRequestsTable(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS rdv_requests (
        id          SERIAL PRIMARY KEY,
        user_email  VARCHAR(320),
        phone       VARCHAR(30) NOT NULL,
        day         VARCHAR(50) NOT NULL,
        slot        VARCHAR(50) NOT NULL,
        policies    TEXT[],
        email_sent  BOOLEAN NOT NULL DEFAULT FALSE,
        email_error TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_rdv_requests_email      ON rdv_requests(user_email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_rdv_requests_created_at ON rdv_requests(created_at)`);
    console.log('✅ Table rdv_requests prête');
  } catch (err: any) {
    console.error('❌ initRdvRequestsTable:', err.message);
  }
}

/** Initialise les tables partenaire (migration 015) */
export async function initPartnerTables(): Promise<void> {
  try {
    // Colonne is_partner sur users
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_partner BOOLEAN NOT NULL DEFAULT FALSE`);

    // Table partner_assignments : un partenaire prend en charge un dossier RDV
    await query(`
      CREATE TABLE IF NOT EXISTS partner_assignments (
        id            SERIAL PRIMARY KEY,
        partner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rdv_id        INTEGER NOT NULL UNIQUE REFERENCES rdv_requests(id) ON DELETE CASCADE,
        client_email  VARCHAR(320),
        assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status        VARCHAR(50)  NOT NULL DEFAULT 'assigned',
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_partner_assignments_partner ON partner_assignments(partner_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_partner_assignments_rdv     ON partner_assignments(rdv_id)`);
    console.log('✅ Tables partenaire prêtes');
  } catch (err: any) {
    console.error('❌ initPartnerTables:', err.message);
  }
}

/** Purge automatique des tokens expirés (à appeler périodiquement) */
export async function purgeExpiredTokens(): Promise<void> {
  try {
    const pr = await query(`DELETE FROM password_resets WHERE expires_at < NOW() RETURNING token`);
    const ev = await query(`DELETE FROM email_verifications WHERE expires_at < NOW() AND verified_at IS NULL RETURNING token`);
    if (pr.rowCount! + ev.rowCount! > 0) {
      console.log(`🧹 Purgé: ${pr.rowCount} reset tokens, ${ev.rowCount} email tokens`);
    }
  } catch (err: any) {
    console.warn('⚠️  purgeExpiredTokens:', err.message);
  }
}
