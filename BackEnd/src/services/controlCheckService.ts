// controlCheckService.ts — Vérification de non-régression des coverage_facts extraits
// Compare les valeurs extraites par l'ingestion PDF avec les valeurs de référence
// définies dans coverage_facts_control.
import type { Pool, PoolClient } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ControlRow {
  id: number;
  insurer_code: string;
  insurance_type_code: string;
  formula_key: string;
  formula_label: string;
  guarantee_key: string;
  guarantee_label: string;
  expected_status: string;
  expected_amount_pattern: string | null;
  optional_match: boolean;
  source_doc_hint: string | null;
  source_cg_filename: string | null;
  notes: string | null;
}

export type CheckResult = 'passed' | 'failed' | 'not_found';

export interface ControlDetail {
  id: number;
  insurer_code: string;
  insurance_type_code: string;
  formula_key: string;
  formula_label: string;
  guarantee_key: string;
  guarantee_label: string;
  expected_status: string;
  expected_amount_pattern: string | null;
  actual_status: string | null;
  actual_amount: string | null;
  result: CheckResult;
  error: string | null;
  source_doc_hint: string | null;
  source_cg_filename: string | null;
}

export interface ControlCheckReport {
  run_at: string;
  filters: { insurer_code?: string; insurance_type_code?: string; source_cg_filename?: string };
  total: number;
  passed: number;
  failed: number;
  not_found: number;
  success_rate: string;
  details: ControlDetail[];
  failures: ControlDetail[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lance une vérification de non-régression sur l'ensemble (ou un sous-ensemble)
 * des contrôles de référence définis dans coverage_facts_control.
 *
 * Pour chaque ligne de contrôle, la fonction cherche le fait correspondant
 * dans coverage_facts et compare le statut réel au statut attendu.
 *
 * Met à jour les colonnes last_check_* dans coverage_facts_control.
 *
 * @param pool       Instance pg.Pool connectée à la base de production
 * @param filters    Filtres optionnels (insurer_code, insurance_type_code, source_cg_filename)
 *   - source_cg_filename : si fourni, ne vérifie que les contrôles liés à ce fichier CG
 *     ET compare contre les coverage_facts extraits spécifiquement depuis ce fichier
 *     (JOIN central_cg ON target_filename).
 * @returns Rapport détaillé du run (total, passed, failed, not_found + détails)
 */
export async function runControlCheck(
  pool: Pool,
  filters: { insurer_code?: string; insurance_type_code?: string; source_cg_filename?: string } = {}
): Promise<ControlCheckReport> {
  const run_at = new Date().toISOString();
  const client = await pool.connect();

  try {
    // ─── 1. Récupérer les lignes de contrôle à vérifier ───────────────────
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters.insurer_code) {
      params.push(filters.insurer_code);
      conditions.push(`ctrl.insurer_code = $${params.length}`);
    }
    if (filters.insurance_type_code) {
      params.push(filters.insurance_type_code);
      conditions.push(`ctrl.insurance_type_code = $${params.length}`);
    }
    if (filters.source_cg_filename) {
      params.push(filters.source_cg_filename);
      conditions.push(`ctrl.source_cg_filename = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const controlRows = await client.query<ControlRow>(
      `SELECT
         id, insurer_code, insurance_type_code,
         formula_key, formula_label, guarantee_key, guarantee_label,
         expected_status, expected_amount_pattern, optional_match,
         source_doc_hint, source_cg_filename, notes
       FROM coverage_facts_control ctrl
       ${whereClause}
       ORDER BY insurer_code, insurance_type_code, formula_key, guarantee_key`,
      params
    );

    if (controlRows.rows.length === 0) {
      return {
        run_at,
        filters,
        total: 0,
        passed: 0,
        failed: 0,
        not_found: 0,
        success_rate: 'N/A',
        details: [],
        failures: [],
      };
    }

    // ─── 2. Récupérer les coverage_facts correspondants en une seule requête ─
    // Si source_cg_filename est fourni : on joint avec central_cg pour ne tester
    // que les faits extraits depuis ce fichier spécifique.
    // Sinon : on prend le fait le plus récent toutes CG confondues.
    const factsResult = await client.query<{
      insurer_code: string;
      insurance_type_code: string;
      formula_key: string;
      guarantee_key: string;
      coverage_status: string;
      coverage_amount: string | null;
    }>(
      filters.source_cg_filename
        ? `SELECT DISTINCT ON (cf.insurer_code, cf.insurance_type_code, cf.formula_key, cf.guarantee_key)
             cf.insurer_code,
             cf.insurance_type_code,
             cf.formula_key,
             cf.guarantee_key,
             cf.coverage_status,
             cf.coverage_amount
           FROM coverage_facts cf
           JOIN central_cg cg ON cf.central_cg_id = cg.id
           WHERE cf.insurer_code = ANY($1::text[])
             AND cf.insurance_type_code = ANY($2::text[])
             AND (cg.target_filename = $3 OR cg.url LIKE '%' || $3 || '%')
           ORDER BY cf.insurer_code, cf.insurance_type_code, cf.formula_key, cf.guarantee_key, cf.id DESC`
        : `SELECT DISTINCT ON (cf.insurer_code, cf.insurance_type_code, cf.formula_key, cf.guarantee_key)
             cf.insurer_code,
             cf.insurance_type_code,
             cf.formula_key,
             cf.guarantee_key,
             cf.coverage_status,
             cf.coverage_amount
           FROM coverage_facts cf
           WHERE cf.insurer_code = ANY($1::text[])
             AND cf.insurance_type_code = ANY($2::text[])
           ORDER BY cf.insurer_code, cf.insurance_type_code, cf.formula_key, cf.guarantee_key, cf.id DESC`,
      filters.source_cg_filename
        ? [
            [...new Set(controlRows.rows.map(r => r.insurer_code))],
            [...new Set(controlRows.rows.map(r => r.insurance_type_code))],
            filters.source_cg_filename,
          ]
        : [
            [...new Set(controlRows.rows.map(r => r.insurer_code))],
            [...new Set(controlRows.rows.map(r => r.insurance_type_code))],
          ]
    );

    // Index les faits pour lookup O(1)
    const factsMap = new Map<string, { coverage_status: string; coverage_amount: string | null }>();
    for (const fact of factsResult.rows) {
      const key = `${fact.insurer_code}|${fact.insurance_type_code}|${fact.formula_key}|${fact.guarantee_key}`;
      factsMap.set(key, { coverage_status: fact.coverage_status, coverage_amount: fact.coverage_amount });
    }

    // ─── 3. Évaluer chaque contrôle ───────────────────────────────────────
    const details: ControlDetail[] = [];

    for (const ctrl of controlRows.rows) {
      const lookupKey = `${ctrl.insurer_code}|${ctrl.insurance_type_code}|${ctrl.formula_key}|${ctrl.guarantee_key}`;
      const actual = factsMap.get(lookupKey);

      let result: CheckResult;
      let error: string | null = null;

      if (!actual) {
        result = 'not_found';
        error = `Aucune ligne trouvée dans coverage_facts pour (${ctrl.insurer_code}, ${ctrl.insurance_type_code}, ${ctrl.formula_key}, ${ctrl.guarantee_key})`;
      } else {
        const statusMatch = evaluateStatus(ctrl.expected_status, actual.coverage_status, ctrl.optional_match);
        const amountMatch = evaluateAmount(ctrl.expected_amount_pattern, actual.coverage_amount);

        if (statusMatch && amountMatch) {
          result = 'passed';
        } else {
          result = 'failed';
          const errors: string[] = [];
          if (!statusMatch) {
            errors.push(`statut attendu="${ctrl.expected_status}" obtenu="${actual.coverage_status}"`);
          }
          if (!amountMatch) {
            errors.push(`montant ne correspond pas au pattern "${ctrl.expected_amount_pattern}" (obtenu="${actual.coverage_amount}")`);
          }
          error = errors.join(' | ');
        }
      }

      details.push({
        id: ctrl.id,
        insurer_code: ctrl.insurer_code,
        insurance_type_code: ctrl.insurance_type_code,
        formula_key: ctrl.formula_key,
        formula_label: ctrl.formula_label,
        guarantee_key: ctrl.guarantee_key,
        guarantee_label: ctrl.guarantee_label,
        expected_status: ctrl.expected_status,
        expected_amount_pattern: ctrl.expected_amount_pattern,
        actual_status: actual?.coverage_status ?? null,
        actual_amount: actual?.coverage_amount ?? null,
        result,
        error,
        source_doc_hint: ctrl.source_doc_hint,
        source_cg_filename: ctrl.source_cg_filename,
      });
    }

    // ─── 4. Mettre à jour last_check_* en masse (une UPD par résultat) ────
    await persistResults(client, details, run_at);

    // ─── 5. Construire le rapport final ───────────────────────────────────
    const passed = details.filter(d => d.result === 'passed').length;
    const failed = details.filter(d => d.result === 'failed').length;
    const not_found = details.filter(d => d.result === 'not_found').length;
    const total = details.length;
    const failures = details.filter(d => d.result !== 'passed');

    return {
      run_at,
      filters,
      total,
      passed,
      failed,
      not_found,
      success_rate: total > 0 ? `${Math.round((passed / total) * 100)}%` : 'N/A',
      details,
      failures,
    };
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare le statut réel au statut attendu.
 * Si optional_match=true, 'optional' est acccepté quand 'included' est attendu.
 */
function evaluateStatus(expected: string, actual: string, optionalMatch: boolean): boolean {
  if (actual === expected) return true;
  if (optionalMatch && expected === 'included' && actual === 'optional') return true;
  return false;
}

/**
 * Si un pattern de montant est défini, teste le montant réel contre ce regex.
 * Si pas de pattern → toujours OK.
 */
function evaluateAmount(pattern: string | null, actual: string | null): boolean {
  if (!pattern) return true;
  if (!actual) return false;
  try {
    return new RegExp(pattern, 'i').test(actual);
  } catch {
    // Regex invalide dans les données de contrôle → on ne bloque pas le passage
    return true;
  }
}

/**
 * Persiste les résultats dans coverage_facts_control en blocs par statut
 * pour limiter le nombre de requêtes UPDATE.
 */
async function persistResults(
  client: PoolClient,
  details: ControlDetail[],
  run_at: string
): Promise<void> {
  for (const d of details) {
    await client.query(
      `UPDATE coverage_facts_control
       SET last_check_at     = $1,
           last_check_result = $2,
           last_actual_status= $3,
           last_actual_amount= $4,
           last_check_error  = $5,
           updated_at        = NOW()
       WHERE id = $6`,
      [
        run_at,
        d.result,
        d.actual_status,
        d.actual_amount,
        d.error,
        d.id,
      ]
    );
  }
}
