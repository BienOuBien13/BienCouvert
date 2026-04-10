// =============================================================================
// OrchestratorAgent — Chef d'orchestre du système multi-agent BMAD
//
// Responsabilités :
//  1. Détecter l'intention du message (IntentAgent)
//  2. Construire un plan d'exécution (quels agents, dans quel ordre, en parallèle?)
//  3. Exécuter le plan avec gestion des erreurs par agent
//  4. Assembler la réponse finale avec streaming SSE optionnel
//  5. Analyser le circuit pour optimisations futures (OptimizerAgent)
// =============================================================================

import { Policy, Message, UserProfileData } from '../types';
import {
  AgentIntent,
  OrchestratorInput,
  OrchestratorOutput,
  ExecutionPlan,
  IntentResult,
  RAGResult,
  CoverageAnalysisResult,
  AdvisorResult,
  ClaimsResult,
  OptimizerResult,
  CircuitOptimization,
} from './types';
import { intentAgent } from './IntentAgent';
import { ragAgent } from './RAGAgent';
import { analysisAgent } from './AnalysisAgent';
import { advisorAgent } from './AdvisorAgent';
import { claimsAgent } from './ClaimsAgent';
import { optimizerAgent, PipelineMetrics } from './OptimizerAgent';
import { getAiClient, resolveCoverageFacts } from '../services/geminiService';
import { storage } from '../storage';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────

function formatCoverageResponse(
  analysis: CoverageAnalysisResult,
  advisor?: AdvisorResult,
): string {
  const statusEmoji: Record<string, string> = {
    couvert: '✅',
    partiel: '⚠️',
    non_couvert: '❌',
    inconnu: '❓',
  };

  let response = `${statusEmoji[analysis.status] || '❓'} ${analysis.summary}\n`;

  if (analysis.garantie) response += `\n- Garantie : ${analysis.garantie}`;
  if (analysis.montantMax) response += `\n- Plafond : ${analysis.montantMax}`;
  if (analysis.franchise) response += `\n- Franchise : ${analysis.franchise}`;

  if (analysis.lacunes.length > 0) {
    response += `\n\nPoints d'attention :\n`;
    analysis.lacunes.forEach((l) => (response += `- ${l}\n`));
  }

  if (analysis.sources.length > 0) {
    response += `\n[Source : ${analysis.sources.join(', ')}]`;
  }

  if (advisor && advisor.recommendations.length > 0) {
    response += `\n\nRecommandations :\n`;
    advisor.recommendations.forEach((r) => (response += `- ${r}\n`));
    response += `\n_${advisor.disclaimer}_`;
  }

  return response.trim();
}

function formatClaimsResponse(claims: ClaimsResult): string {
  const urgencyLabel: Record<string, string> = {
    high: '🚨 URGENT',
    medium: '⚠️ Important',
    low: 'ℹ️ Information',
  };

  let response = `${urgencyLabel[claims.urgencyLevel]} — Sinistre : ${claims.sinisterType}\n\n`;

  if (claims.coveringPolicies.length > 0) {
    response += `Contrats couvrant ce sinistre :\n`;
    claims.coveringPolicies.forEach((p) => (response += `- ${p}\n`));
    response += '\n';
  } else {
    response += '⚠️ Aucun contrat identifié pour ce type de sinistre. Vérifiez votre portefeuille.\n\n';
  }

  response += `Procédure à suivre :\n\n`;
  claims.steps.forEach((s) => {
    response += `**Étape ${s.step} — ${s.title}**\n${s.description}\n`;
    if (s.deadline) response += `⏱ Délai : ${s.deadline}\n`;
    if (s.contact) response += `📞 Contact : ${s.contact}\n`;
    response += '\n';
  });

  return response.trim();
}

function formatOptimizerResponse(result: OptimizerResult): string {
  if (result.findings.length === 0) {
    return 'Votre portefeuille semble équilibré. Ajoutez plus de contrats pour une analyse comparative approfondie.';
  }

  const typeLabel: Record<string, string> = {
    duplicate: '🔁 Doublon',
    gap: '🕳️ Lacune',
    saving: '💰 Économie',
  };

  let response = `Analyse de votre portefeuille :\n\n`;

  if (result.totalEstimatedSaving > 0) {
    response += `💡 Économie potentielle totale : **${result.totalEstimatedSaving}€/an**\n\n`;
  }

  result.prioritized.forEach((f) => {
    response += `${typeLabel[f.type] || '📌'} **${f.title}**\n`;
    response += `${f.description}\n`;
    response += `→ ${f.recommendation}\n`;
    if (f.estimatedSaving && f.estimatedSaving > 0) {
      response += `💰 Gain estimé : ${f.estimatedSaving}€/an\n`;
    }
    response += '\n';
  });

  return response.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Assemblage de la réponse générale via LLM (fallback / GENERAL)
// ─────────────────────────────────────────────────────────────────────────────

async function generateGeneralResponse(
  message: string,
  policies: Policy[],
  history: Message[],
): Promise<string> {
  const ai = getAiClient();
  if (!ai) return 'Service IA temporairement indisponible.';

  const historyText = history
    .slice(-6) // 3 derniers échanges
    .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const policyContext = policies
    .map((p) => `- ${p.name} chez ${p.provider} (${p.type})`)
    .join('\n');

  const prompt = `Tu es AssurClair, assistant expert en assurances.

CONTRATS DE L'UTILISATEUR :
${policyContext || 'Aucun contrat chargé.'}

HISTORIQUE RÉCENT :
${historyText || 'Début de conversation.'}

QUESTION : ${message}

Règles :
- Réponds en bullet points avec "-"
- Cite le nom exact du contrat concerné
- Sois concis (max 5 bullet points)
- Si tu ne sais pas, dis-le honnêtement sans inventer
- Pas de markdown gras (**) dans la réponse`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'orchestrator_general');
    const result = await model.generateContent([prompt]);
    return result.response.text() || 'Je ne peux pas répondre à cette question pour le moment.';
  } catch (e: any) {
    console.error('[Orchestrator] Erreur réponse générale:', e.message);
    return 'Désolé, une erreur est survenue. Réessayez dans quelques instants.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OrchestratorAgent
// ─────────────────────────────────────────────────────────────────────────────

export class OrchestratorAgent {
  readonly name = 'OrchestratorAgent';

  /**
   * Point d'entrée principal — traite un message utilisateur avec l'ensemble des agents.
   * @param input - Message + userId + policies + historique
   * @param onChunk - Callback SSE de streaming (optionnel)
   */
  async run(
    input: OrchestratorInput,
    onChunk?: (chunk: string) => void,
  ): Promise<OrchestratorOutput> {
    const { message, userId, policies, history, userProfile } = input;
    const startTime = Date.now();
    const agentsUsed: string[] = [];
    const circuitOptimizations: CircuitOptimization[] = [];

    const logAgent = (name: string) => agentsUsed.push(name);

    // ── Étape 1 : Détection d'intention ─────────────────────────────────────
    logAgent(intentAgent.name);
    const intent = await intentAgent.detect(message);
    console.log(`[Orchestrator] Intent=${intent.intent} (confidence=${intent.confidence.toFixed(2)}) subtype=${intent.subtype || '-'}`);

    // Extraire les codes assureurs (insurerCode = "MAAF01" etc.) — PAS le label texte
    // car les requêtes SQL filtrent sur insurer_code et non sur le label affiché.
    const insurers = [...new Set(policies.map((p: any) => p.insurerCode || '').filter(Boolean))];
    const policyIds = policies.map((p) => String(p.id));

    let response = '';

    // ═══════════════════════════════════════════════════════════════════════
    // ROUTAGE PAR INTENTION
    // ═══════════════════════════════════════════════════════════════════════

    switch (intent.intent) {

      // ── QUESTION DE GARANTIE ────────────────────────────────────────────
      case 'QUESTION_GARANTIE':
      case 'CONSEIL': {
        // RAG + coverage_facts en parallèle (indépendants)
        logAgent(ragAgent.name);
        const [ragResult, coverageFacts] = await Promise.all([
          ragAgent.search({ query: message, userId, policyIds, insurers }),
          resolveCoverageFacts(storage, policies, 'Orchestrator').catch(() => []),
        ]);

        if (coverageFacts.length > 0) {
          console.log(`[Orchestrator] ${coverageFacts.length} faits structurés chargés depuis coverage_facts`);
        }

        // Optimisation circuit
        const metrics: PipelineMetrics = {
          ragCacheHit: ragResult.fromCache,
          ragChunksFound: ragResult.totalChunks,
          policyCount: policies.length,
          hasUserProfile: !!userProfile,
          intentConfidence: intent.confidence,
        };
        circuitOptimizations.push(...optimizerAgent.analyzeCircuit(metrics));

        logAgent(analysisAgent.name);
        const analysis = await analysisAgent.analyze({ question: message, ragResult, policies, userProfile, coverageFacts, history });

        let advisor: AdvisorResult | undefined;
        if (intent.intent === 'CONSEIL' || analysis.lacunes.length > 0) {
          logAgent(advisorAgent.name);
          advisor = await advisorAgent.advise({ analysis, policies, userProfile, question: message });
        }

        response = formatCoverageResponse(analysis, advisor);
        break;
      }

      // ── SINISTRE ────────────────────────────────────────────────────────
      case 'SINISTRE': {
        // RAG + ClaimsAgent en parallèle (optimisation circuit)
        logAgent(ragAgent.name);
        logAgent(claimsAgent.name);

        const sinisterType = intent.subtype || message;

        const [ragResult, claimsResult] = await Promise.all([
          ragAgent.search({ query: message, userId, policyIds, insurers }),
          claimsAgent.guide({ sinisterType, policies, userId }),
        ]);

        const metrics: PipelineMetrics = {
          ragCacheHit: ragResult.fromCache,
          ragChunksFound: ragResult.totalChunks,
          policyCount: policies.length,
          hasUserProfile: !!userProfile,
          intentConfidence: intent.confidence,
        };
        circuitOptimizations.push(...optimizerAgent.analyzeCircuit(metrics));

        response = formatClaimsResponse(claimsResult);
        break;
      }

      // ── OPTIMISATION ────────────────────────────────────────────────────
      case 'OPTIMISATION': {
        if (policies.length < 2) {
          response = 'Ajoutez au moins 2 contrats pour bénéficier de l\'analyse comparative.';
          break;
        }

        // RAG + Optimizer en parallèle
        logAgent(ragAgent.name);
        logAgent(optimizerAgent.name);

        const [ragResult, optimizerResult] = await Promise.all([
          ragAgent.search({ query: message, userId, policyIds, insurers }),
          optimizerAgent.optimize({ policies, userProfile }),
        ]);

        // Re-lancer l'optimizer avec les chunks RAG pour plus de précision
        if (ragResult.cgChunks.length > 0) {
          const enrichedResult = await optimizerAgent.optimize({ policies, userProfile, ragResult });
          response = formatOptimizerResponse(enrichedResult);
        } else {
          response = formatOptimizerResponse(optimizerResult);
        }

        circuitOptimizations.push(
          ...optimizerResult.circuitOptimizations,
        );
        break;
      }

      // ── UPLOAD ──────────────────────────────────────────────────────────
      case 'UPLOAD': {
        response =
          'Pour ajouter un contrat, utilisez le bouton "+" dans votre espace Mes Contrats. ' +
          'Vous pouvez uploader un PDF — il sera automatiquement analysé et indexé.';
        break;
      }

      // ── GENERAL (fallback) ───────────────────────────────────────────────
      default: {
        logAgent('GeneralLLM');
        response = await generateGeneralResponse(message, policies, history);
        break;
      }
    }

    // ── Streaming SSE si callback fourni ────────────────────────────────────
    if (onChunk && response) {
      // Découpe la réponse en chunks de ~80 caractères pour simuler le streaming
      const chunkSize = 80;
      for (let i = 0; i < response.length; i += chunkSize) {
        onChunk(response.slice(i, i + chunkSize));
        // Petite pause pour ne pas saturer le pipe SSE
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    const processingMs = Date.now() - startTime;

    console.log(
      `[Orchestrator] Terminé en ${processingMs}ms — ` +
      `agents: [${agentsUsed.join(', ')}] — ` +
      `${circuitOptimizations.length} optimisation(s) circuit`,
    );

    return {
      response,
      intent: intent.intent,
      agentsUsed,
      processingMs,
      optimizations: circuitOptimizations,
    };
  }

  /**
   * Version streaming pour la route /chat/stream (SSE).
   * Chaque chunk est retourné via onChunk avant la résolution finale.
   */
  async runStream(
    input: OrchestratorInput,
    onChunk: (chunk: string) => void,
  ): Promise<OrchestratorOutput> {
    return this.run(input, onChunk);
  }
}

export const orchestratorAgent = new OrchestratorAgent();
