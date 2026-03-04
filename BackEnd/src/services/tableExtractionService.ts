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
 * Détermine le statut de couverture à partir d'un symbole ou texte de cellule
 */
function parseStatus(symbol: string): 'included' | 'optional' | 'excluded' | 'not_applicable' {
  const raw = symbol.trim();
  const s = raw.toLowerCase();

  // Vide
  if (!s) return 'not_applicable';

  // Inclus — symboles positifs
  if (/^(✓|✔|√|●|•)$/.test(raw)) return 'included';
  if (/^(oui|yes|inclus|included|compris|couvert|garanti)$/i.test(s)) return 'included';

  // Exclus — symboles négatifs (AVANT le fallback texte afin d'éviter faux positif)
  if (/^(✗|✘|×|✕)$/.test(raw)) return 'excluded';          // ballot x (U+2717, U+2718, U+00D7, U+2715)
  if (/^(x|×)$/.test(s)) return 'excluded';                   // lettre x seule
  if (/^(-|−|–|—|\.\.\.|--)$/.test(raw)) return 'excluded'; // tirets
  if (/^(non|no|exclu|excluded|non compris|néant|neant|nul|nulle)$/i.test(s)) return 'excluded';
  if (/\bexclu/i.test(s) && !/en option/i.test(s)) return 'excluded';

  // Optionnel
  if (/^(○|◯|⊙|opt)$/.test(raw)) return 'optional';
  if (/^(option|opt\.|en option|en sus|sur option|optionnel)$/i.test(s)) return 'optional';

  // N/A
  if (/^(n\/a|na|s\.o\.|sans objet|so|n\.a\.)$/i.test(s)) return 'not_applicable';

  // Texte contenant un montant ou description positive → inclus
  // ex: "1 500 €", "Plafond 500€", "Jusqu'à 3000€"
  if (/\d/.test(s) || s.length > 3) return 'included';

  return 'not_applicable';
}

/**
 * Extrait un tableau structuré depuis une image de page PDF via Gemini Vision
 */
export async function extractTableFromPageImage(
  pageImageBase64: string,
  insurerCode: string,
  insuranceTypeCode: string
): Promise<ExtractedTable | null> {
  try {
    const ai = getAiClient();
    if (!ai) {
      console.warn('⚠️ Gemini client non disponible');
      return null;
    }

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Tu es un expert en analyse de tableaux de garanties d'assurance français. Analyse cette image et extrait la matrice complète garanties × formules.

ÉTAPE 0 — LÉGENDE (OBLIGATOIRE avant d'analyser le tableau) :
Recherce d'abord une légende sur la page (souvent en bas ou en haut). La légende peut associer des symboles personnalisés à leur signification :
- Symboles classiques : ✓ ● • √ = inclus | ✗ ✘ × x - – = exclu | ○ ◯ = option
- Symboles personnalisés possibles : chiffres (1,2,3), lettres (A,B,C), icônes colorées, ou textes courts
Exemple de légende : "1 = inclus, 2 = en option, 3 = exclu" ou "■ = inclus, □ = exclu"
Si une légende est présente, applique-la STRICTEMENT lors du décodage des cellules.

FORMAT DE SORTIE (JSON strict, aucun autre texte) :
{
  "has_table": true,
  "legend": { "1": "included", "2": "optional", "3": "excluded" },
  "headers": ["Garanties", "FORMULE 1", "FORMULE 2", ...],
  "rows": [
    {
      "guarantee": "Responsabilité civile",
      "formulas": { "formule_1": "✓", "formule_2": "✓" }
    },
    {
      "guarantee": "Bris de glaces",
      "formulas": { "formule_1": "○", "formule_2": "✓" }
    }
  ],
  "confidence": 0.95
}

DÉCODAGE DES CELLULES (priorité à la légende si présente, sinon règles standard) :
- Cellule = "✓" "●" "•" "√" "oui" "yes" "inclus" ou équivalent légende → valeur JSON : "✓"
- Cellule = "✗" "✘" "×" "x" "X" "-" "–" "—" "non" "exclu" "néant" ou équivalent légende → valeur JSON : "✗"
- Cellule = "○" "◯" "option" "en option" "en sus" "sur option" ou équivalent légende → valeur JSON : "○"
- Cellule = vide ou "n/a" "s.o." "sans objet" → valeur JSON : ""
- Cellule = montant/texte ("1 500 €", "Jusqu'à 3000 €", "Plafond 500€") → valeur JSON : contenu exact du texte

NORMALISATION DES CLÉS DE FORMULES (snake_case) :
- Espaces → "_", "+" → "_plus", majuscules → minuscules, accents supprimés
- "Formule 2" → "formule_2", "TIERS ESSENTIEL+" → "tiers_essentiel_plus"

INSTRUCTIONS :
1. TOUJOURS chercher une légende en premier
2. Identifie TOUTES les lignes de garanties, y compris les sous-garanties en retrait
3. Identifie TOUTES les colonnes de formules
4. Applique la légende ou le décodage standard — NE PAS deviner
5. Si une garantie occupe plusieurs lignes, concatène avec " - "

Si pas de tableau visible : {"has_table": false, "confidence": 1.0}

RÉPONDS UNIQUEMENT AVEC LE JSON.`;

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
    
    return {
      headers: parsed.headers || [],
      rows: parsed.rows || [],
      confidence: parsed.confidence || 0.5
    };
    
  } catch (error) {
    console.error('❌ Erreur extraction tableau Vision:', error);
    return null;
  }
}

/**
 * Convertit un tableau extrait en faits de couverture requêtables
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
  
  table.rows.forEach((row, rowIndex) => {
    const guaranteeLabel = row.guarantee;
    const guaranteeKey = normalizeGuaranteeKey(guaranteeLabel);
    
    formulaHeaders.forEach((formulaLabel, colIndex) => {
      const formulaKey = normalizeFormulaKey(formulaLabel);

      // Multi-stratégie de lookup pour gérer les variantes de normalisation de Gemini
      let symbol = '';
      if (row.formulas[formulaKey] !== undefined) {
        // Stratégie 1: clé exacte (notre normalisation de l'en-tête)
        symbol = String(row.formulas[formulaKey]);
      } else {
        const geminiKeys = Object.keys(row.formulas);
        // Stratégie 2: clé Gemini qui normalise vers la même valeur (ex: "tiers_essentiel_" → "tiers_essentiel")
        const matchingKey = geminiKeys.find(gk => normalizeFormulaKey(gk) === formulaKey);
        if (matchingKey !== undefined) {
          symbol = String(row.formulas[matchingKey]);
        } else if (colIndex < geminiKeys.length) {
          // Stratégie 3: fallback positionnel (même colonne)
          symbol = String(row.formulas[geminiKeys[colIndex]]);
        }
      }

      const coverageStatus = parseStatus(symbol);

      facts.push({
        guarantee_key: guaranteeKey,
        guarantee_label: guaranteeLabel,
        formula_key: formulaKey,
        formula_label: formulaLabel,
        coverage_status: coverageStatus
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
          coverage_status,
          source_page_id, source_page_number,
          extraction_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (insurer_code, insurance_type_code, central_cg_id, guarantee_key, formula_key)
        DO UPDATE SET
          guarantee_label = EXCLUDED.guarantee_label,
          formula_label = EXCLUDED.formula_label,
          coverage_status = EXCLUDED.coverage_status,
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
          sourcePageId,
          sourcePageNumber,
          0.85 // Confiance par défaut
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
          coverage_status,
          source_page_id, source_page_number,
          extraction_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_cg_id, guarantee_key, formula_key)
        DO UPDATE SET
          guarantee_label = EXCLUDED.guarantee_label,
          formula_label = EXCLUDED.formula_label,
          coverage_status = EXCLUDED.coverage_status,
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
