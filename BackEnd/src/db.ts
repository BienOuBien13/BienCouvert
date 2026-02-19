import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

// -----------------------------------------------------------------------------
// Module de connexion PostgreSQL pour AssurClair
// Ce module configure et expose un pool de connexions PostgreSQL pour
// communiquer avec la base de données sur la VM Azure.
// -----------------------------------------------------------------------------

dotenv.config();

// Configuration du pool de connexions PostgreSQL
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'assurclair',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  max: 10,                          // Nombre maximum de clients dans le pool
  idleTimeoutMillis: 300000,        // 5 min avant de fermer une connexion inactive
  connectionTimeoutMillis: 15000,   // Timeout pour établir une connexion
  statement_timeout: 600000,        // 10 min max par requête (pour vectorisation longue)
  // 🔒 Connexion SSL/TLS pour chiffrer les communications avec PostgreSQL (RGPD + Cybersécu)
  ssl: process.env.NODE_ENV === 'production' || process.env.POSTGRES_SSL === 'true'
    ? { rejectUnauthorized: false }  // En production Azure, accepter les certificats auto-signés
    : false                          // En développement local, pas de SSL
});

// Gestion des erreurs du pool - NE PAS appeler process.exit() ici :
// une erreur de pool (connexion perdue, DB en recovery) est récupérable.
// Le backend doit continuer à tourner et re-tenter les connexions automatiquement.
pool.on('error', (err: Error & { code?: string }) => {
  if (err.code === '57P03') {
    // DB en mode recovery (redémarrage PostgreSQL) — transitoire, pas fatal
    console.warn('⚠️  PostgreSQL en mode recovery — nouvelle tentative dans quelques secondes...');
  } else {
    console.error('❌ Erreur inattendue du pool PostgreSQL:', err.message, 'code:', (err as any).code);
  }
  // Ne PAS faire process.exit(-1) — le pool se reconnecte automatiquement
});

// Test de connexion au démarrage (non bloquant)
function testConnection(retries = 5, delayMs = 3000): void {
  pool.connect((err, client, release) => {
    if (err) {
      console.error(`❌ Connexion PostgreSQL échouée (${err.message})`);
      if (retries > 0) {
        console.log(`   🔄 Nouvelle tentative dans ${delayMs / 1000}s... (${retries} restantes)`);
        setTimeout(() => testConnection(retries - 1, delayMs), delayMs);
      } else {
        console.error('   ⛔ Impossible de se connecter après plusieurs tentatives. Vérifiez PostgreSQL.');
      }
      return;
    }
    console.log('✅ Connexion PostgreSQL établie');
    console.log(`   📍 Base: ${process.env.POSTGRES_DB}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}`);
    release();
  });
}
testConnection();

// Codes d'erreur PostgreSQL transitoires (re-tentable)
const RETRYABLE_PG_CODES = new Set([
  '57P03', // cannot_connect_now (recovery mode)
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

/**
 * Exécute une requête SQL avec des paramètres et re-tentatives automatiques
 * sur les erreurs transitoires (recovery mode, connexion perdue, deadlock…)
 */
export async function query(text: string, params?: any[], retries = 3): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log pour le développement (à désactiver en production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 SQL:', { text, duration: `${duration}ms`, rows: res.rowCount });
    }

    return res;
  } catch (error: any) {
    const code: string | undefined = error?.code;
    const isRetryable = code ? RETRYABLE_PG_CODES.has(code) : error?.message?.includes('Connection terminated');
    if (isRetryable && retries > 0) {
      const wait = (4 - retries) * 2000; // 2s, 4s, 6s
      console.warn(`⚠️  Erreur DB transitoire (${code || error.message}) — re-tentative dans ${wait / 1000}s (${retries} restantes)`);
      await new Promise(r => setTimeout(r, wait));
      return query(text, params, retries - 1);
    }
    console.error('❌ Erreur SQL:', { text, error: error.message });
    throw error;
  }
}

/**
 * Récupère un client du pool pour exécuter plusieurs requêtes dans une transaction
 * @returns Promise avec un client PostgreSQL
 */
export async function getClient() {
  return await pool.connect();
}

/**
 * Ferme le pool de connexions (à appeler lors de l'arrêt du serveur)
 */
export async function closePool() {
  await pool.end();
  console.log('🔌 Pool PostgreSQL fermé');
}

export default pool;
