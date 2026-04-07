/**
 * CatalogueAgent — Construction et interrogation de la matrice documentaire
 *
 * Responsabilités :
 *   - Construire la matrice complète (assureur × type × doc_type)
 *   - Synchroniser les nouvelles combinaisons (ajout d'assureur / type)
 *   - Fournir les statistiques de couverture
 *   - Identifier les cellules manquantes ou à vérifier
 */

import pool from '../db';
import type { MatrixResult, MatrixCell, MatrixStats, MatrixStatus, CatalogueEntry } from './types';

// ─── Construction de la matrice ───────────────────────────────────────────────

/**
 * Retourne la matrice complète avec labels et statistiques.
 * Filtres optionnels sur assureur et type.
 */
export async function getMatrix(filters?: {
  insurer_code?: string;
  insurance_type_code?: string;
  matrix_status?: MatrixStatus;
}): Promise<MatrixResult> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.insurer_code) {
    params.push(filters.insurer_code);
    conditions.push(`dc.insurer_code = $${idx++}`);
  }
  if (filters?.insurance_type_code) {
    params.push(filters.insurance_type_code);
    conditions.push(`dc.insurance_type_code = $${idx++}`);
  }
  if (filters?.matrix_status) {
    params.push(filters.matrix_status);
    conditions.push(`dc.matrix_status = $${idx++}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const cellsQuery = await pool.query<MatrixCell>(
    `SELECT
       dc.id,
       dc.insurer_code,
       COALESCE(i.label, dc.insurer_code) AS insurer_label,
       dc.insurance_type_code,
       COALESCE(t.label_fr, dc.insurance_type_code) AS insurance_type_label,
       dc.doc_type,
       dc.matrix_status,
       dc.central_cg_id,
       dc.current_url,
       dc.indexed_at,
       dc.last_checked_at
     FROM document_catalogue dc
     LEFT JOIN insurers i ON i.code = dc.insurer_code
     LEFT JOIN insurance_types t ON t.code = dc.insurance_type_code
     ${where}
     ORDER BY i.display_order, t.display_order, dc.doc_type`,
    params
  );

  const cells = cellsQuery.rows;

  // Statistiques (même alias dc pour que WHERE s'applique correctement)
  const statsQuery = await pool.query<{ matrix_status: string; count: string }>(
    `SELECT matrix_status, COUNT(*)::int AS count FROM document_catalogue dc ${where} GROUP BY matrix_status`,
    params
  );
  const countsMap: Record<string, number> = {};
  for (const row of statsQuery.rows) {
    countsMap[row.matrix_status] = Number(row.count);
  }
  const total = Object.values(countsMap).reduce((s, v) => s + v, 0);
  const stats: MatrixStats = {
    total,
    indexed: countsMap['indexed'] ?? 0,
    missing: countsMap['missing'] ?? 0,
    outdated: countsMap['outdated'] ?? 0,
    discovered: countsMap['discovered'] ?? 0,
    error: countsMap['error'] ?? 0,
    unknown: countsMap['unknown'] ?? 0,
    coverage_percent: total > 0 ? Math.round(((countsMap['indexed'] ?? 0) / total) * 100) : 0,
  };

  // Référentiels
  const [insurerRows, typeRows] = await Promise.all([
    pool.query(`SELECT code, label FROM insurers WHERE is_active = true ORDER BY display_order`),
    pool.query(`SELECT code, label_fr AS label FROM insurance_types WHERE is_active = true ORDER BY display_order`),
  ]);

  return {
    cells,
    stats,
    insurers: insurerRows.rows,
    insurance_types: typeRows.rows,
  };
}

// ─── Synchronisation de la matrice ────────────────────────────────────────────

/**
 * Ajoute les combinaisons manquantes dans document_catalogue
 * (par ex. après ajout d'un nouvel assureur ou type).
 * Retourne le nombre de lignes insérées.
 */
export async function syncMatrix(): Promise<number> {
  const result = await pool.query<{ count: string }>(`
    WITH inserted AS (
      INSERT INTO document_catalogue (insurer_code, insurance_type_code, doc_type, matrix_status)
      SELECT i.code, t.code, 'CG', 'unknown'
      FROM insurers i
      CROSS JOIN insurance_types t
      WHERE i.is_active = true AND t.is_active = true
      ON CONFLICT (insurer_code, insurance_type_code, doc_type) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM inserted
  `);
  const inserted = Number(result.rows[0]?.count ?? 0);
  if (inserted > 0) {
    console.log(`[CatalogueAgent] Sync matrice : ${inserted} nouvelles combinaisons ajoutées`);
  }
  return inserted;
}

// ─── Récupération d'une entrée ────────────────────────────────────────────────

export async function getEntry(id: number): Promise<CatalogueEntry | null> {
  const result = await pool.query<CatalogueEntry>(
    `SELECT * FROM document_catalogue WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

// ─── Entrées à vérifier (prochaines vérifications échues) ─────────────────────

export async function getEntriesDueForCheck(limit: number = 50): Promise<CatalogueEntry[]> {
  const result = await pool.query<CatalogueEntry>(
    `SELECT * FROM document_catalogue
     WHERE next_check_at <= NOW()
       AND matrix_status IN ('indexed', 'outdated', 'unknown')
     ORDER BY next_check_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ─── Mise à jour du statut d'une entrée ───────────────────────────────────────

export async function updateEntryStatus(
  id: number,
  status: MatrixStatus,
  extraFields?: Partial<CatalogueEntry>
): Promise<void> {
  const sets: string[] = ['matrix_status = $1'];
  const vals: any[] = [status];
  let idx = 2;

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
      sets.push(`${key} = $${idx++}`);
      vals.push(value != null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value);
    }
  }

  vals.push(id);
  await pool.query(
    `UPDATE document_catalogue SET ${sets.join(', ')} WHERE id = $${idx}`,
    vals
  );
}
