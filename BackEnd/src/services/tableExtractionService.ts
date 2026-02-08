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
 */
function normalizeFormulaKey(label: string): string {
  return normalizeGuaranteeKey(label);
}

/**
 * Détermine le statut de couverture à partir d'un symbole
 */
function parseStatus(symbol: string): 'included' | 'optional' | 'excluded' | 'not_applicable' {
  const s = symbol.trim().toLowerCase();
  
  // Inclus
  if (/^(✓|✔|√|●|•|oui|yes|inclus|included)$/i.test(s)) {
    return 'included';
  }
  
  // Optionnel
  if (/^(○|◯|⊙|option|opt\.|en option)$/i.test(s)) {
    return 'optional';
  }
  
  // Exclu
  if (/^(-|−|–|—|non|no|exclu|excluded)$/i.test(s)) {
    return 'excluded';
  }
  
  // N/A ou vide
  if (!s || /^(n\/a|na|s\.o\.|sans objet)$/i.test(s)) {
    return 'not_applicable';
  }
  
  // Par défaut, considérer comme inclus si présence d'un montant/texte
  if (s.length > 0 && !/exclu|non/i.test(s)) {
    return 'included';
  }
  
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

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const prompt = `Tu es un expert en analyse de documents d'assurance. Analyse cette image de page de conditions générales et extrait le tableau de garanties s'il existe.

OBJECTIF:
Extraire la matrice garanties × formules avec le statut de chaque couverture.

FORMAT DE SORTIE (JSON strict):
{
  "has_table": true/false,
  "headers": ["Garanties", "TIERS ECO", "TIERS ESSENTIEL", "TOUS RISQUES CONFORT", ...],
  "rows": [
    {
      "guarantee": "Responsabilité civile",
      "formulas": {
        "tiers_eco": "✓",
        "tiers_essentiel": "✓",
        "tous_risques_confort": "✓"
      }
    },
    {
      "guarantee": "Bris de glaces",
      "formulas": {
        "tiers_eco": "○",
        "tiers_essentiel": "✓",
        "tous_risques_confort": "✓"
      }
    }
  ],
  "confidence": 0.95
}

LÉGENDE SYMBOLES:
- ✓ ou ● = garantie incluse
- ○ = garantie en option
- - ou vide = garantie exclue

INSTRUCTIONS:
1. Identifie s'il y a un tableau de synthèse des garanties
2. Extrait les en-têtes (noms des formules en colonnes)
3. Extrait chaque ligne (garantie + statuts par formule)
4. Normalise les clés de formules en snake_case (ex: "TIERS ESSENTIEL" → "tiers_essentiel")
5. Préserve les symboles exacts (✓, ○, -)
6. Indique ta confiance (0-1)

Si pas de tableau: {"has_table": false, "confidence": 1.0}

RÉPONDS UNIQUEMENT AVEC LE JSON, AUCUN TEXTE SUPPLÉMENTAIRE.`;

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
      const symbol = row.formulas[formulaKey] || '';
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
