/**
 * Routes Admin — /api/admin
 * Réservées aux utilisateurs avec is_admin = TRUE
 *
 * POST /api/admin/control-check          — lance un run de non-régression
 * GET  /api/admin/control-check/rows     — liste toutes les lignes de référence (+ dernier résultat)
 * GET  /api/admin/control-check/summary  — résumé agrégé par (assureur, type, fichier)
 */

import { Router } from 'express';
import pool from '../db';
import { runControlCheck } from '../services/controlCheckService';
import { query } from '../db';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { getTokenStats, resetTokenStats } from '../utils/geminiMetrics';

const router = Router();

// authMiddleware et adminMiddleware sont importés depuis le module partagé ../middleware/auth

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

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/token-stats   — métriques de tokens Gemini (admin only)
// POST /api/admin/token-stats/reset — remise à zéro des compteurs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/token-stats', authMiddleware, adminMiddleware, (_req, res) => {
  res.json(getTokenStats());
});

router.post('/token-stats/reset', authMiddleware, adminMiddleware, (_req, res) => {
  resetTokenStats();
  res.json({ ok: true, message: 'Compteurs remis à zéro' });
});

export default router;
