/**
 * Service de cache Redis (ioredis) pour AssurClair
 * Cache les réponses IA/RAG coûteuses avec un TTL configurable.
 * Fallback gracieux si Redis est indisponible (pas de cache, pas d'erreur).
 *
 * Variables d'environnement :
 *   REDIS_URL   — ex: redis://localhost:6379 (défaut si non défini)
 *   CACHE_TTL   — TTL en secondes (défaut: 1800 = 30 min)
 */

import Redis from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '1800', 10); // 30 min

let redis: Redis | null = null;
let _redisDisabledUntil = 0; // timestamp : ne pas réessayer avant cette date

function getRedis(): Redis | null {
  if (Date.now() < _redisDisabledUntil) return null; // cooldown actif
  if (redis) return redis;
  try {
    redis = new Redis(REDIS_URL, {
      enableOfflineQueue: false,   // Évite l'accumulation en mémoire si Redis est down
      lazyConnect: true,
      maxRetriesPerRequest: 1,     // Ne pas bloquer longtemps si Redis répond pas
    });
    redis.on('connect', () => console.log('✅ Redis connecté —', REDIS_URL));
    redis.on('error', (err) => {
      if (Date.now() >= _redisDisabledUntil) {
        // Premier échec : log + cooldown 5 min
        console.warn(`⚠️  Redis indisponible (cache désactivé 5 min): ${err.message}`);
        _redisDisabledUntil = Date.now() + 5 * 60 * 1000;
      }
      redis = null; // Reset connexion
    });
    return redis;
  } catch {
    return null;
  }
}

/** Génère une clé de cache déterministe depuis les paramètres */
export function makeCacheKey(prefix: string, ...parts: string[]): string {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  return `assurclair:${prefix}:${hash}`;
}

/** Tente de lire une entrée depuis le cache */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err: any) {
    console.warn('⚠️  cacheGet erreur:', err.message);
    return null;
  }
}

/** Stocke une entrée dans le cache avec TTL */
export async function cacheSet(key: string, value: unknown, ttl = CACHE_TTL): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.setex(key, ttl, JSON.stringify(value));
  } catch (err: any) {
    console.warn('⚠️  cacheSet erreur:', err.message);
  }
}

/** Invalide une clé (ex: après modification d'une policy) */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch { /* silencieux */ }
}

/** Invalide toutes les clés d'un pattern (ex: pour un userId) */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`🗑️  Cache invalidé: ${keys.length} clé(s) — pattern: ${pattern}`);
    }
  } catch (err: any) {
    console.warn('⚠️  cacheDelPattern erreur:', err.message);
  }
}
