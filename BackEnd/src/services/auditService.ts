/**
 * Service d'audit et de logging pour AssurClair
 * Enregistre les actions sensibles pour la conformité RGPD et la cybersécurité
 */

import { query } from '../db';

export enum AuditAction {
  // Authentification
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  USER_PASSWORD_RESET = 'USER_PASSWORD_RESET',
  USER_FAILED_LOGIN = 'USER_FAILED_LOGIN',
  
  // Gestion du compte (RGPD)
  USER_ACCOUNT_DELETED = 'USER_ACCOUNT_DELETED',
  USER_DATA_ACCESSED = 'USER_DATA_ACCESSED',
  USER_DATA_MODIFIED = 'USER_DATA_MODIFIED',
  USER_CONSENT_CHANGED = 'USER_CONSENT_CHANGED',
  
  // Données sensibles
  POLICY_CREATED = 'POLICY_CREATED',
  POLICY_UPDATED = 'POLICY_UPDATED',
  POLICY_DELETED = 'POLICY_DELETED',
  POLICY_SHARED = 'POLICY_SHARED',
  
  // IA et analyse
  AI_ANALYSIS_REQUEST = 'AI_ANALYSIS_REQUEST',
  AI_CHAT_MESSAGE = 'AI_CHAT_MESSAGE',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  
  // Sécurité
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY'
}

export interface AuditLogEntry {
  action: AuditAction;
  userId?: number;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
  timestamp?: Date;
}

/**
 * Crée la table audit_logs si elle n'existe pas
 */
export async function initAuditTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(100) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      details JSONB,
      timestamp TIMESTAMP DEFAULT NOW()
    );
    
    -- Index pour améliorer les performances des recherches
    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `;
  
  try {
    await query(createTableQuery);
    console.log('✅ Table audit_logs initialisée');
  } catch (err) {
    console.error('❌ Erreur initialisation audit_logs:', err);
  }
}

/**
 * Enregistre une entrée dans le journal d'audit
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (action, user_id, user_email, ip_address, user_agent, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.action,
        entry.userId || null,
        entry.userEmail || null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.timestamp || new Date()
      ]
    );
  } catch (err) {
    // Ne pas faire échouer l'opération si le logging échoue
    console.error('❌ Erreur enregistrement audit:', err);
  }
}

/**
 * Récupère les logs d'audit pour un utilisateur
 */
export async function getUserAuditLogs(userId: number, limit: number = 100): Promise<any[]> {
  try {
    const result = await query(
      `SELECT * FROM audit_logs 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (err) {
    console.error('❌ Erreur récupération logs:', err);
    return [];
  }
}

/**
 * Récupère tous les logs d'audit (admin uniquement)
 */
export async function getAllAuditLogs(limit: number = 500, action?: AuditAction): Promise<any[]> {
  try {
    let queryText = `SELECT * FROM audit_logs`;
    const params: any[] = [];
    
    if (action) {
      queryText += ` WHERE action = $1`;
      params.push(action);
    }
    
    queryText += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await query(queryText, params);
    return result.rows;
  } catch (err) {
    console.error('❌ Erreur récupération logs admin:', err);
    return [];
  }
}

/**
 * Middleware Express pour capturer automatiquement l'IP et User-Agent
 */
export function getAuditContext(req: any): Partial<AuditLogEntry> {
  return {
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    userEmail: req.user?.email
  };
}
