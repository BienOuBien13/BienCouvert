/**
 * Routes Admin — /api/admin
 * Réservées aux utilisateurs avec is_admin = TRUE
 *
 * POST /api/admin/control-check          — lance un run de non-régression
 * GET  /api/admin/control-check/rows     — liste toutes les lignes de référence (+ dernier résultat)
 * GET  /api/admin/control-check/summary  — résumé agrégé par (assureur, type, fichier)
 *
 * POST /api/admin/cg-ingestion/run       — lance le pipeline agentique d'ingestion
 * POST /api/admin/cg-ingestion/stop      — arrête le pipeline en cours
 * GET  /api/admin/cg-ingestion/status    — état du pipeline en cours
 * GET  /api/admin/cg-ingestion/history   — historique des runs
 * GET  /api/admin/cg-ingestion/scope     — assureurs + types disponibles pour configurer le périmètre
 * PUT  /api/admin/cg-ingestion/insurer-patterns — met à jour cg_search_patterns d'un assureur
 *
 * GET  /api/admin/catalogue/matrix       — matrice complète du catalogue documentaire
 * GET  /api/admin/catalogue/stats        — statistiques de couverture
 * POST /api/admin/catalogue/sync         — synchroniser la matrice (nouvelles combinaisons)
 * POST /api/admin/catalogue/discover     — lancer la découverte de documents
 * POST /api/admin/catalogue/check        — vérifier les documents indexés
 * POST /api/admin/catalogue/ingest/:id   — lancer l'ingestion d'une entrée découverte
 * GET  /api/admin/catalogue/entry/:id    — détail d'une entrée catalogue
 */

import { Router } from 'express';
import pool from '../db';
import { runControlCheck } from '../services/controlCheckService';
import { query } from '../db';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { getTokenStats, resetTokenStats } from '../utils/geminiMetrics';
import {
  runIngestion,
  requestStopIngestion,
  getCurrentRunId,
  type IngestionScope,
} from '../services/cgIngestionService';
import {
  getMatrix,
  syncMatrix,
  getEntry,
  updateEntryStatus,
} from '../catalogue/CatalogueAgent';
import {
  discoverBatch,
  discoverForEntry,
  checkBatch,
} from '../catalogue/VersionTrackerAgent';
import {
  startWatchdog,
  stopWatchdog,
  isWatchdogRunning,
} from '../catalogue/WatchdogScheduler';
import type { MatrixStatus } from '../catalogue/types';

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/dashboard-stats
// Statistiques agrégées pour le dashboard de monitoring
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard-stats', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM users)                                                                          AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days')                           AS new_users_week,
        (SELECT COUNT(*) FROM audit_logs WHERE action = 'USER_LOGIN' AND timestamp >= CURRENT_DATE)          AS logins_today,
        (SELECT COUNT(*) FROM audit_logs WHERE action = 'USER_FAILED_LOGIN' AND timestamp >= CURRENT_DATE)   AS failed_logins_today,
        (SELECT COUNT(*) FROM audit_logs WHERE action = 'USER_LOGIN' AND timestamp >= NOW() - INTERVAL '7 days') AS logins_week,
        (SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE action = 'USER_LOGIN' AND timestamp >= NOW() - INTERVAL '30 days') AS active_users_month
    `);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[admin/dashboard-stats]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users
// Liste tous les utilisateurs avec leur nombre de contrats et dernière connexion
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const result = await query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.is_admin,
        u.is_partner,
        u.created_at,
        COUNT(DISTINCT p.id)::int                                                AS policy_count,
        MAX(al.timestamp)                                                        AS last_login
      FROM users u
      LEFT JOIN policies p  ON p.user_id = u.id
      LEFT JOIN audit_logs al ON al.user_id = u.id AND al.action = 'USER_LOGIN'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[admin/users]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/connection-logs?limit=100
// Derniers événements de connexion (login, logout, échec, inscription)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/connection-logs', authMiddleware, adminMiddleware, async (req: any, res) => {
  const rawLimit = parseInt(String(req.query.limit || '100'), 10);
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);
  try {
    const result = await query(
      `SELECT
         al.id,
         al.action,
         al.user_id,
         al.user_email,
         al.ip_address,
         al.timestamp,
         al.details,
         u.first_name,
         u.last_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.action IN ('USER_LOGIN', 'USER_LOGOUT', 'USER_FAILED_LOGIN', 'USER_REGISTER')
       ORDER BY al.timestamp DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[admin/connection-logs]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des logs', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/cg-ingestion/scope
// Retourne les assureurs (avec leurs patterns) et les types d'assurance disponibles
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cg-ingestion/scope', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const [insurers, types] = await Promise.all([
      query(`SELECT code, label, full_name as "fullName", website_url as "websiteUrl",
                    cg_search_enabled as "cgSearchEnabled",
                    cg_search_patterns as "cgSearchPatterns"
             FROM insurers WHERE is_active = true ORDER BY display_order`),
      query(`SELECT code, label_fr as "labelFr" FROM insurance_types WHERE is_active = true ORDER BY display_order`),
    ]);
    res.json({ insurers: insurers.rows, insurance_types: types.rows });
  } catch (err: any) {
    console.error('[admin/cg-ingestion/scope]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération du périmètre', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/cg-ingestion/insurer-patterns
// Met à jour cg_search_enabled et cg_search_patterns pour un assureur
// Body: { insurer_code, cg_search_enabled, cg_search_patterns }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/cg-ingestion/insurer-patterns', authMiddleware, adminMiddleware, async (req: any, res) => {
  const { insurer_code, cg_search_enabled, cg_search_patterns } = req.body || {};
  if (!insurer_code) return res.status(400).json({ message: 'insurer_code requis' });
  try {
    await query(
      `UPDATE insurers
       SET cg_search_enabled  = $1,
           cg_search_patterns = $2
       WHERE code = $3`,
      [
        Boolean(cg_search_enabled),
        cg_search_patterns ? JSON.stringify(cg_search_patterns) : '{}',
        String(insurer_code).trim(),
      ]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[admin/cg-ingestion/insurer-patterns]', err.message);
    res.status(500).json({ message: 'Erreur mise à jour patterns', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/cg-ingestion/run
// Lance le pipeline agentique. Exécuté en arrière-plan (fire-and-forget).
// Body: { scope?, insurers?, insurance_types?, max_docs_per_combo?, confidence_threshold? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cg-ingestion/run', authMiddleware, adminMiddleware, async (req: any, res) => {
  if (getCurrentRunId()) {
    return res.status(409).json({
      message: 'Un pipeline est déjà en cours',
      run_id: getCurrentRunId(),
    });
  }
  const scopeInput: IngestionScope = {
    scope:               req.body?.scope               ?? 'targeted',
    insurers:            req.body?.insurers             ?? [],
    insurance_types:     req.body?.insurance_types      ?? [],
    max_docs_per_combo:  Number(req.body?.max_docs_per_combo  ?? 2),
    confidence_threshold: Number(req.body?.confidence_threshold ?? 0.70),
  };
  // Validation minimale
  if (scopeInput.scope === 'targeted' && (!scopeInput.insurers?.length || !scopeInput.insurance_types?.length)) {
    return res.status(400).json({ message: 'En mode "targeted", insurers[] et insurance_types[] sont requis' });
  }
  // Fire-and-forget : on répond immédiatement
  res.json({ ok: true, message: 'Pipeline démarré en arrière-plan' });
  runIngestion(scopeInput).catch(e => console.error('[cg-ingestion/run] Erreur critique:', e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/cg-ingestion/stop
// Demande l'arrêt graceful du pipeline en cours
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cg-ingestion/stop', authMiddleware, adminMiddleware, (_req: any, res) => {
  const runId = getCurrentRunId();
  if (!runId) return res.json({ ok: false, message: 'Aucun pipeline en cours' });
  requestStopIngestion();
  res.json({ ok: true, message: 'Arrêt demandé — le pipeline s\'arrêtera après le document en cours' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/cg-ingestion/status
// Retourne l'état du pipeline en cours (ou le dernier run_id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cg-ingestion/status', authMiddleware, adminMiddleware, async (_req: any, res) => {
  const runId = getCurrentRunId();
  if (!runId) return res.json({ running: false });
  try {
    const rows = await query(
      `SELECT status, COUNT(*)::int AS count
       FROM cg_ingestion_jobs WHERE run_id = $1
       GROUP BY status`,
      [runId]
    );
    res.json({ running: true, run_id: runId, counts: rows.rows });
  } catch (err: any) {
    res.status(500).json({ message: 'Erreur status', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/cg-ingestion/history?limit=50
// Retourne l'historique des runs (groupés par run_id + stats)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cg-ingestion/history', authMiddleware, adminMiddleware, async (req: any, res) => {
  const rawLimit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
  try {
    const runs = await query(
      `SELECT
         run_id,
         MIN(created_at)                                                   AS started_at,
         MAX(updated_at)                                                   AS last_updated,
         COUNT(*)::int                                                     AS total,
         COUNT(*) FILTER (WHERE status = 'done')::int                     AS done,
         COUNT(*) FILTER (WHERE status = 'skipped')::int                  AS skipped,
         COUNT(*) FILTER (WHERE status = 'error')::int                    AS errors,
         COUNT(*) FILTER (WHERE status IN ('pending','fetching','classifying','vectorizing'))::int AS in_progress,
         ARRAY_AGG(DISTINCT insurer_code)                                  AS insurers,
         ARRAY_AGG(DISTINCT insurance_type_code)                           AS types
       FROM cg_ingestion_jobs
       GROUP BY run_id
       ORDER BY MIN(created_at) DESC
       LIMIT $1`,
      [rawLimit]
    );
    res.json(runs.rows);
  } catch (err: any) {
    console.error('[admin/cg-ingestion/history]', err.message);
    res.status(500).json({ message: 'Erreur historique', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/cg-ingestion/jobs/:run_id
// Détail de tous les jobs d'un run
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cg-ingestion/jobs/:run_id', authMiddleware, adminMiddleware, async (req: any, res) => {
  const { run_id } = req.params;
  if (!run_id || !/^[0-9a-f-]{36}$/i.test(run_id)) {
    return res.status(400).json({ message: 'run_id invalide' });
  }
  try {
    const jobs = await query(
      `SELECT id, insurer_code, insurance_type_code, source_url, status,
              confidence, error_message, central_cg_id, pdf_sha256, pages_count,
              created_at, updated_at
       FROM cg_ingestion_jobs WHERE run_id = $1 ORDER BY created_at`,
      [run_id]
    );
    res.json(jobs.rows);
  } catch (err: any) {
    res.status(500).json({ message: 'Erreur jobs', error: err.message });
  }
});

// =============================================================================
// CATALOGUE DOCUMENTAIRE
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/catalogue/matrix
// Matrice complète du catalogue documentaire avec labels et statistiques.
// Query params : insurer_code, insurance_type_code, matrix_status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/catalogue/matrix', authMiddleware, adminMiddleware, async (req: any, res) => {
  try {
    const filters: { insurer_code?: string; insurance_type_code?: string; matrix_status?: MatrixStatus } = {};
    if (req.query.insurer_code)        filters.insurer_code = String(req.query.insurer_code);
    if (req.query.insurance_type_code) filters.insurance_type_code = String(req.query.insurance_type_code);
    if (req.query.matrix_status)       filters.matrix_status = String(req.query.matrix_status) as MatrixStatus;
    const result = await getMatrix(filters);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/catalogue/matrix]', err.message);
    res.status(500).json({ message: 'Erreur récupération matrice', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/catalogue/stats
// Statistiques de couverture du catalogue
// ─────────────────────────────────────────────────────────────────────────────
router.get('/catalogue/stats', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const result = await getMatrix();
    res.json(result.stats);
  } catch (err: any) {
    console.error('[admin/catalogue/stats]', err.message);
    res.status(500).json({ message: 'Erreur stats catalogue', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/catalogue/entry/:id
// Détail d'une entrée catalogue
// ─────────────────────────────────────────────────────────────────────────────
router.get('/catalogue/entry/:id', authMiddleware, adminMiddleware, async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
  try {
    const entry = await getEntry(id);
    if (!entry) return res.status(404).json({ message: 'Entrée non trouvée' });
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ message: 'Erreur', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/catalogue/sync
// Synchronise la matrice (ajoute les nouvelles combinaisons assureur×type)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/catalogue/sync', authMiddleware, adminMiddleware, async (_req: any, res) => {
  try {
    const inserted = await syncMatrix();
    res.json({ ok: true, inserted });
  } catch (err: any) {
    console.error('[admin/catalogue/sync]', err.message);
    res.status(500).json({ message: 'Erreur sync matrice', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/catalogue/discover
// Lance la découverte de documents pour les entrées unknown/missing
// Body: { limit? } — par défaut 20
// ─────────────────────────────────────────────────────────────────────────────
router.post('/catalogue/discover', authMiddleware, adminMiddleware, async (req: any, res) => {
  const limit = Math.min(parseInt(String(req.body?.limit ?? 20), 10) || 20, 50);
  res.json({ ok: true, message: `Découverte lancée (max ${limit} entrées)` });
  discoverBatch(limit).catch(e => console.error('[catalogue/discover]', e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/catalogue/check
// Vérifie les documents indexés dont next_check_at est dépassé
// Body: { limit? } — par défaut 20
// ─────────────────────────────────────────────────────────────────────────────
router.post('/catalogue/check', authMiddleware, adminMiddleware, async (req: any, res) => {
  const limit = Math.min(parseInt(String(req.body?.limit ?? 20), 10) || 20, 50);
  res.json({ ok: true, message: `Vérification lancée (max ${limit} entrées)` });
  checkBatch(limit).catch(e => console.error('[catalogue/check]', e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/catalogue/ingest/:id
// Lance l'ingestion d'une entrée catalogue spécifique (discovered → indexed)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/catalogue/ingest/:id', authMiddleware, adminMiddleware, async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });

  try {
    const entry = await getEntry(id);
    if (!entry) return res.status(404).json({ message: 'Entrée non trouvée' });

    // Déterminer l'URL à ingérer
    const url = entry.discovered_url || entry.current_url;
    if (!url) return res.status(400).json({ message: 'Pas d\'URL disponible pour cette entrée' });

    // Lancer l'ingestion via le pipeline existant (fire-and-forget)
    if (getCurrentRunId()) {
      return res.status(409).json({ message: 'Un pipeline d\'ingestion est déjà en cours' });
    }

    const scope: IngestionScope = {
      scope: 'targeted',
      insurers: [entry.insurer_code],
      insurance_types: [entry.insurance_type_code],
      max_docs_per_combo: 1,
      confidence_threshold: 0.5,
    };

    res.json({ ok: true, message: `Ingestion lancée pour ${entry.insurer_code}/${entry.insurance_type_code}` });
    runIngestion(scope).catch(e => console.error('[catalogue/ingest]', e.message));
  } catch (err: any) {
    res.status(500).json({ message: 'Erreur ingestion', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/catalogue/watchdog       — état du watchdog
// POST /api/admin/catalogue/watchdog/start — démarrer la veille automatique
// POST /api/admin/catalogue/watchdog/stop  — arrêter la veille automatique
// ─────────────────────────────────────────────────────────────────────────────
router.get('/catalogue/watchdog', authMiddleware, adminMiddleware, (_req: any, res) => {
  res.json({ running: isWatchdogRunning() });
});

router.post('/catalogue/watchdog/start', authMiddleware, adminMiddleware, async (_req: any, res) => {
  if (isWatchdogRunning()) return res.json({ ok: false, message: 'Watchdog déjà actif' });
  try {
    await startWatchdog();
    res.json({ ok: true, message: 'Veille automatique démarrée (check 6h, discovery 12h)' });
  } catch (err: any) {
    res.status(500).json({ message: 'Erreur démarrage watchdog', error: err.message });
  }
});

router.post('/catalogue/watchdog/stop', authMiddleware, adminMiddleware, (_req: any, res) => {
  stopWatchdog();
  res.json({ ok: true, message: 'Veille automatique arrêtée' });
});

export default router;
