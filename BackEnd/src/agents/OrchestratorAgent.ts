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

  if (analysis.cgUrl) {
    response += `\n📄 [Consulter les conditions générales](${analysis.cgUrl})`;
  }

  if (advisor && advisor.recommendations.length > 0) {
    response += `\n\nRecommandations :\n`;
    advisor.recommendations.forEach((r) => (response += `- ${r}\n`));
    response += `\n_${advisor.disclaimer}_`;
  }

  return response.trim();
}

function formatClaimsResponse(claims: ClaimsResult, coverageFacts: any[] = []): string {
  // ── Demande de clarification (quel contrat ?) ──────────────────────────────
  if (claims.needsClarification) {
    return `❓ **Précisez votre contrat**\n\n${claims.needsClarification}`;
  }

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

  // ── Garanties AVANT la procédure ─────────────────────────────────────────
  // On n'affiche cette section que si les étapes n'embarquent pas déjà les
  // garanties (cas buildStepsFromFacts qui injecte "✅ Garanties applicables" dans step 2)
  const stepsAlreadyEmbedFacts = claims.steps.some(
    s => s.description.includes('✅ Garanties applicables'),
  );

  if (!stepsAlreadyEmbedFacts && coverageFacts.length > 0) {
    const sTypeNorm = claims.sinisterType
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const sKeywords = sTypeNorm.split(/[\s_]+/).filter(w => w.length > 3);

    const relevant = coverageFacts.filter((f: any) => {
      const label = (f.guarantee_label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const key   = (f.guarantee_key   || '').toLowerCase();
      return sKeywords.some(kw => label.includes(kw) || key.includes(kw));
    });

    // N'afficher le fallback générique que si on a des faits pertinents — pas de bruit
    const factsToShow = relevant.slice(0, 6);

    if (factsToShow.length > 0) {
      response += `📋 Garanties applicables :\n`;
      const statusEmoji: Record<string, string> = {
        included:       '✅',
        excluded:       '❌',
        optional:       '⚙️',
        not_applicable: '—',
      };
      factsToShow.forEach((f: any) => {
        const emoji = statusEmoji[f.coverage_status] ?? '❓';
        let line = `${emoji} ${f.guarantee_label}`;
        if (f.formula_label) line += ` _(${f.formula_label})_`;
        if (f.coverage_amount) line += ` — Plafond : ${f.coverage_amount}`;
        if (f.franchise)       line += ` — Franchise : ${f.franchise}`;
        response += `${line}\n`;
      });
      response += '\n';
    }
  }

  if (claims.steps.length > 0) {
    response += `Procédure à suivre :\n\n`;
    claims.steps.forEach((s) => {
      response += `**Étape ${s.step} — ${s.title}**\n${s.description}\n`;
      if (s.deadline) response += `⏱ Délai : ${s.deadline}\n`;
      if (s.contact) response += `📞 Contact : ${s.contact}\n`;
      response += '\n';
    });
  }

  // ── Liens vers les conditions générales ───────────────────────────────────
  if (claims.cgUrls && claims.cgUrls.length > 0) {
    response += `📄 Conditions générales :\n`;
    claims.cgUrls.forEach(({ policyName, url }) => {
      response += `- [${policyName}](${url})\n`;
    });
    response += '\n';
  }

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

  // Détection rapide des questions hors-assurance (sans appel LLM)
  const msgNorm = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const INSURANCE_SIGNALS = [
    'assurance', 'assure', 'couvert', 'contrat', 'garantie', 'sinistre', 'police',
    'franchise', 'cotisation', 'prime', 'resilie', 'resiliation', 'indemnisation',
    'prevoyance', 'mutuelle', 'habitation', 'automobile', 'sante', 'prevoyance',
    'portefeuille', 'formule', 'maif', 'maaf', 'macif', 'axa', 'allianz', 'mma',
    'matmut', 'april', 'coverage', 'claim', 'policy',
  ];
  const OFF_TOPIC_SIGNALS = [
    'recette', 'cuisine', 'cuire', 'cuisson', 'ingredient', 'plat', 'repas', 'meteo',
    'temperature', 'sport', 'foot', 'tennis', 'basket', 'blague', 'chanson', 'film',
    'livre', 'roman', 'jeu video', 'programmation', 'code', 'algorithme', 'mathematique',
    'histoire', 'geographie', 'capitale', 'calcul', 'traduction', 'langue', 'politique',
    'president', 'actualite', 'news', 'voyage', 'hotel', 'billet', 'vol',
  ];
  const hasInsuranceSignal = INSURANCE_SIGNALS.some(s => msgNorm.includes(s));
  const hasOffTopicSignal  = OFF_TOPIC_SIGNALS.some(s => msgNorm.includes(s));

  // Réponse immédiate si clairement hors-sujet (pas de signal assurance ET signal off-topic)
  if (!hasInsuranceSignal && hasOffTopicSignal) {
    return 'Je suis l\'assistant IA de BienCouvert, spécialisé en assurances. Je ne peux pas vous aider sur ce sujet.';
  }

  const historyText = history
    .slice(-6) // 3 derniers échanges
    .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const policyContext = policies
    .map((p) => `- ${p.name} chez ${p.provider} (${p.type})`)
    .join('\n');

  const prompt = `Tu es l'assistant IA de BienCouvert, uniquement spécialisé en assurances.

CONTRATS DE L'UTILISATEUR :
${policyContext || 'Aucun contrat chargé.'}

HISTORIQUE RÉCENT :
${historyText || 'Début de conversation.'}

QUESTION : ${message}

Règles STRICTES :
- Si la question ne concerne PAS l'assurance, réponds UNIQUEMENT : "Je suis l'assistant IA de BienCouvert, spécialisé en assurances. Je ne peux pas vous aider sur ce sujet."
- Si la question concerne l'assurance, réponds en bullet points avec "-", max 5 points
- Cite le nom exact du contrat concerné si applicable
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
    let structured: any = undefined;

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
        // AdvisorAgent uniquement pour les demandes de CONSEIL explicites.
        // Pour QUESTION_GARANTIE, on répond seulement à la question posée sans générer de recommandations.
        if (intent.intent === 'CONSEIL') {
          logAgent(advisorAgent.name);
          advisor = await advisorAgent.advise({ analysis, policies, userProfile, question: message });
        }

        response = formatCoverageResponse(analysis, advisor);
        // Format structuré : permet au front d'afficher une card avec badges status/montant/franchise
        structured = {
          kind: 'coverage',
          status: analysis.status,
          summary: analysis.summary,
          garantie: analysis.garantie || null,
          montantMax: analysis.montantMax || null,
          franchise: analysis.franchise || null,
          lacunes: analysis.lacunes || [],
          sources: analysis.sources || [],
          cgUrl: analysis.cgUrl || null,
          recommendations: advisor?.recommendations || [],
          urgencyLevel: advisor?.urgencyLevel || 'low',
        };
        break;
      }

      // ── SINISTRE ────────────────────────────────────────────────────────
      case 'SINISTRE': {
        // ClaimsAgent + coverage_facts en parallèle pour enrichir la réponse
        logAgent(claimsAgent.name);
        const sinisterType = intent.subtype || message;
        const [claimsResult, coverageFacts] = await Promise.all([
          claimsAgent.guide({ sinisterType, policies, userId }),
          resolveCoverageFacts(storage, policies, 'Orchestrator/sinistre').catch(() => []),
        ]);
        if (coverageFacts.length > 0) {
          console.log(`[Orchestrator] ${coverageFacts.length} faits structurés chargés (sinistre)`);
        }
        response = formatClaimsResponse(claimsResult, coverageFacts);
        structured = {
          kind: 'claims',
          sinisterType: claimsResult.sinisterType,
          urgencyLevel: claimsResult.urgencyLevel,
          coveringPolicies: claimsResult.coveringPolicies,
          steps: claimsResult.steps,
          cgUrls: claimsResult.cgUrls || [],
          needsClarification: claimsResult.needsClarification || null,
        };
        break;
      }

      // ── OPTIMISATION ────────────────────────────────────────────────────
      case 'OPTIMISATION': {
        if (policies.length < 2) {
          response = 'Ajoutez au moins 2 contrats pour bénéficier de l\'analyse comparative.';
          break;
        }

        // RAG d'abord (rapide ~200ms), puis optimizer une seule fois avec les chunks
        logAgent(ragAgent.name);
        logAgent(optimizerAgent.name);

        const ragResult = await ragAgent.search({ query: message, userId, policyIds, insurers });
        const optimizerResult = await optimizerAgent.optimize({
          policies,
          userProfile,
          ragResult: ragResult.cgChunks.length > 0 ? ragResult : undefined,
        });

        response = formatOptimizerResponse(optimizerResult);
        circuitOptimizations.push(...optimizerResult.circuitOptimizations);
        structured = {
          kind: 'optimizer',
          totalEstimatedSaving: optimizerResult.totalEstimatedSaving,
          findings: optimizerResult.findings,
          prioritized: optimizerResult.prioritized,
        };
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
      structured,
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
