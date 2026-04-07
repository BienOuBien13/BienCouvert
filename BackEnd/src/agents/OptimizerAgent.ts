// =============================================================================
// OptimizerAgent — Optimiseur de portefeuille ET de circuit IA
// Deux responsabilités complémentaires :
//  1. Analyser le portefeuille assurance → trouver doublons, lacunes, économies
//  2. Analyser le pipeline d'exécution → proposer des raccourcis d'orchestration
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { Policy } from '../types';
import {
  OptimizerInput,
  OptimizerResult,
  CircuitOptimization,
  RAGResult,
} from './types';
import { OptimizationFinding } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Analyse du circuit IA (meta-optimisation)
// ─────────────────────────────────────────────────────────────────────────────

interface PipelineMetrics {
  ragCacheHit: boolean;
  ragChunksFound: number;
  policyCount: number;
  hasUserProfile: boolean;
  intentConfidence: number;
}

/**
 * Analyse le pipeline d'exécution et retourne des optimisations circuit.
 * Ne nécessite pas d'appel LLM — logique déterministe rapide.
 */
function analyzeCircuit(metrics: PipelineMetrics): CircuitOptimization[] {
  const optimizations: CircuitOptimization[] = [];

  // ── Cache hit RAG → skip embedding ──────────────────────────────────────
  if (metrics.ragCacheHit) {
    optimizations.push({
      type: 'cache_hit',
      agentAffected: 'RAGAgent',
      description: 'Résultat RAG servi depuis le cache Redis — embedding Gemini économisé',
      estimatedGainMs: 800,
    });
  }

  // ── Peu de chunks → skip AnalysisAgent complet ────────────────────────────
  if (metrics.ragChunksFound === 0) {
    optimizations.push({
      type: 'shortcut',
      agentAffected: 'AnalysisAgent',
      description: 'Aucun chunk RAG trouvé — réponse générique sans appel LLM d\'analyse',
      estimatedGainMs: 2000,
    });
  }

  // ── Profil absent → skip AdvisorAgent ────────────────────────────────────
  if (!metrics.hasUserProfile) {
    optimizations.push({
      type: 'skip',
      agentAffected: 'AdvisorAgent',
      description: 'Profil utilisateur incomplet — conseils personnalisés non disponibles',
      estimatedGainMs: 1500,
    });
  }

  // ── Une seule police → le comparatif OptimizerAgent n'a pas de sens ──────
  if (metrics.policyCount <= 1) {
    optimizations.push({
      type: 'skip',
      agentAffected: 'OptimizerAgent',
      description: 'Moins de 2 contrats — analyse des doublons non pertinente',
      estimatedGainMs: 2500,
    });
  }

  // ── Intent haute confiance → on peut lancer RAG + ClaimsTemplate en parallèle
  if (metrics.intentConfidence >= 0.85) {
    optimizations.push({
      type: 'parallel',
      agentAffected: 'RAGAgent + ClaimsAgent',
      description: 'Intention détectée avec haute confiance — RAG et templates sinistre lancés en parallèle',
      estimatedGainMs: 1200,
    });
  }

  return optimizations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analyse du portefeuille assurance
// ─────────────────────────────────────────────────────────────────────────────

export class OptimizerAgent {
  readonly name = 'OptimizerAgent';

  /**
   * Analyse portefeuille + circuit.
   * @param input - Polices + profil + résultat RAG (pour enrichir l'analyse)
   * @param pipelineMetrics - Métriques du pipeline courant (pour analyzeCircuit)
   */
  async optimize(
    input: OptimizerInput,
    pipelineMetrics?: PipelineMetrics,
  ): Promise<OptimizerResult> {
    const { policies, userProfile, ragResult } = input;

    // ── Analyse circuit (toujours rapide, pas de LLM) ────────────────────────
    const circuitOptimizations = pipelineMetrics
      ? analyzeCircuit(pipelineMetrics)
      : [];

    // ── Analyse portefeuille → nécessite au moins 2 polices ─────────────────
    if (!policies || policies.length < 2) {
      return {
        findings: [],
        totalEstimatedSaving: 0,
        circuitOptimizations,
        prioritized: [],
      };
    }

    const ai = getAiClient();
    if (!ai) {
      return { findings: [], totalEstimatedSaving: 0, circuitOptimizations, prioritized: [] };
    }

    // Enrichir avec les chunks RAG si disponibles
    const cgContext = ragResult && ragResult.cgChunks.length > 0
      ? '\n\nEXTRAITS CG DISPONIBLES :\n' +
        ragResult.cgChunks.slice(0, 4).map((c) => `[${c.source}]\n${c.content.slice(0, 500)}`).join('\n\n')
      : '';

    const policyList = policies
      .map(
        (p) =>
          `- ID:${p.id} "${p.name}" chez ${p.provider} (${p.type}) — ` +
          `formule: ${p.coverageDetail || '?'} — prime: ${p.annualPremium ? p.annualPremium + '€/an' : 'inconnue'}` +
          (p.summary ? ` — ${p.summary.slice(0, 150)}` : ''),
      )
      .join('\n');

    const profileContext = userProfile
      ? `Profil: ${userProfile.adultsCount ?? 1} adultes, ${userProfile.childrenCount ?? 0} enfants, ` +
        `${userProfile.housingStatus || '?'}, ${userProfile.vehiclesCount ?? 0} véhicule(s)`
      : 'Profil non renseigné';

    const prompt = `Tu es un expert en optimisation d'assurances. Analyse ce portefeuille :

${policyList}

PROFIL CLIENT : ${profileContext}
${cgContext}

Identifie :
1. DOUBLONS : garanties couvertes par 2 contrats différents
2. LACUNES : risques importants non couverts selon le profil
3. ÉCONOMIES : contrats sous-utilisés ou formules inadaptées

Pour chaque finding, estime l'économie annuelle potentielle en euros si applicable.
Priorise par impact (high > medium > low).

Réponds UNIQUEMENT en JSON :
{
  "findings": [
    {
      "title": "Titre court",
      "description": "Explication détaillée",
      "type": "duplicate" | "gap" | "saving",
      "severity": "low" | "medium" | "high",
      "involvedPolicies": ["nom police 1", "nom police 2"],
      "estimatedSaving": 150,
      "recommendation": "Action recommandée",
      "comparisonDetails": { "policyA": "nom", "policyB": "nom", "overlap": "description chevauchement" }
    }
  ],
  "totalEstimatedSaving": 300
}`;

    try {
      const model = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
        'optimizerAgent',
      );
      const result = await model.generateContent([prompt]);
      const parsed = JSON.parse(result.response.text());

      const findings: OptimizationFinding[] = Array.isArray(parsed.findings) ? parsed.findings : [];
      const totalEstimatedSaving: number = parsed.totalEstimatedSaving || 0;

      // Top 3 par sévérité
      const severityOrder = { high: 0, medium: 1, low: 2 };
      const prioritized = [...findings]
        .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
        .slice(0, 3);

      return {
        findings,
        totalEstimatedSaving,
        circuitOptimizations,
        prioritized,
      };
    } catch (e: any) {
      console.error('[OptimizerAgent] Erreur LLM:', e.message);
      return { findings: [], totalEstimatedSaving: 0, circuitOptimizations, prioritized: [] };
    }
  }

  /**
   * Expose la fonction d'analyse circuit directement
   * (utilisée par l'orchestrateur sans analyse portefeuille)
   */
  analyzeCircuit(metrics: PipelineMetrics): CircuitOptimization[] {
    return analyzeCircuit(metrics);
  }
}

export const optimizerAgent = new OptimizerAgent();
export type { PipelineMetrics };
