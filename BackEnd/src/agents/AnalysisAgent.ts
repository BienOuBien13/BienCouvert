// =============================================================================
// AnalysisAgent — Analyste de couverture
// Responsabilité : prendre les chunks RAG + profil utilisateur et produire
// une analyse structurée de couverture (couvert/partiel/non couvert).
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { Policy } from '../types';
import {
  AnalysisInput,
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
    const { question, ragResult, policies, userProfile } = input;

    const ai = getAiClient();
    if (!ai) {
      return this.fallback(question);
    }

    const docContext =
      buildDocContext(ragResult.cgChunks, 'CG Admin') +
      buildDocContext(ragResult.policyChunks, 'Contrat utilisateur');

    const profileContext = userProfile
      ? `Profil: ${userProfile.adultsCount ?? 1} adulte(s), ${userProfile.childrenCount ?? 0} enfant(s), ` +
        `logement: ${userProfile.housingType ?? '?'}, statut: ${userProfile.housingStatus ?? '?'}`
      : '';

    const prompt = `Tu es un analyste expert en assurances. Analyse cette question :

QUESTION : ${question}

CONTRATS DE L'UTILISATEUR :
${buildPolicySummary(policies)}

${profileContext ? `PROFIL UTILISATEUR :\n${profileContext}\n` : ''}
${docContext || 'Aucun document trouvé dans la base sémantique.'}

Réponds UNIQUEMENT en JSON avec cette structure exacte :
{
  "status": "couvert" | "partiel" | "non_couvert" | "inconnu",
  "summary": "Réponse concise en langage naturel (3 phrases max)",
  "garantie": "Nom de la garantie concernée ou null",
  "montantMax": "Plafond ou null",
  "franchise": "Montant franchise ou null",
  "lacunes": ["lacune 1", "lacune 2"],
  "sources": ["source 1", "source 2"]
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
