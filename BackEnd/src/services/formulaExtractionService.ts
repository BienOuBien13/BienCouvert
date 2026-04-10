/**
 * FormulaExtractionService — Post-processing pass (Option A)
 *
 * Runs ONCE after all pages of a document have been processed and coverage_facts
 * have been written. At that point we have:
 *   - Every raw formula_label that Gemini Vision reported as a column header
 *   - The classifier formula_hints from the cover page
 *   - The first 2 pages of the PDF (re-read from DB) for LLM validation
 *
 * The agent asks Gemini to validate the candidate list and returns a correction
 * map { rawLabel → canonicalLabel }. It then:
 *   1. UPDATEs coverage_facts with corrected formula_label / formula_key
 *   2. Writes the clean indexedFormulas list to central_cg.metadata
 *
 * This replaces the heuristic isNotFormulaName filter in pageVectorizationService.
 */

import { Pool } from 'pg';
import { getAiClient } from './geminiService';

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeFormulaKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\+/g, '_plus')
    .replace(/[àáâäã]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôöõ]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Fast heuristic pre-filter — reject obvious non-formulas before calling Gemini.
 * This reduces token cost; the LLM does the definitive validation.
 */
function isObviouslyNotFormula(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 60) return true;
  if (/^(garanties?|prestations?|coverage|guarantee|nature|objet|description|montant|plafond|franchise|conditions?|notes?)$/i.test(t)) return true;
  if (/^(nous|vous|il|elle|ils|elles|on|de plein droit|de droit|en option|en sus|par d[eé]faut)$/i.test(t)) return true;
  if (/\b(valeur|montant|inf[eé]rieure?|sup[eé]rieure?|[eé]gale?|comprise?)\b/i.test(t)) return true;
  if (/ [—–-] /.test(t) && t.length > 30) return true;  // "Valeur du véhicule — Supérieure à 30 000 €"
  if (/^[\d€$£]/.test(t)) return true;
  if (/\w{2,}\s*\/\s*\w{2,}\s*\/\s*\w{2,}/.test(t)) return true;
  if (/\b(france\s+m[eé]trop|m[eé]tropol|corse|monaco|drom|\bdom\b|antill|r[eé]union|martiniq|guadeloup|guyane|outre[\s-]?mer)\b/i.test(t)) return true;
  return false;
}

// ─── main export ─────────────────────────────────────────────────────────────

export interface FormulaValidationResult {
  /** Corrected formula names ready for indexedFormulas */
  validFormulas: string[];
  /** Map rawLabel → canonicalLabel (identity if already correct, null if rejected) */
  correctionMap: Map<string, string | null>;
  /** Number of coverage_facts rows updated */
  factsUpdated: number;
}

/**
 * Runs after vectorizeCgByPages(). Reads raw formula candidates from coverage_facts,
 * validates them with Gemini, corrects coverage_facts in-place, and updates
 * central_cg.metadata.indexedFormulas.
 *
 * @param pool          Postgres pool
 * @param centralCgId   ID of the central_cg row just vectorized
 * @param classifierHints  formula_hints from the CLASSIFIER step (already filtered by classifier)
 * @param coverPageBase64  Base64 of the first page image (for LLM visual context)
 */
export async function runFormulaPostProcessing(
  pool: Pool,
  centralCgId: number,
  classifierHints: string[],
  coverPageBase64: string | null,
): Promise<FormulaValidationResult> {

  const tag = `[FormulaAgent#${centralCgId}]`;

  // ── Step 1: collect all distinct raw formula_labels from coverage_facts ──────
  const rawFactsResult = await pool.query<{ formula_label: string; formula_key: string; page_count: string }>(
    `SELECT formula_label, formula_key, COUNT(DISTINCT source_page_number)::text AS page_count
     FROM coverage_facts
     WHERE central_cg_id = $1
     GROUP BY formula_label, formula_key
     ORDER BY page_count DESC, formula_label`,
    [centralCgId],
  );

  const rawCandidates = rawFactsResult.rows.map(r => ({
    label: r.formula_label,
    key: r.formula_key,
    pageCount: parseInt(r.page_count, 10),
  }));

  if (rawCandidates.length === 0) {
    console.log(`${tag} Aucun candidat formule dans coverage_facts — rien à corriger`);
    return { validFormulas: classifierHints, correctionMap: new Map(), factsUpdated: 0 };
  }

  console.log(`${tag} ${rawCandidates.length} candidats formules bruts: [${rawCandidates.map(c => `"${c.label}"(p${c.pageCount})`).join(', ')}]`);

  // ── Steps 2-3: heuristic pre-filter + LLM validation ─────────────────────────
  const correctionMap = await validateCandidates(rawCandidates, classifierHints, coverPageBase64, tag);

  // ── Step 4: apply corrections to coverage_facts ──────────────────────────────
  let factsUpdated = 0;

  for (const [rawLabel, canonicalLabel] of correctionMap.entries()) {
    if (canonicalLabel === null) {
      // Rejected: delete coverage_facts rows for this spurious formula
      const del = await pool.query(
        `DELETE FROM coverage_facts WHERE central_cg_id = $1 AND formula_label = $2`,
        [centralCgId, rawLabel],
      );
      if ((del.rowCount ?? 0) > 0) {
        console.log(`${tag} Supprimé ${del.rowCount} facts pour formule parasite "${rawLabel}"`);
        factsUpdated += del.rowCount ?? 0;
      }
    } else if (canonicalLabel !== rawLabel) {
      // Renamed: update label and key
      const newKey = normalizeFormulaKey(canonicalLabel);
      const upd = await pool.query(
        `UPDATE coverage_facts
         SET formula_label = $1, formula_key = $2
         WHERE central_cg_id = $3 AND formula_label = $4`,
        [canonicalLabel, newKey, centralCgId, rawLabel],
      );
      if ((upd.rowCount ?? 0) > 0) {
        console.log(`${tag} Renommé ${upd.rowCount} facts: "${rawLabel}" → "${canonicalLabel}"`);
        factsUpdated += upd.rowCount ?? 0;
      }
    }
    // else: label correct, no DB write needed
  }

  // ── Step 5: build final validFormulas list ────────────────────────────────────
  const validFormulas = buildValidFormulas(rawCandidates, correctionMap, classifierHints);

  // ── Step 6: persist indexedFormulas ──────────────────────────────────────────
  if (validFormulas.length > 0) {
    await pool.query(
      `UPDATE central_cg
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{indexedFormulas}',
         $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(validFormulas), centralCgId],
    );
    console.log(`${tag} ✅ indexedFormulas finaux: [${validFormulas.join(', ')}] (${factsUpdated} facts corrigés)`);
  } else {
    console.warn(`${tag} ⚠️ Aucune formule valide trouvée`);
  }

  return { validFormulas, correctionMap, factsUpdated };
}

// ─── shared helpers (used by both central_cg and user_cg paths) ──────────────

interface RawCandidate {
  label: string;
  key: string;
  pageCount: number;
}

/**
 * Runs heuristic pre-filter then LLM validation on a list of raw formula candidates.
 * Returns a correctionMap: rawLabel → canonicalLabel (null = reject).
 */
async function validateCandidates(
  rawCandidates: RawCandidate[],
  classifierHints: string[],
  coverPageBase64: string | null,
  tag: string,
): Promise<Map<string, string | null>> {

  const correctionMap = new Map<string, string | null>();

  const preFiltered = rawCandidates.filter(c => !isObviouslyNotFormula(c.label));
  const heuristicRejected = rawCandidates.filter(c => isObviouslyNotFormula(c.label));

  if (heuristicRejected.length > 0) {
    console.log(`${tag} Filtrage heuristique: ${heuristicRejected.length} rejetés → [${heuristicRejected.map(c => `"${c.label}"`).join(', ')}]`);
  }
  for (const c of heuristicRejected) {
    correctionMap.set(c.label, null);
  }

  const ai = getAiClient();

  if (ai && preFiltered.length > 0) {
    try {
      const candidateLines = preFiltered
        .map(c => `- "${c.label}" (apparaît sur ${c.pageCount} page(s))`)
        .join('\n');

      const hintsLine = classifierHints.length > 0
        ? `\nFormules identifiées sur la page de garde : ${classifierHints.map(h => `"${h}"`).join(', ')}`
        : '';

      const prompt = `Tu es un expert en documents d'assurance français.
Tu dois valider et corriger une liste de candidats détectés comme en-têtes de colonnes d'un tableau de garanties.

CANDIDATS DÉTECTÉS :
${candidateLines}
${hintsLine}

TÂCHE : Pour chaque candidat, décide s'il est un nom commercial de formule que le client peut souscrire.

RÈGLES :
- FORMULE VALIDE : nom propre d'une offre souscriptible (ex: "Formule Tiers", "TIERS ESSENTIEL", "Confort+", "NIVEAU 2")
- FAUSSE DÉTECTION : pronoms ("Nous", "Vous"), locutions ("De plein droit"), en-têtes de section, descripteurs de valeur, zones géographiques, montants, sous-conditions
- CORRECTION : si le candidat est une formule valide mais mal orthographié ou tronqué, donne le nom corrigé

Réponds UNIQUEMENT en JSON (tableau dans le même ordre que les candidats) :
[
  { "input": "Formule Tiers", "is_formula": true, "canonical": "Formule Tiers" },
  { "input": "Nous", "is_formula": false, "canonical": null }
]`;

      const contents: any[] = [prompt];
      if (coverPageBase64) {
        contents.unshift({ inlineData: { mimeType: 'image/png', data: coverPageBase64 } });
      }

      const model = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
        'formulaExtractionAgent',
      );
      const result = await model.generateContent(contents);
      const parsed: Array<{ input: string; is_formula: boolean; canonical: string | null }> = JSON.parse(result.response.text());

      for (const item of parsed) {
        if (!item.input) continue;
        correctionMap.set(item.input, item.is_formula && item.canonical ? item.canonical.trim() : null);
      }
      for (const c of preFiltered) {
        if (!correctionMap.has(c.label)) correctionMap.set(c.label, c.label);
      }

      const validated = [...correctionMap.entries()].filter(([, v]) => v !== null).map(([k, v]) => `"${k}"→"${v}"`);
      const rejected = [...correctionMap.entries()].filter(([, v]) => v === null).map(([k]) => `"${k}"`);
      console.log(`${tag} LLM: ${validated.length} valides [${validated.join(', ')}], ${rejected.length} rejetés [${rejected.join(', ')}]`);

    } catch (e: any) {
      console.warn(`${tag} Erreur LLM validation, fallback heuristique:`, e.message?.slice(0, 100));
      for (const c of preFiltered) correctionMap.set(c.label, c.label);
    }
  } else {
    for (const c of preFiltered) correctionMap.set(c.label, c.label);
  }

  // ── Dedup by normalized key: if two raw labels map to the same canonical key,
  // keep the variant with the highest page_count; redirect the others to the winner.
  // This eliminates casing duplicates like "FORMULE CONFORT" / "Formule Confort".
  const keyToWinner = new Map<string, { canonical: string; pageCount: number }>();
  for (const c of rawCandidates) {
    const canonical = correctionMap.get(c.label);
    if (!canonical) continue; // rejected
    const key = normalizeFormulaKey(canonical);
    const existing = keyToWinner.get(key);
    if (!existing || c.pageCount > existing.pageCount) {
      keyToWinner.set(key, { canonical, pageCount: c.pageCount });
    }
  }
  for (const c of rawCandidates) {
    const canonical = correctionMap.get(c.label);
    if (!canonical) continue;
    const key = normalizeFormulaKey(canonical);
    const winner = keyToWinner.get(key)!;
    if (canonical !== winner.canonical) {
      correctionMap.set(c.label, winner.canonical);
    }
  }

  return correctionMap;
}

/**
 * Builds the final deduplicated validFormulas list from the correction map.
 */
function buildValidFormulas(
  rawCandidates: RawCandidate[],
  correctionMap: Map<string, string | null>,
  classifierHints: string[],
): string[] {
  const seenKeys = new Set<string>();
  const validFormulas: string[] = [];

  for (const c of rawCandidates) {
    const canonical = correctionMap.get(c.label);
    if (!canonical) continue;
    const key = normalizeFormulaKey(canonical);
    if (!seenKeys.has(key)) { seenKeys.add(key); validFormulas.push(canonical); }
  }
  for (const hint of classifierHints) {
    const key = normalizeFormulaKey(hint);
    if (!seenKeys.has(key) && !isObviouslyNotFormula(hint)) {
      seenKeys.add(key);
      validFormulas.push(hint);
    }
  }
  return validFormulas;
}

// ─── user_cg path ─────────────────────────────────────────────────────────────

/**
 * Same as runFormulaPostProcessing, but for user_cg documents.
 * Operates on user_coverage_facts (user_cg_id) and updates user_cg.metadata.
 */
export async function runFormulaPostProcessingForUserCg(
  pool: Pool,
  userCgId: number,
  classifierHints: string[],
  coverPageBase64: string | null,
): Promise<FormulaValidationResult> {

  const tag = `[FormulaAgent/user_cg#${userCgId}]`;

  const rawFactsResult = await pool.query<{ formula_label: string; formula_key: string; page_count: string }>(
    `SELECT formula_label, formula_key, COUNT(DISTINCT source_page_number)::text AS page_count
     FROM user_coverage_facts
     WHERE user_cg_id = $1
     GROUP BY formula_label, formula_key
     ORDER BY page_count DESC, formula_label`,
    [userCgId],
  );

  const rawCandidates = rawFactsResult.rows.map(r => ({
    label: r.formula_label,
    key: r.formula_key,
    pageCount: parseInt(r.page_count, 10),
  }));

  if (rawCandidates.length === 0) {
    console.log(`${tag} Aucun candidat formule — rien à corriger`);
    return { validFormulas: classifierHints, correctionMap: new Map(), factsUpdated: 0 };
  }

  const correctionMap = await validateCandidates(rawCandidates, classifierHints, coverPageBase64, tag);

  // Apply corrections to user_coverage_facts
  let factsUpdated = 0;
  for (const [rawLabel, canonicalLabel] of correctionMap.entries()) {
    if (canonicalLabel === null) {
      const del = await pool.query(
        `DELETE FROM user_coverage_facts WHERE user_cg_id = $1 AND formula_label = $2`,
        [userCgId, rawLabel],
      );
      factsUpdated += del.rowCount ?? 0;
    } else if (canonicalLabel !== rawLabel) {
      const newKey = normalizeFormulaKey(canonicalLabel);
      const upd = await pool.query(
        `UPDATE user_coverage_facts SET formula_label = $1, formula_key = $2
         WHERE user_cg_id = $3 AND formula_label = $4`,
        [canonicalLabel, newKey, userCgId, rawLabel],
      );
      factsUpdated += upd.rowCount ?? 0;
    }
  }

  const validFormulas = buildValidFormulas(rawCandidates, correctionMap, classifierHints);

  if (validFormulas.length > 0) {
    await pool.query(
      `UPDATE user_cg
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{formules}',
         $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(validFormulas), userCgId],
    );
    console.log(`${tag} ✅ formules finaux: [${validFormulas.join(', ')}] (${factsUpdated} facts corrigés)`);
  }

  return { validFormulas, correctionMap, factsUpdated };
}
