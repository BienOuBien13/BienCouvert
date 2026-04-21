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
 * Strips option-qualification suffixes from a formula label.
 * Handles all common forms encountered in French CG tables.
 * e.g. "Différence (avec option)" → "Différence"
 *      "Essentiel (sans option Optima)" → "Essentiel"
 *      "Confort — avec option" → "Confort"
 *      "Initiale - sans options" → "Initiale"
 */
function stripOptionSuffix(label: string): string {
  return label
    // Parentheses: "Essentiel (avec option)" / "Plénitude (sans option Optima)"
    .replace(/\s*\(\s*(avec|sans)\s+options?[^)]*\)\s*$/i, '')
    // Square brackets: "Essentiel [avec option]"
    .replace(/\s*\[\s*(avec|sans)\s+options?[^\]]*\]\s*$/i, '')
    // Em-dash / en-dash / hyphen: "Confort — avec option"
    .replace(/\s*[—–-]\s*(avec|sans)\s+options?.*$/i, '')
    .trim();
}

/** Returns true if the label is an option-qualified variant (avec or sans option). */
function isOptionVariant(label: string): boolean {
  return /\b(avec|sans)\s+options?\b/i.test(label);
}

/** Returns true specifically for "avec option" variants (guarantees are add-ons). */
function isAvecOptionVariant(label: string): boolean {
  return /\bAvec\s+options?\b/i.test(label);
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

  // ── Step 4: apply corrections to coverage_facts (smart option-variant merge) ──
  const factsUpdated = await applyCorrectionsWithMerge(pool, centralCgId, correctionMap, rawCandidates, tag);

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

  // ── Step 7: build and persist indexedOptions from optional coverage_facts ─────
  // indexedOptions = { "FormulaName": ["Option label 1", "Option label 2"], ... }
  const optRows = await pool.query<{ formula_label: string; guarantee_label: string }>(
    `SELECT DISTINCT formula_label, guarantee_label
     FROM coverage_facts
     WHERE central_cg_id = $1 AND coverage_status = 'optional'
     ORDER BY formula_label, guarantee_label`,
    [centralCgId],
  );

  const indexedOptions: Record<string, string[]> = {};
  for (const row of optRows.rows) {
    const fKey = row.formula_label || 'default';
    if (!indexedOptions[fKey]) indexedOptions[fKey] = [];
    indexedOptions[fKey].push(row.guarantee_label);
  }

  if (Object.keys(indexedOptions).length > 0) {
    await pool.query(
      `UPDATE central_cg
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{indexedOptions}',
         $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(indexedOptions), centralCgId],
    );
    const optSummary = Object.entries(indexedOptions).map(([f, opts]) => `${f}(${opts.length})`).join(', ');
    console.log(`${tag} ✅ indexedOptions: {${optSummary}}`);
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
 * Applies the correctionMap to coverage_facts for a central_cg document.
 * Handles option-variant merging correctly:
 *  - "sans option" variant  → becomes the canonical base row (replace existing)
 *  - "avec option" variant  → deleted (optional guarantees already marked on base)
 *  - Other rename           → simple UPDATE; if target key already exists, merge by
 *                             keeping the row with the most informative coverage_status.
 */
async function applyCorrectionsWithMerge(
  pool: Pool,
  centralCgId: number,
  correctionMap: Map<string, string | null>,
  rawCandidates: RawCandidate[],
  tag: string,
): Promise<number> {
  let factsUpdated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [rawLabel, canonicalLabel] of correctionMap.entries()) {
      if (canonicalLabel === null) {
        const del = await client.query(
          `DELETE FROM coverage_facts WHERE central_cg_id = $1 AND formula_label = $2`,
          [centralCgId, rawLabel],
        );
        if ((del.rowCount ?? 0) > 0) {
          console.log(`${tag} Supprimé ${del.rowCount} facts (parasite) "${rawLabel}"`);
          factsUpdated += del.rowCount ?? 0;
        }
      } else if (canonicalLabel !== rawLabel) {
        const newKey = normalizeFormulaKey(canonicalLabel);
        const { rowCount: existing } = await client.query(
          `SELECT 1 FROM coverage_facts WHERE central_cg_id = $1 AND formula_key = $2 LIMIT 1`,
          [centralCgId, newKey],
        );

        if (!existing) {
          // Simple rename — no conflict
          const upd = await client.query(
            `UPDATE coverage_facts SET formula_label = $1, formula_key = $2
             WHERE central_cg_id = $3 AND formula_label = $4`,
            [canonicalLabel, newKey, centralCgId, rawLabel],
          );
          if ((upd.rowCount ?? 0) > 0) {
            console.log(`${tag} Renommé ${upd.rowCount} facts: "${rawLabel}" → "${canonicalLabel}"`);
            factsUpdated += upd.rowCount ?? 0;
          }
        } else if (isAvecOptionVariant(rawLabel)) {
          // "avec option" duplicate → delete (base formula already marks options as 'optional')
          const del = await client.query(
            `DELETE FROM coverage_facts WHERE central_cg_id = $1 AND formula_label = $2`,
            [centralCgId, rawLabel],
          );
          console.log(`${tag} Supprimé ${del.rowCount ?? 0} facts (avec option → fusionné): "${rawLabel}"`);
          factsUpdated += del.rowCount ?? 0;
        } else {
          // "sans option" or renamed variant that conflicts — merge into existing canonical:
          // Update coverage_status on the canonical rows using the incoming rows (prefer non-not_applicable).
          await client.query(
            `UPDATE coverage_facts AS tgt
             SET coverage_status = CASE
               WHEN src.coverage_status <> 'not_applicable' THEN src.coverage_status
               ELSE tgt.coverage_status
             END,
             coverage_amount = COALESCE(src.coverage_amount, tgt.coverage_amount),
             franchise       = COALESCE(src.franchise, tgt.franchise),
             updated_at      = CURRENT_TIMESTAMP
             FROM coverage_facts AS src
             WHERE src.central_cg_id  = $1
               AND src.formula_label  = $2
               AND tgt.central_cg_id  = $1
               AND tgt.formula_key    = $3
               AND tgt.guarantee_key  = src.guarantee_key`,
            [centralCgId, rawLabel, newKey],
          );
          const del = await client.query(
            `DELETE FROM coverage_facts WHERE central_cg_id = $1 AND formula_label = $2`,
            [centralCgId, rawLabel],
          );
          console.log(`${tag} Fusionné (sans option → canonical) ${del.rowCount ?? 0} facts: "${rawLabel}" → "${canonicalLabel}"`);
          factsUpdated += del.rowCount ?? 0;
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return factsUpdated;
}

/**
 * Same merge logic for user_coverage_facts (user_cg path).
 */
async function applyCorrectionsWithMergeUser(
  pool: Pool,
  userCgId: number,
  correctionMap: Map<string, string | null>,
  rawCandidates: RawCandidate[],
  tag: string,
): Promise<number> {
  let factsUpdated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [rawLabel, canonicalLabel] of correctionMap.entries()) {
      if (canonicalLabel === null) {
        const del = await client.query(
          `DELETE FROM user_coverage_facts WHERE user_cg_id = $1 AND formula_label = $2`,
          [userCgId, rawLabel],
        );
        factsUpdated += del.rowCount ?? 0;
      } else if (canonicalLabel !== rawLabel) {
        const newKey = normalizeFormulaKey(canonicalLabel);
        const { rowCount: existing } = await client.query(
          `SELECT 1 FROM user_coverage_facts WHERE user_cg_id = $1 AND formula_key = $2 LIMIT 1`,
          [userCgId, newKey],
        );

        if (!existing) {
          const upd = await client.query(
            `UPDATE user_coverage_facts SET formula_label = $1, formula_key = $2
             WHERE user_cg_id = $3 AND formula_label = $4`,
            [canonicalLabel, newKey, userCgId, rawLabel],
          );
          factsUpdated += upd.rowCount ?? 0;
        } else if (isAvecOptionVariant(rawLabel)) {
          const del = await client.query(
            `DELETE FROM user_coverage_facts WHERE user_cg_id = $1 AND formula_label = $2`,
            [userCgId, rawLabel],
          );
          factsUpdated += del.rowCount ?? 0;
        } else {
          await client.query(
            `UPDATE user_coverage_facts AS tgt
             SET coverage_status = CASE
               WHEN src.coverage_status <> 'not_applicable' THEN src.coverage_status
               ELSE tgt.coverage_status
             END,
             coverage_amount = COALESCE(src.coverage_amount, tgt.coverage_amount),
             updated_at      = CURRENT_TIMESTAMP
             FROM user_coverage_facts AS src
             WHERE src.user_cg_id    = $1
               AND src.formula_label = $2
               AND tgt.user_cg_id   = $1
               AND tgt.formula_key  = $3
               AND tgt.guarantee_key = src.guarantee_key`,
            [userCgId, rawLabel, newKey],
          );
          const del = await client.query(
            `DELETE FROM user_coverage_facts WHERE user_cg_id = $1 AND formula_label = $2`,
            [userCgId, rawLabel],
          );
          factsUpdated += del.rowCount ?? 0;
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return factsUpdated;
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
- VARIANTS AVEC/SANS OPTION : si un candidat est une variante d'option d'une formule (ex: "Essentiel (avec option)", "Différence sans option", "Initiale (avec option Optima)") → retourne le NOM DE BASE SANS le suffixe option (ex: canonical = "Essentiel", "Différence", "Initiale"). Les options sont des garanties activables séparément, ce ne sont PAS des formules distinctes.

Réponds UNIQUEMENT en JSON (tableau dans le même ordre que les candidats) :
[
  { "input": "Formule Tiers", "is_formula": true, "canonical": "Formule Tiers" },
  { "input": "Essentiel (avec option)", "is_formula": true, "canonical": "Essentiel" },
  { "input": "Différence sans option", "is_formula": true, "canonical": "Différence" },
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

  // ── Strip option suffixes from canonical values before dedup.
  // e.g. "Différence — avec option" → "Différence" so it merges with "Différence".
  for (const [rawLabel, canonical] of correctionMap.entries()) {
    if (canonical === null) continue;
    const stripped = stripOptionSuffix(canonical);
    if (stripped !== canonical) {
      correctionMap.set(rawLabel, stripped || null);
    }
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

  // Apply corrections to user_coverage_facts (smart option-variant merge)
  const factsUpdated = await applyCorrectionsWithMergeUser(pool, userCgId, correctionMap, rawCandidates, tag);

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
