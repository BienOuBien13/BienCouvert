/**
 * Suivi des tokens Gemini API — input / output / appels
 *
 * Deux mécanismes complémentaires :
 * 1. Métriques OTel (Counters) → exportées vers OpenObserve via OTel Collector
 * 2. Compteurs en mémoire         → exposés via GET /api/admin/token-stats (JSON)
 *
 * Usage :
 *   import { trackGeminiClient } from '../utils/geminiMetrics';
 *   const model = trackGeminiClient(rawClient).getGenerativeModel({ model: 'gemini-2.5-flash' }, 'summarizePolicy');
 */

import { getMeter } from '../telemetry';

// ─────────────────────────────────────────────────────────────────────────────
// Catégories FinOps : regroupement fonctionnel des services
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceCategory =
  | 'Agents BMAD'
  | 'Ingestion auto'
  | 'Analyse contrats'
  | 'Sinistres'
  | 'Non catégorisé';

const FUNCTION_CATEGORIES: Record<string, ServiceCategory> = {
  // Agents BMAD (chat orchestré)
  intentAgent:          'Agents BMAD',
  analysisAgent:        'Agents BMAD',
  advisorAgent:         'Agents BMAD',
  claimsAgent:          'Agents BMAD',
  optimizerAgent:       'Agents BMAD',
  orchestrator_general: 'Agents BMAD',
  'orchestrator_general(stream)': 'Agents BMAD',
  // Pipeline d'ingestion automatique
  cgClassifier:             'Ingestion auto',
  ingestionAgent_extract:   'Ingestion auto',
  // Services utilisateur (analyse de contrats)
  summarizePolicy:          'Analyse contrats',
  searchPolicyInfo_rag:     'Analyse contrats',
  searchPolicyInfo_internet:'Analyse contrats',
  getCoverageAnalysis:      'Analyse contrats',
  detectDuplicates:         'Analyse contrats',
  generateShareableReport:  'Analyse contrats',
  // Gestion sinistres
  analyzeClaim:         'Sinistres',
  generateClaimLetter:  'Sinistres',
  chatClaim:            'Sinistres',
};

export function getCategoryForFunction(fnName: string): ServiceCategory {
  return FUNCTION_CATEGORIES[fnName] ?? 'Non catégorisé';
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget mensuel (seuil d'alerte, configurable en runtime)
// ─────────────────────────────────────────────────────────────────────────────

let budgetThresholdEur: number = parseFloat(process.env.GEMINI_BUDGET_EUR || '50');

export function getBudgetThreshold(): number  { return budgetThresholdEur; }
export function setBudgetThreshold(v: number) { budgetThresholdEur = v; }

// ─────────────────────────────────────────────────────────────────────────────
// Compteurs OTel (Prometheus-style monotonic counters)
// ─────────────────────────────────────────────────────────────────────────────

let inputTokenCounter: any  = null;
let outputTokenCounter: any = null;
let callCounter: any        = null;

function getCounters() {
  if (!inputTokenCounter) {
    const meter = getMeter();
    inputTokenCounter  = meter.createCounter('gemini_input_tokens_total',  { description: 'Cumul tokens input envoyés à Gemini'   });
    outputTokenCounter = meter.createCounter('gemini_output_tokens_total', { description: 'Cumul tokens output reçus de Gemini'   });
    callCounter        = meter.createCounter('gemini_calls_total',         { description: 'Nombre total d\'appels à Gemini API'   });
  }
  return { inputTokenCounter, outputTokenCounter, callCounter };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compteurs en mémoire (JSON endpoint)
// ─────────────────────────────────────────────────────────────────────────────

interface FunctionStats {
  calls:        number;
  inputTokens:  number;
  outputTokens: number;
}

const memStats: Record<string, FunctionStats> = {};
let totalCalls        = 0;
let totalInputTokens  = 0;
let totalOutputTokens = 0;
const startedAt       = new Date();

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale : enregistre l'usage après un appel generateContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enregistre le token usage d'un appel Gemini.
 * @param usageMetadata  response.usageMetadata (Google Generative AI SDK)
 * @param fnName         Nom de la fonction appelante (ex: 'summarizePolicy')
 * @param modelName      Nom du modèle Gemini (ex: 'gemini-2.5-flash')
 */
export function recordGeminiUsage(
  usageMetadata: any,
  fnName: string,
  modelName = 'unknown'
): void {
  const input  = usageMetadata?.promptTokenCount    || 0;
  const output = usageMetadata?.candidatesTokenCount || 0;

  // — Mise à jour compteurs en mémoire —
  if (!memStats[fnName]) {
    memStats[fnName] = { calls: 0, inputTokens: 0, outputTokens: 0 };
  }
  memStats[fnName].calls        += 1;
  memStats[fnName].inputTokens  += input;
  memStats[fnName].outputTokens += output;
  totalCalls        += 1;
  totalInputTokens  += input;
  totalOutputTokens += output;

  // — Mise à jour compteurs OTel —
  try {
    const { inputTokenCounter, outputTokenCounter, callCounter } = getCounters();
    const attrs = { fn: fnName, model: modelName };
    if (input  > 0) inputTokenCounter.add(input,   attrs);
    if (output > 0) outputTokenCounter.add(output,  attrs);
    callCounter.add(1, attrs);
  } catch (_) { /* no-op si OTel désactivé */ }

  // — Log console —
  if (input > 0 || output > 0) {
    console.log(`🔢 Gemini [${fnName}] in=${input} out=${output} total_in=${totalInputTokens} total_out=${totalOutputTokens}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper client Gemini
// Encapsule le client brut pour auto-tracker les tokens à chaque generateContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne un client Gemini proxié dont getGenerativeModel() retourne
 * des modèles qui trackent automatiquement les tokens.
 *
 * Usage :
 *   const ai = trackGeminiClient(rawClient);
 *   const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'summarizePolicy');
 */
export function trackGeminiClient(rawClient: any) {
  return {
    // Expose toutes les propriétés du client original
    ...rawClient,

    /**
     * @param config   { model, generationConfig, ... }
     * @param fnName   Nom de votre fonction (label pour les métriques)
     */
    getGenerativeModel(config: any, fnName = 'unknown') {
      const rawModel = rawClient.getGenerativeModel(config);
      const modelName: string = config?.model || 'unknown';

      // Wrap generateContent pour capturer usageMetadata
      return new Proxy(rawModel, {
        get(target, prop: string) {
          if (prop === 'generateContent') {
            return async (parts: any) => {
              const result = await target.generateContent(parts);
              recordGeminiUsage(result?.response?.usageMetadata, fnName, modelName);
              return result;
            };
          }
          if (prop === 'generateContentStream') {
            return async (parts: any) => {
              // Pour le streaming, on comptabilise à la fin
              const stream = await target.generateContentStream(parts);
              const originalResponse = stream.response;
              // Patch la promesse response pour capturer l'usage
              stream.response = originalResponse.then((resp: any) => {
                recordGeminiUsage(resp?.usageMetadata, `${fnName}(stream)`, modelName);
                return resp;
              });
              return stream;
            };
          }
          // Toutes les autres propriétés passent directement
          const val = (target as any)[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        },
      });
    },

    // Passe startChat, embedContent, etc. au client original
    startChat: rawClient.startChat?.bind(rawClient),
    embedContent: rawClient.embedContent?.bind(rawClient),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats JSON (pour GET /api/admin/token-stats)
// ─────────────────────────────────────────────────────────────────────────────

export interface FunctionStatsDetail extends FunctionStats {
  category: ServiceCategory;
  estimatedCostEur: number;
}

export interface CategoryStats {
  calls:        number;
  inputTokens:  number;
  outputTokens: number;
  estimatedCostEur: number;
}

export interface TokenStats {
  startedAt:         string;
  totalCalls:        number;
  totalInputTokens:  number;
  totalOutputTokens: number;
  estimatedCostEur:  number;
  budgetThresholdEur: number;
  budgetUsedPercent:  number;
  budgetAlert:        boolean;
  byFunction: Record<string, FunctionStatsDetail>;
  byCategory: Record<ServiceCategory, CategoryStats>;
}

/** Coût estimatif Gemini 2.5 Flash (tarifs Mars 2026, non garanti) */
const COST_PER_1M_INPUT  = 0.075; // USD
const COST_PER_1M_OUTPUT = 0.30;  // USD
const USD_TO_EUR         = 0.92;

export function getTokenStats(): TokenStats {
  const estUsd =
    (totalInputTokens  / 1_000_000) * COST_PER_1M_INPUT  +
    (totalOutputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
  const estimatedCostEur = Math.round(estUsd * USD_TO_EUR * 10_000) / 10_000;

  // Enrichir par fonction + agréger par catégorie
  const byFunction: Record<string, FunctionStatsDetail> = {};
  const byCategory: Record<string, CategoryStats> = {};

  for (const [fn, stats] of Object.entries(memStats)) {
    const fnUsd =
      (stats.inputTokens  / 1_000_000) * COST_PER_1M_INPUT  +
      (stats.outputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
    const fnCostEur = Math.round(fnUsd * USD_TO_EUR * 10_000) / 10_000;
    const category = getCategoryForFunction(fn);

    byFunction[fn] = { ...stats, category, estimatedCostEur: fnCostEur };

    if (!byCategory[category]) {
      byCategory[category] = { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostEur: 0 };
    }
    byCategory[category].calls        += stats.calls;
    byCategory[category].inputTokens  += stats.inputTokens;
    byCategory[category].outputTokens += stats.outputTokens;
    byCategory[category].estimatedCostEur = Math.round(
      (byCategory[category].estimatedCostEur + fnCostEur) * 10_000
    ) / 10_000;
  }

  const budgetUsedPercent = budgetThresholdEur > 0
    ? Math.round((estimatedCostEur / budgetThresholdEur) * 100 * 10) / 10
    : 0;

  return {
    startedAt: startedAt.toISOString(),
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostEur,
    budgetThresholdEur,
    budgetUsedPercent,
    budgetAlert: budgetThresholdEur > 0 && estimatedCostEur >= budgetThresholdEur * 0.80,
    byFunction,
    byCategory: byCategory as Record<ServiceCategory, CategoryStats>,
  };
}

/** Remet à zéro les compteurs en mémoire */
export function resetTokenStats(): void {
  for (const k of Object.keys(memStats)) delete memStats[k];
  totalCalls = totalInputTokens = totalOutputTokens = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring buffer d'historique FinOps (snapshots toutes les 15 min, 96h de rétention)
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const MAX_SNAPSHOTS        = 96 * 4;          // 4 jours de granularité 15 min

export interface TokenSnapshot {
  ts:               string;  // ISO — horodatage du snapshot
  deltaCalls:       number;  // appels sur cette période
  deltaInputTokens: number;  // tokens input sur cette période
  deltaOutputTokens:number;  // tokens output sur cette période
  deltaCostEur:     number;  // coût estimé sur cette période
  byCategory:       Record<string, number>; // coût par catégorie sur cette période
}

// État précédent pour calculer les deltas
let prevTotalCalls        = 0;
let prevTotalInputTokens  = 0;
let prevTotalOutputTokens = 0;
const prevCategoryInputs: Record<string, number>  = {};
const prevCategoryOutputs: Record<string, number> = {};

const snapshotHistory: TokenSnapshot[] = [];

function takeSnapshot(): void {
  const deltaCalls        = totalCalls        - prevTotalCalls;
  const deltaInputTokens  = totalInputTokens  - prevTotalInputTokens;
  const deltaOutputTokens = totalOutputTokens - prevTotalOutputTokens;
  const deltaUsd =
    (deltaInputTokens  / 1_000_000) * COST_PER_1M_INPUT  +
    (deltaOutputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
  const deltaCostEur = Math.round(deltaUsd * USD_TO_EUR * 10_000) / 10_000;

  // Coût delta par catégorie
  const byCategory: Record<string, number> = {};
  for (const [fn, stats] of Object.entries(memStats)) {
    const cat = getCategoryForFunction(fn);
    const prevIn  = prevCategoryInputs[fn]  || 0;
    const prevOut = prevCategoryOutputs[fn] || 0;
    const dIn  = stats.inputTokens  - prevIn;
    const dOut = stats.outputTokens - prevOut;
    const dCostEur = Math.round(((dIn / 1_000_000) * COST_PER_1M_INPUT + (dOut / 1_000_000) * COST_PER_1M_OUTPUT) * USD_TO_EUR * 10_000) / 10_000;
    byCategory[cat] = Math.round(((byCategory[cat] || 0) + dCostEur) * 10_000) / 10_000;
    prevCategoryInputs[fn]  = stats.inputTokens;
    prevCategoryOutputs[fn] = stats.outputTokens;
  }

  // Mettre à jour l'état précédent
  prevTotalCalls        = totalCalls;
  prevTotalInputTokens  = totalInputTokens;
  prevTotalOutputTokens = totalOutputTokens;

  snapshotHistory.push({ ts: new Date().toISOString(), deltaCalls, deltaInputTokens, deltaOutputTokens, deltaCostEur, byCategory });
  if (snapshotHistory.length > MAX_SNAPSHOTS) snapshotHistory.shift();
}

// Démarrer le timer de snapshot dès le chargement du module
setInterval(takeSnapshot, SNAPSHOT_INTERVAL_MS);

/** Retourne l'historique des snapshots (du plus ancien au plus récent) */
export function getTokenHistory(): TokenSnapshot[] {
  return [...snapshotHistory];
}
