// =============================================================================
// AnalysisAgent — Analyste de couverture
// Responsabilité : prendre les chunks RAG + profil utilisateur et produire
// une analyse structurée de couverture (couvert/partiel/non couvert).
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { Policy } from '../types';
import {
  AnalysisInput,
  CoverageFact,
  CoverageAnalysisResult,
  CoverageStatus,
  RAGChunk,
} from './types';

/** Construit le contexte documentaire à injecter dans le prompt */
function buildDocContext(chunks: RAGChunk[], label: string): string {
  if (chunks.length === 0) return '';
  const lines = chunks
    .slice(0, 6)
    .map((c, i) => `[${label} ${i + 1}] (similarité: ${c.similarity.toFixed(2)}) ${c.source}\n${c.content}`)
    .join('\n\n');
  return `\n=== ${label} ===\n${lines}\n`;
}

/** Construit le contexte structuré depuis coverage_facts (source primaire) */
function buildFactsContext(facts: CoverageFact[]): string {
  if (facts.length === 0) return '';

  // Grouper par formule
  const byFormula = new Map<string, CoverageFact[]>();
  for (const f of facts) {
    const key = f.formula_label || f.formula_key || 'Formule inconnue';
    if (!byFormula.has(key)) byFormula.set(key, []);
    byFormula.get(key)!.push(f);
  }

  let out = '\n=== GARANTIES STRUCTURÉES (source : conditions générales) ===\n';
  for (const [formula, flist] of byFormula) {
    out += `\nFormule "${formula}" :\n`;
    for (const f of flist) {
      const statusIcon = f.coverage_status === 'included' ? '✓'
        : f.coverage_status === 'excluded' ? '✗'
        : f.coverage_status === 'optional' ? '○' : '—';
      const amount = f.coverage_amount ? ` (${f.coverage_amount})` : '';
      const franchise = f.franchise ? ` [franchise: ${f.franchise}]` : '';
      out += `  ${statusIcon} ${f.guarantee_label}${amount}${franchise}\n`;
    }
  }
  return out;
}

/** Formate la liste des contrats de l'utilisateur */
function buildPolicySummary(policies: Policy[]): string {
  return policies
    .map(
      (p) =>
        `- "${p.name}" chez ${p.provider} — formule: ${p.coverageDetail || 'non précisée'}` +
        (p.summary ? ` — résumé: ${p.summary.slice(0, 200)}` : ''),
    )
    .join('\n');
}

export class AnalysisAgent {
  readonly name = 'AnalysisAgent';

  async analyze(input: AnalysisInput): Promise<CoverageAnalysisResult> {
    const { question, ragResult, policies, userProfile, coverageFacts = [], history = [] } = input;

    const ai = getAiClient();
    if (!ai) {
      return this.fallback(question);
    }

    // Source primaire : faits structurés (coverage_facts) — rapide et précis
    const factsContext = buildFactsContext(coverageFacts);
    // Source secondaire : chunks textuels RAG (détails supplémentaires)
    const docContext =
      buildDocContext(ragResult.cgChunks, 'Extraits CG') +
      buildDocContext(ragResult.policyChunks, 'Contrat utilisateur');

    const hasFacts = coverageFacts.length > 0;
    // URL CG : premier pdf_url disponible dans les faits (source fiable, issue de central_cg.url)
    const cgUrl: string | undefined = coverageFacts.find(f => f.pdf_url)?.pdf_url ?? undefined;
    const profileContext = userProfile
      ? `Profil: ${userProfile.adultsCount ?? 1} adulte(s), ${userProfile.childrenCount ?? 0} enfant(s), ` +
        `logement: ${userProfile.housingType ?? '?'}, statut: ${userProfile.housingStatus ?? '?'}`
      : '';

    // Contexte conversationnel (derniers échanges pour résoudre les questions de suivi)
    const historyContext = history.length > 0
      ? history
          .slice(-6)  // 3 derniers échanges
          .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text.slice(0, 400)}`)
          .join('\n')
      : '';

    const prompt = `Tu es un analyste expert en assurances. Réponds à cette question de manière RAPIDE et PRÉCISE.

${historyContext ? `HISTORIQUE RÉCENT DE LA CONVERSATION :\n${historyContext}\n\n` : ''}QUESTION ACTUELLE : ${question}

CONTRATS DE L'UTILISATEUR :
${buildPolicySummary(policies)}

${profileContext ? `PROFIL UTILISATEUR :\n${profileContext}\n` : ''}
${hasFacts ? factsContext : ''}
${!hasFacts || ragResult.totalChunks > 0 ? (docContext || '') : ''}
${!hasFacts && ragResult.totalChunks === 0 ? 'Aucun document trouvé dans la base.' : ''}

INSTRUCTIONS :
${hasFacts
  ? '- Les GARANTIES STRUCTURÉES sont la source principale et fiable. Base ta réponse dessus en priorité.'
  : '- Utilise les extraits disponibles pour répondre.'}
- Sois concis (3 phrases max pour le résumé)
- Si la garantie est "included" (✓) → status = "couvert"
- Si "excluded" (✗) → status = "non_couvert"
- Si mélange inclus/exclus selon formule → status = "partiel"
- Si aucune donnée → status = "inconnu"

Réponds UNIQUEMENT en JSON :
{
  "status": "couvert" | "partiel" | "non_couvert" | "inconnu",
  "summary": "Réponse concise (3 phrases max)",
  "garantie": "Nom de la garantie ou null",
  "montantMax": "Plafond ou null",
  "franchise": "Franchise ou null",
  "lacunes": ["lacune 1"],
  "sources": ["source 1"]
}`;

    try {
      const model = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
        'analysisAgent',
      );
      const result = await model.generateContent([prompt]);
      const text = result.response.text();
      const parsed = JSON.parse(text);

      return {
        status: (parsed.status as CoverageStatus) || 'inconnu',
        summary: parsed.summary || 'Analyse indisponible.',
        garantie: parsed.garantie || undefined,
        montantMax: parsed.montantMax || undefined,
        franchise: parsed.franchise || undefined,
        lacunes: Array.isArray(parsed.lacunes) ? parsed.lacunes : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        cgUrl,
        rawAnswer: text,
      };
    } catch (e: any) {
      console.error('[AnalysisAgent] Erreur LLM:', e.message);
      return this.fallback(question);
    }
  }

  private fallback(question: string): CoverageAnalysisResult {
    return {
      status: 'inconnu',
      summary: `Je n'ai pas pu analyser la couverture pour votre question. Vérifiez que vos contrats sont bien chargés.`,
      lacunes: [],
      sources: [],
    };
  }
}

export const analysisAgent = new AnalysisAgent();
