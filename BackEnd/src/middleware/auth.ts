/**
 * Middleware d'authentification partagé
 * Source unique de vérité pour authMiddleware et adminMiddleware.
 * Utilisé par policies.ts, sinistre.ts, ai.ts, admin.ts, partner.ts.
 */

import jwt from 'jsonwebtoken';
import { query } from '../db';

// JWT_SECRET est garanti non-null par la vérification au démarrage dans index.ts
const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Vérifie la validité du token JWT (cookie httpOnly ou header Authorization).
 * Injecte req.user = { id, email, firstName, lastName, isAdmin, isPartner } en cas de succès.
 */
export function authMiddleware(req: any, res: any, next: any) {
  const cookieToken = req.cookies?.token;
  let bearerToken: string | undefined;
  const auth = req.headers.authorization;
  if (auth) {
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') bearerToken = parts[1];
  }
  const tokens = [cookieToken, bearerToken].filter(Boolean) as string[];
  if (!tokens.length) return res.status(401).json({ message: 'Non authentifié' });
  for (const token of tokens) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch { /* essayer le token suivant */ }
  }
  return res.status(401).json({ message: 'Token invalide' });
}

/**
 * Vérifie que l'utilisateur est administrateur.
 * Priorité 1 : champ isAdmin dans le payload JWT.
 * Priorité 2 : requête DB (compatibilité anciens tokens sans isAdmin).
 * Doit être utilisé après authMiddleware.
 */
export async function adminMiddleware(req: any, res: any, next: any) {
  if (req.user?.isAdmin === true) return next();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    const result = await query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (result.rows[0]?.is_admin === true) return next();
  } catch (err) {
    console.error('[adminMiddleware] DB check failed:', err);
  }
  return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
}
