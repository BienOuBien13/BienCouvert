/**
 * Service d'extraction de tableaux de garanties depuis les PDFs
 * Utilise Gemini Vision pour comprendre la structure visuelle des tableaux
 */

import { getAiClient } from './geminiService';
import { Pool } from 'pg';

interface TableCell {
  rowIndex: number;
  colIndex: number;
  content: string;
  isHeader: boolean;
}

interface ExtractedTable {
  headers: string[];
  rows: Array<{
    guarantee: string;
    formulas: Record<string, string>; // formula_key -> status ('✓', '○', '-', etc.)
  }>;
  confidence: number;
  legend?: Record<string, string>; // symbole brut → signification ("included"/"excluded"/"optional")
}

interface CoverageFact {
  guarantee_key: string;
  guarantee_label: string;
  formula_key: string;
  formula_label: string;
  coverage_status: 'included' | 'optional' | 'excluded' | 'not_applicable';
  coverage_amount?: string;
  franchise?: string;
}

/**
 * Tronque un libellé à une longueur maximale raisonnable.
 * Évite les erreurs VARCHAR côté DB et garde les clés UNIQUE raisonnables.
 */
function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026'; // … = ellipsis
}

/**
 * Normalise un nom de garantie en clé snake_case
 */
function normalizeGuaranteeKey(label: string): string {
  return label
    .toLowerCase()
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
 * Normalise un nom de formule en clé snake_case
 * Traitement spécial du '+' qui devient '_plus' (ex: "TIERS ESSENTIEL+" → "tiers_essentiel_plus")
 */
function normalizeFormulaKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\+/g, '_plus')  // "TIERS ESSENTIEL+" → "...essentiel_plus"
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
 * Détermine le statut de couverture à partir d'un symbole ou texte de cellule.
 * Retourne { status, amount } où `amount` est le texte brut de la cellule quand il
 * contient une information de plafond/montant (sinon null).
 */
type ParsedStatus = {
  status: 'included' | 'optional' | 'excluded' | 'not_applicable';
  amount: string | null;
  franchise?: string | null;
};

/** Extrait un montant de franchise depuis le texte d'une cellule */
function extractFranchise(text: string): string | null {
  const m = text.match(/franchise[\s:]+([\d\s.,]+[€$]?)/i)
    || text.match(/([\d\s.,]+[€$])\s+franchise/i);
  return m ? m[1].trim() : null;
}

function parseStatus(
  symbol: string,
  legend?: Record<string, string>
): ParsedStatus {
  const raw = symbol.trim();
  const s = raw.toLowerCase();

  // Vide
  if (!s) return { status: 'not_applicable', amount: null, franchise: null };

  // ── Légende prioritaire : si le symbole brut correspond à une clé de la légende ──
  if (legend) {
    const legendVal = legend[raw] || legend[s] || legend[raw.toUpperCase()];
    if (legendVal) {
      const lv = legendVal.toLowerCase();
      if (/inclu|garanti|compris|couvert|oui|yes|included/.test(lv)) return { status: 'included', amount: null, franchise: null };
      if (/exclu|non|no|néant|neant|excluded/.test(lv)) return { status: 'excluded', amount: null, franchise: null };
      if (/option|en sus|optionnel|optional/.test(lv)) return { status: 'optional', amount: null, franchise: null };
      if (/n\/a|sans objet|not.applicable/.test(lv)) return { status: 'not_applicable', amount: null, franchise: null };
    }
  }

  // Inclus — symboles positifs (picto seul, sans texte)
  if (/^(✓|✔|√|●|•|■|▪|◆)$/.test(raw)) return { status: 'included', amount: null };
  if (/^(oui|yes|inclus|included|compris|couvert|garanti)$/i.test(s)) return { status: 'included', amount: null };

  // Exclus — symboles négatifs (AVANT le fallback texte afin d'éviter faux positif)
  if (/^(✗|✘|×|✕|□|▫)$/.test(raw)) return { status: 'excluded', amount: null };
  if (/^(x|×)$/.test(s)) return { status: 'excluded', amount: null };
  if (/^(-|−|–|—|\.\.\.|--)$/.test(raw)) return { status: 'excluded', amount: null };
  if (/^(non|no|exclu|excluded|non compris|néant|neant|nul|nulle)$/i.test(s)) return { status: 'excluded', amount: null };
  if (/\bexclu/i.test(s) && !/en option/i.test(s)) return { status: 'excluded', amount: null };

  // Optionnel
  if (/^(○|◯|⊙|opt|△)$/.test(raw)) return { status: 'optional', amount: null };
  if (/^(option|opt\.|en option|en sus|sur option|optionnel)$/i.test(s)) return { status: 'optional', amount: null };

  // N/A
  if (/^(n\/a|na|s\.o\.|sans objet|so|n\.a\.)$/i.test(s)) return { status: 'not_applicable', amount: null };

  // Exclus — catch-all textuel AVANT le fallback inclusif
  if (/\b(non\s+inclus|non\s+couvert|non\s+compris|non\s+garanti|non\s+pris\s+en\s+charge|pas\s+inclus|pas\s+couvert|exclue?|exclusion)\b/i.test(s)) return { status: 'excluded', amount: null };
  if (/^non[\s.,;:!]*$/i.test(s)) return { status: 'excluded', amount: null };
  if (/^[-–—.]{1,5}$/.test(raw)) return { status: 'excluded', amount: null };

  // Texte avec chiffres (plafond, montant, %) → inclus + conserver le texte comme amount
  if (/\d/.test(s) && !/\b(non|exclu|sans)\b/i.test(s)) return { status: 'included', amount: raw };
  if (/\b(jusqu'?à|jusqu.a|plafond|forfait|remboursement|capital|rente|indemnit|cotisation|prime|prise\s+en\s+charge)\b/i.test(s)) return { status: 'included', amount: raw };

  return { status: 'not_applicable', amount: null };
}

/**
 * Extrait un tableau structuré depuis une image de page PDF via Gemini Vision.
 *
 * @param pageImageBase64    Image base64 de la page à analyser
 * @param insurerCode        Code assureur (ex: "MAAF01")
 * @param insuranceTypeCode  Code type assurance (ex: "AUT01")
 * @param knownFormulaHeaders  En-têtes de formules détectées sur les pages précédentes.
 *                             Passé pour les "pages de continuation" où les colonnes du
 *                             tableau ne sont plus visibles en haut de page.
 *                             Ex: ["TIERS", "TIERS ESSENTIEL+", "TOUS RISQUES"]
 */
export async function extractTableFromPageImage(
  pageImageBase64: string,
  insurerCode: string,
  insuranceTypeCode: string,
  knownFormulaHeaders?: string[]
): Promise<ExtractedTable | null> {
  try {
    const ai = getAiClient();
    if (!ai) {
      console.warn('⚠️ Gemini client non disponible');
      return null;
    }

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // ── Bloc de contexte injecté quand des en-têtes de pages précédentes sont connus ──
    const continuationContext = (knownFormulaHeaders && knownFormulaHeaders.length > 0)
      ? `
═══ CONTEXTE — PAGE DE CONTINUATION ═══
Cette page fait probablement partie d'un tableau commencé sur les pages précédentes.
Les colonnes de formules identifiées sur les pages précédentes sont (dans l'ordre) :
${knownFormulaHeaders.map((h, i) => `  ${i + 1}. "${h}"`).join('\n')}

⚠️ RÈGLE STRICTE :
- Si les en-têtes de colonnes NE SONT PAS visibles sur cette page, utilise EXACTEMENT ces noms (même orthographe, même ordre).
- Ne les invente PAS et ne les renomme PAS.
- Si tu vois des en-têtes sur cette page qui correspondent à ces noms, utilise-les — sinon utilise la liste ci-dessus.
═══════════════════════════════════════
`
      : '';

    const prompt = `Tu es un expert en analyse de tableaux de garanties d'assurance français.
Analyse cette image de page PDF et extrait la matrice complète garanties × formules.
${continuationContext}
═══ ÉTAPE 1 — LÉGENDE (CRITIQUE — faire AVANT toute extraction) ═══
Cherche PARTOUT sur la page une légende, un encadré "Légende", "Symboles", une note de bas de page ou un texte explicatif des symboles.
Exemples fréquents :
- "● = garanti" / "○ = en option" / "— = non garanti"  
- "G = garanti" / "O = option" / "E = exclu"
- Icones colorées, symboles géométriques, chiffres codés

Reporte la légende dans le champ "legend" : { "symbole_brut": "included|excluded|optional" }
Si aucune légende trouvée : "legend": null

═══ ÉTAPE 2 — DÉTECTION DES EN-TÊTES ═══
Identifie la LIGNE D'EN-TÊTES du tableau (noms des formules/produits).
- Si les en-têtes couvrent plusieurs lignes (ex: zone géographique + nom formule), concatène : "Zone Europe — FORMULE 1"
- Si cette page est une suite (voir contexte ci-dessus) et que les en-têtes ne sont pas visibles, utilise les noms fournis dans le contexte.
- La première colonne s'appelle toujours "Garanties" (ou son équivalent visible).

═══ ÉTAPE 3 — EXTRACTION DES LIGNES ═══
Pour chaque cellule, APPLIQUE la légende pour normaliser la valeur :
- Inclus (légende = "garanti"/"inclus"/"oui") → mettre "✓"
- Exclu (légende = "non garanti"/"exclu"/"non") → mettre "✗"
- Option (légende = "en option"/"sur option"/"optionnel") → mettre "○"
- Cellule VIDE (vraiment vide, rien du tout) → mettre ""
- Montant ou texte descriptif → mettre le texte exact ("1 500 €", "Jusqu'à 3000 €")

Si PAS de légende explicite, applique ce décodage standard :
- ✓ ✔ ● • √ ■ ▪ ◆ "Oui" "Inclus" "Garanti" "Compris" → "✓"
- ✗ ✘ × "Non" "Exclu" "Néant" □ ▫ → "✗"
- X ou x seul (lettre, pas symbole) → "✗"
- – — - (tiret seul) → "✗"  
- ○ ◯ "Option" "En option" "En sus" △ → "○"

⚠️ RÈGLES ABSOLUES À RESPECTER :
1. LÉGENDE = PRIORITÉ ABSOLUE sur tout autre interprétation.
2. Une cellule VIDE (pas de symbole, pas de tiret) ≠ "exclu" : mets "" (chaîne vide).
3. TITRES DE SECTION : certaines lignes sont des titres de section (ex: "GARANTIES OBLIGATOIRES", "DOMMAGES AU VÉHICULE") — elles sont souvent en gras, centrées, sans symboles. Pour ces lignes, inclure le titre dans "guarantee" ET ajouter "is_section": true. Mettre "" dans toutes les cellules de formule.
4. Identifie TOUTES les lignes (y compris sous-garanties en retrait ou à la ligne suivante).
5. Identifie TOUTES les colonnes de formules, sans en oublier.
6. Symbole inconnu non présent dans la légende → mets le symbole exact tel quel.
7. Si un montant est présent dans la cellule (ex: "1 000 €", "100%"), inclure le montant en plus du statut.

═══ FORMAT JSON STRICT (aucun autre texte) ═══
{
  "has_table": true,
  "legend": { "●": "included", "○": "optional", "—": "excluded" },
  "headers": ["Garanties", "FORMULE 1", "FORMULE 2", "FORMULE 3"],
  "rows": [
    {
      "guarantee": "GARANTIES OBLIGATOIRES",
      "is_section": true,
      "formulas": { "formule_1": "", "formule_2": "", "formule_3": "" }
    },
    {
      "guarantee": "Responsabilité civile",
      "formulas": { "formule_1": "✓", "formule_2": "✓", "formule_3": "✓" }
    },
    {
      "guarantee": "Dommages tous accidents",
      "formulas": { "formule_1": "✗", "formule_2": "✓", "formule_3": "✓" }
    },
    {
      "guarantee": "Dommages collision (responsabilité partielle)",
      "formulas": { "formule_1": "✗", "formule_2": "○", "formule_3": "✓" }
    },
    {
      "guarantee": "Franchise : 300 €",
      "formulas": { "formule_1": "", "formule_2": "300 €", "formule_3": "150 €" }
    }
  ],
  "confidence": 0.95
}

CLÉS DE FORMULES en snake_case :
- Espaces → "_", "+" → "_plus", majuscules → minuscules, accents supprimés
- "Formule 2" → "formule_2", "TIERS ESSENTIEL+" → "tiers_essentiel_plus"

Si aucun tableau visible : {"has_table": false, "confidence": 1.0}

RÉPONDS UNIQUEMENT AVEC LE JSON.`;

    if (knownFormulaHeaders && knownFormulaHeaders.length > 0) {
      console.log(`📌 [extractTable] Contexte continuation : ${knownFormulaHeaders.length} formules connues → [${knownFormulaHeaders.join(' | ')}]`);
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: pageImageBase64
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Parser le JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ Pas de JSON valide dans la réponse Vision');
      return null;
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.has_table) {
      return null;
    }

    // Capturer et normaliser la légende détectée par Gemini
    let legend: Record<string, string> | undefined;
    if (parsed.legend && typeof parsed.legend === 'object' && Object.keys(parsed.legend).length > 0) {
      legend = parsed.legend;
      console.log(`📖 Légende détectée: ${JSON.stringify(legend)}`);
    }

    const headers: string[] = parsed.headers || [];
    const formulaHeaders = headers.slice(1); // col 0 = "Garanties"

    // Normaliser les lignes en format objet {guarantee, formulas} quel que soit le format Gemini
    const rawRows: any[] = parsed.rows || [];
    const rows = rawRows
      .filter((r: any) => r !== null && r !== undefined)
      .map((r: any) => {
        if (Array.isArray(r)) {
          // Format tableau Gemini [guarantee, symbol1, symbol2, ...]
          const guarantee = String(r[0] || '');
          const formulas: Record<string, string> = {};
          formulaHeaders.forEach((h: string, i: number) => {
            formulas[normalizeFormulaKey(h)] = String(r[i + 1] ?? '');
          });
          return { guarantee, formulas };
        }
        // Format objet déjà correct
        return r;
      })
      .filter((r: any) => r.guarantee && r.guarantee.trim());

    // Log complet pour diagnostic
    console.log(`📊 Tableau Gemini: ${headers.length} colonnes × ${rows.length} lignes (${rawRows.length} brutes)`);
    console.log(`   En-têtes: [${headers.join(' | ')}]`);
    rows.slice(0, 5).forEach((r: any) => {
      const cells = Object.entries(r.formulas || {}).map(([k, v]) => `${k}="${v}"`).join(', ');
      console.log(`   • "${r.guarantee}" → {${cells}}`);
    });
    if (rows.length > 5) console.log(`   ... (${rows.length - 5} lignes supplémentaires)`);
    
    return {
      headers,
      rows,
      confidence: parsed.confidence || 0.5,
      legend
    };
    
  } catch (error) {
    console.error('❌ Erreur extraction tableau Vision:', error);
    return null;
  }
}

/**
 * Convertit un tableau extrait en faits de couverture requêtables.
 * Les lignes marquées `is_section: true` par Gemini sont ignorées.
 * Les lignes dont toutes les cellules de formule sont vides sont également ignorées
 * (elles correspondent à des titres de section non marqués explicitement).
 */
export function tableToFacts(
  table: ExtractedTable,
  insurerCode: string,
  insuranceTypeCode: string,
  centralCgId: number,
  sourcePageId: number,
  sourcePageNumber: number
): CoverageFact[] {
  const facts: CoverageFact[] = [];
  
  // Les headers commencent après "Garanties" (première colonne)
  const formulaHeaders = table.headers.slice(1);
  
  table.rows.forEach((row: any, rowIndex) => {
    // Support dual format:
    // Object format: { guarantee: "...", formulas: { formule_1: "●", ... } }  ← nouveau
    // Array format:  ["guarantee_label", "●", "○", "✗"]                      ← ancien Gemini
    const isArrayRow = Array.isArray(row);
    const guaranteeLabel: string = isArrayRow ? String(row[0] || '') : (row.guarantee || '');
    const guaranteeKey = normalizeGuaranteeKey(guaranteeLabel);

    // Ignorer les lignes vides
    if (!guaranteeLabel.trim()) return;

    // Ignorer les titres de section explicitement marqués par Gemini
    if (!isArrayRow && row.is_section === true) {
      console.log(`   ℹ️  [tableToFacts] Titre de section ignoré : "${guaranteeLabel}"`);
      return;
    }

    // Collecter les valeurs de formule pour cette ligne
    const cellValues: string[] = formulaHeaders.map((formulaLabel, colIndex) => {
      const formulaKey = normalizeFormulaKey(formulaLabel);
      if (isArrayRow) {
        const rawCell = row[colIndex + 1];
        return rawCell !== undefined ? String(rawCell) : '';
      }
      const formulas = row.formulas || {};
      if (formulas[formulaKey] !== undefined) return String(formulas[formulaKey]);
      const geminiKeys = Object.keys(formulas);
      const matchingKey = geminiKeys.find(gk => normalizeFormulaKey(gk) === formulaKey);
      if (matchingKey !== undefined) return String(formulas[matchingKey]);
      if (colIndex < geminiKeys.length) return String(formulas[geminiKeys[colIndex]]);
      return '';
    });

    // Ignorer les lignes où TOUTES les cellules de formule sont vides (titre de section non marqué)
    const hasAnyContent = cellValues.some(v => v.trim() !== '');
    if (!hasAnyContent) {
      console.log(`   ℹ️  [tableToFacts] Ligne sans contenu (section ?) ignorée : "${guaranteeLabel}"`);
      return;
    }

    formulaHeaders.forEach((formulaLabel, colIndex) => {
      const formulaKey = normalizeFormulaKey(formulaLabel);
      const symbol = cellValues[colIndex];

      const parsed = parseStatus(symbol, table.legend);
      const coverageStatus = parsed.status;

      // Log détaillé pour diagnostiquer le mapping symbole → statut
      if (coverageStatus === 'excluded') {
        console.log(`   ⚠️  [tableToFacts] "${guaranteeLabel}" × "${formulaLabel}" : symbole="${symbol}" → ${coverageStatus}`);
      }

      facts.push({
        guarantee_key:   truncate(guaranteeKey,   90),
        guarantee_label: truncate(guaranteeLabel, 90),
        formula_key:     truncate(formulaKey,     90),
        formula_label:   truncate(formulaLabel,   90),
        coverage_status: coverageStatus,
        coverage_amount: parsed.amount ? truncate(parsed.amount, 200) : undefined,
        franchise:       parsed.franchise ? truncate(parsed.franchise, 100) : undefined,
      });
    });
  });
  
  return facts;
}

/**
 * Sauvegarde les faits de couverture dans la base
 */
export async function saveCoverageFacts(
  pool: Pool,
  facts: CoverageFact[],
  insurerCode: string,
  insuranceTypeCode: string,
  centralCgId: number,
  sourcePageId: number | null,
  sourcePageNumber: number
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const fact of facts) {
      await client.query(
        `INSERT INTO coverage_facts (
          insurer_code, insurance_type_code, central_cg_id,
          guarantee_key, guarantee_label,
          formula_key, formula_label,
          coverage_status, coverage_amount, franchise,
          source_page_id, source_page_number,
          extraction_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (insurer_code, insurance_type_code, central_cg_id, guarantee_key, formula_key)
        DO UPDATE SET
          guarantee_label = EXCLUDED.guarantee_label,
          formula_label = EXCLUDED.formula_label,
          coverage_status = CASE
            WHEN EXCLUDED.coverage_status = 'not_applicable'
              AND coverage_facts.coverage_status != 'not_applicable'
              THEN coverage_facts.coverage_status
            ELSE EXCLUDED.coverage_status
          END,
          coverage_amount = COALESCE(EXCLUDED.coverage_amount, coverage_facts.coverage_amount),
          franchise = COALESCE(EXCLUDED.franchise, coverage_facts.franchise),
          source_page_id = EXCLUDED.source_page_id,
          source_page_number = EXCLUDED.source_page_number,
          extraction_confidence = EXCLUDED.extraction_confidence,
          updated_at = CURRENT_TIMESTAMP`,
        [
          insurerCode,
          insuranceTypeCode,
          centralCgId,
          fact.guarantee_key,
          fact.guarantee_label,
          fact.formula_key,
          fact.formula_label,
          fact.coverage_status,
          fact.coverage_amount ?? null,
          fact.franchise ?? null,
          sourcePageId,
          sourcePageNumber,
          0.85
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`✅ Sauvegardé ${facts.length} faits de couverture`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Sauvegarde les faits de couverture extraits pour un CG utilisateur (user_coverage_facts)
 */
export async function saveUserCoverageFacts(
  pool: Pool,
  facts: CoverageFact[],
  insurerCode: string,
  insuranceTypeCode: string,
  userCgId: number,
  userId: number | null,
  sourcePageId: number | null,
  sourcePageNumber: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const fact of facts) {
      await client.query(
        `INSERT INTO user_coverage_facts (
          user_cg_id, user_id,
          insurer_code, insurance_type_code,
          guarantee_key, guarantee_label,
          formula_key, formula_label,
          coverage_status, coverage_amount,
          source_page_id, source_page_number,
          extraction_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_cg_id, guarantee_key, formula_key)
        DO UPDATE SET
          guarantee_label = EXCLUDED.guarantee_label,
          formula_label = EXCLUDED.formula_label,
          coverage_status = CASE
            WHEN EXCLUDED.coverage_status = 'not_applicable'
              AND user_coverage_facts.coverage_status != 'not_applicable'
              THEN user_coverage_facts.coverage_status
            ELSE EXCLUDED.coverage_status
          END,
          -- Conserver le montant existant si le nouveau est NULL
          coverage_amount = COALESCE(EXCLUDED.coverage_amount, user_coverage_facts.coverage_amount),
          source_page_id = EXCLUDED.source_page_id,
          source_page_number = EXCLUDED.source_page_number,
          extraction_confidence = EXCLUDED.extraction_confidence,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userCgId,
          userId,
          insurerCode,
          insuranceTypeCode,
          fact.guarantee_key,
          fact.guarantee_label,
          fact.formula_key,
          fact.formula_label,
          fact.coverage_status,
          fact.coverage_amount ?? null,
          sourcePageId,
          sourcePageNumber,
          0.85
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Sauvegardé ${facts.length} faits de couverture utilisateur`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
