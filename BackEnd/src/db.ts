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
  max: 20,                          // Nombre maximum de clients dans le pool
  idleTimeoutMillis: 300000,        // 5 min avant de fermer une connexion inactive (augmenté pour vectorisation longue)
  connectionTimeoutMillis: 10000,   // Timeout pour établir une connexion
  statement_timeout: 600000,        // 10 min max par requête (pour vectorisation longue)
  // 🔒 Connexion SSL/TLS pour chiffrer les communications avec PostgreSQL (RGPD + Cybersécu)
  ssl: process.env.NODE_ENV === 'production' || process.env.POSTGRES_SSL === 'true' 
    ? { rejectUnauthorized: false }  // En production Azure, accepter les certificats auto-signés
    : false                          // En développement local, pas de SSL
});

// Gestion des erreurs du pool
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue du pool PostgreSQL:', err);
  process.exit(-1);
});

// Test de connexion au démarrage
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Impossible de se connecter à PostgreSQL:', err.message);
    console.error('   Vérifiez les variables d\'environnement POSTGRES_*');
    return;
  }
  
  console.log('✅ Connexion PostgreSQL établie');
  console.log(`   📍 Base: ${process.env.POSTGRES_DB}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}`);
  
  release();
});

/**
 * Exécute une requête SQL avec des paramètres
 * @param text - Requête SQL (avec $1, $2, etc. pour les paramètres)
 * @param params - Tableau de valeurs pour les paramètres
 * @returns Promise avec le résultat de la requête
 */
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log pour le développement (à désactiver en production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 SQL:', { text, duration: `${duration}ms`, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('❌ Erreur SQL:', { text, error: (error as Error).message });
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
