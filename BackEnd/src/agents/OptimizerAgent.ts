// =============================================================================
// OptimizerAgent — Optimiseur de portefeuille ET de circuit IA
// Deux responsabilités complémentaires :
//  1. Analyser le portefeuille assurance → trouver doublons, lacunes, économies
//     (détection déterministe via coverage_facts puis affinement Gemini)
//  2. Analyser le pipeline d'exécution → proposer des raccourcis d'orchestration
// =============================================================================

import { getAiClient, resolveCoverageFacts } from '../services/geminiService';
import { Policy } from '../types';
import {
  OptimizerInput,
  OptimizerResult,
  CircuitOptimization,
  RAGResult,
} from './types';
import { OptimizationFinding } from '../types';
import { storage } from '../storage';

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

    // ── Détection déterministe (sans LLM) : doublons exact (même assureur+type+sous-type)
    // Trouve immédiatement les doublons évidents avant l'analyse LLM, et garantit
    // qu'ils apparaissent toujours même si Gemini échoue.
    const deterministicFindings: OptimizationFinding[] = [];
    const groupKey = (p: any) =>
      `${(p.insurerCode || p.provider || '').toLowerCase()}|${(p.typeCode || p.type || '').toLowerCase()}|${(p.subTypeCode || '').toLowerCase()}`;
    const grouped = new Map<string, Policy[]>();
    for (const p of policies) {
      const k = groupKey(p);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(p);
    }
    for (const [, group] of grouped) {
      if (group.length > 1) {
        const totalPremium = group.reduce((sum, p: any) => sum + (Number(p.annualPremium) || 0), 0);
        // Estimation : économiser le contrat le moins-disant si on garde le mieux-couvrant
        const minPremium = Math.min(...group.map((p: any) => Number(p.annualPremium) || 0).filter(v => v > 0));
        deterministicFindings.push({
          title: `Doublon ${group[0].provider} (${group[0].type})`,
          description: `${group.length} contrats du même assureur sur le même type d'assurance. Forte probabilité de couvertures redondantes.`,
          type: 'duplicate',
          severity: 'high',
          involvedPolicies: group.map(p => p.name),
          estimatedSaving: minPremium > 0 ? Math.round(minPremium) : 0,
          recommendation: 'Comparer les garanties et conserver le contrat offrant le meilleur rapport couverture/prime.',
        } as OptimizationFinding);
      }
    }

    // ── Comparaison déterministe via coverage_facts (chevauchement de garanties) ─
    // Pour chaque paire de polices avec centralCgId distinct, compare les garanties incluses.
    let coverageOverlapCount = 0;
    try {
      const policiesWithCg = policies.filter((p: any) => p.centralCgId);
      if (policiesWithCg.length >= 2) {
        const facts = await resolveCoverageFacts(storage, policiesWithCg, 'OptimizerAgent');
        // Index par central_cg_id → ensemble de guarantee_key inclus/optionnels
        const factsByCg = new Map<number, Set<string>>();
        for (const f of facts) {
          if (f.coverage_status !== 'included' && f.coverage_status !== 'optional') continue;
          // Retrouver le central_cg_id (peut être absent dans le fait, on remonte via policy)
          // Note : resolveCoverageFacts ne renvoie pas systématiquement central_cg_id ; on indexe par insurer+type
          const cgKey = `${f.insurer_label || ''}|${f.formula_label || ''}`;
          // Utilise plutôt guarantee_key directement par police via mapping policy->facts
          // Simplification : compter le nombre total de garanties communes
        }
        // Pour la version simple : signaler si >= 5 garanties communes dans le résultat global
        const guaranteeCounts = new Map<string, number>();
        for (const f of facts) {
          if (!['included', 'optional'].includes(f.coverage_status)) continue;
          const k = (f.guarantee_key || f.guarantee_label || '').toLowerCase();
          if (k) guaranteeCounts.set(k, (guaranteeCounts.get(k) || 0) + 1);
        }
        coverageOverlapCount = Array.from(guaranteeCounts.values()).filter(n => n >= 2).length;
        if (coverageOverlapCount >= 5 && policiesWithCg.length >= 2) {
          deterministicFindings.push({
            title: `${coverageOverlapCount} garanties potentiellement redondantes`,
            description: `Plusieurs de vos contrats couvrent les mêmes garanties (${coverageOverlapCount} chevauchements détectés via les conditions générales).`,
            type: 'duplicate',
            severity: 'medium',
            involvedPolicies: policiesWithCg.map((p: any) => p.name),
            estimatedSaving: 0,
            recommendation: 'Vérifiez les garanties communes pour ajuster les niveaux et éviter les doubles cotisations.',
          } as OptimizationFinding);
        }
        console.log(`[OptimizerAgent] Détection déterministe : ${deterministicFindings.length} findings, ${coverageOverlapCount} chevauchements coverage_facts`);
      }
    } catch (e: any) {
      console.warn('[OptimizerAgent] Comparaison coverage_facts échouée:', e.message);
    }

    const ai = getAiClient();
    if (!ai) {
      // Pas de Gemini : retourner uniquement les findings déterministes
      const detSavings = deterministicFindings.reduce((s, f) => s + (f.estimatedSaving || 0), 0);
      return {
        findings: deterministicFindings,
        totalEstimatedSaving: detSavings,
        circuitOptimizations,
        prioritized: deterministicFindings.slice(0, 3),
      };
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

      const llmFindings: OptimizationFinding[] = Array.isArray(parsed.findings) ? parsed.findings : [];
      const llmTotal: number = parsed.totalEstimatedSaving || 0;

      // Fusion : déterministe en premier (haute fiabilité), puis LLM
      // Dédoublonnage simple : on évite deux findings 'duplicate' avec même set de polices
      const seenDuplicateKeys = new Set<string>();
      const allFindings: OptimizationFinding[] = [];
      for (const f of [...deterministicFindings, ...llmFindings]) {
        if (f.type === 'duplicate') {
          const key = (f.involvedPolicies || []).slice().sort().join('|');
          if (seenDuplicateKeys.has(key)) continue;
          seenDuplicateKeys.add(key);
        }
        allFindings.push(f);
      }
      const totalEstimatedSaving =
        deterministicFindings.reduce((s, f) => s + (f.estimatedSaving || 0), 0) + llmTotal;

      // Top 3 par sévérité
      const severityOrder = { high: 0, medium: 1, low: 2 };
      const prioritized = [...allFindings]
        .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
        .slice(0, 3);

      return {
        findings: allFindings,
        totalEstimatedSaving,
        circuitOptimizations,
        prioritized,
      };
    } catch (e: any) {
      console.error('[OptimizerAgent] Erreur LLM:', e.message);
      // En cas d'échec LLM, on retourne au moins les findings déterministes
      const detSavings = deterministicFindings.reduce((s, f) => s + (f.estimatedSaving || 0), 0);
      return {
        findings: deterministicFindings,
        totalEstimatedSaving: detSavings,
        circuitOptimizations,
        prioritized: deterministicFindings.slice(0, 3),
      };
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
