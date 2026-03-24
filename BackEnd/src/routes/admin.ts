/**
 * Routes Admin — /api/admin
 * Réservées aux utilisateurs avec is_admin = TRUE
 *
 * POST /api/admin/control-check          — lance un run de non-régression
 * GET  /api/admin/control-check/rows     — liste toutes les lignes de référence (+ dernier résultat)
 * GET  /api/admin/control-check/summary  — résumé agrégé par (assureur, type, fichier)
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { runControlCheck } from '../services/controlCheckService';
import { query } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// ─── Middlewares ──────────────────────────────────────────────────────────────

function authMiddleware(req: any, res: any, next: any) {
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
    try { req.user = jwt.verify(token, JWT_SECRET); return next(); } catch {}
  }
  return res.status(401).json({ message: 'Token invalide' });
}

/**
 * Vérifie que l'utilisateur est admin.
 * Priorité 1 : champ isAdmin dans le payload JWT (tokens émis après le fix).
 * Priorité 2 : requête DB sur is_admin (tokens anciens sans isAdmin dans le payload).
 */
async function adminMiddleware(req: any, res: any, next: any) {
  // Cas 1 : le token contient déjà isAdmin = true
  if (req.user?.isAdmin === true) return next();

  // Cas 2 : ancien token sans isAdmin → vérifier en DB
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/control-check
// Lance un run de non-régression.
// Body (optionnel) : { insurer_code?, insurance_type_code?, source_cg_filename? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/control-check', authMiddleware, adminMiddleware, async (req: any, res) => {
  const { insurer_code, insurance_type_code, source_cg_filename } = req.body || {};
  try {
    const filters: Record<string, string> = {};
    if (insurer_code)        filters.insurer_code        = String(insurer_code).trim();
    if (insurance_type_code) filters.insurance_type_code = String(insurance_type_code).trim();
    if (source_cg_filename)  filters.source_cg_filename  = String(source_cg_filename).trim();

    const report = await runControlCheck(pool, filters);
    res.json(report);
  } catch (err: any) {
    console.error('[admin/control-check]', err.message);
    res.status(500).json({ message: 'Erreur lors du contrôle de non-régression', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/control-check/rows
// Retourne toutes les lignes de référence avec leur dernier résultat de check.
// Filtres query params : insurer_code, insurance_type_code, source_cg_filename, result
// ─────────────────────────────────────────────────────────────────────────────
router.get('/control-check/rows', authMiddleware, adminMiddleware, async (req: any, res) => {
  const { insurer_code, insurance_type_code, source_cg_filename, result } = req.query;
  try {
    const conditions: string[] = [];
    const params: string[] = [];

    if (insurer_code) {
      params.push(String(insurer_code));
      conditions.push(`insurer_code = $${params.length}`);
    }
    if (insurance_type_code) {
      params.push(String(insurance_type_code));
      conditions.push(`insurance_type_code = $${params.length}`);
    }
    if (source_cg_filename) {
      params.push(String(source_cg_filename));
      conditions.push(`source_cg_filename = $${params.length}`);
    }
    if (result) {
      params.push(String(result));
      conditions.push(`last_check_result = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(
      `SELECT
         id, insurer_code, insurance_type_code,
         formula_key, formula_label, guarantee_key, guarantee_label,
         expected_status, expected_amount_pattern, optional_match,
         source_doc_hint, source_cg_filename, notes,
         last_check_at, last_check_result,
         last_actual_status, last_actual_amount, last_check_error
       FROM coverage_facts_control
       ${where}
       ORDER BY insurer_code, insurance_type_code, formula_key, guarantee_key`,
      params
    );
    res.json(rows.rows);
  } catch (err: any) {
    console.error('[admin/control-check/rows]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des lignes', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/control-check/summary
// Résumé agrégé par (insurer_code, insurance_type_code, source_cg_filename)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/control-check/summary', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const rows = await query(`
      SELECT
        insurer_code,
        insurance_type_code,
        source_cg_filename,
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE last_check_result = 'passed')  AS passed,
        COUNT(*) FILTER (WHERE last_check_result = 'failed')  AS failed,
        COUNT(*) FILTER (WHERE last_check_result = 'not_found') AS not_found,
        COUNT(*) FILTER (WHERE last_check_result IS NULL)    AS never_run,
        MAX(last_check_at)                                    AS last_run_at
      FROM coverage_facts_control
      GROUP BY insurer_code, insurance_type_code, source_cg_filename
      ORDER BY insurer_code, insurance_type_code, source_cg_filename
    `);
    res.json(rows.rows);
  } catch (err: any) {
    console.error('[admin/control-check/summary]', err.message);
    res.status(500).json({ message: 'Erreur lors du résumé', error: err.message });
  }
});

export default router;
