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

export interface TokenStats {
  startedAt:       string;
  totalCalls:      number;
  totalInputTokens:  number;
  totalOutputTokens: number;
  estimatedCostEur: number; // estimatif gemini-2.5-flash
  byFunction: Record<string, FunctionStats>;
}

/** Coût estimatif Gemini 2.5 Flash (tarifs Mars 2026, non garanti) */
const COST_PER_1M_INPUT  = 0.075; // USD
const COST_PER_1M_OUTPUT = 0.30;  // USD
const USD_TO_EUR         = 0.92;

export function getTokenStats(): TokenStats {
  const estUsd =
    (totalInputTokens  / 1_000_000) * COST_PER_1M_INPUT  +
    (totalOutputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
  return {
    startedAt:         startedAt.toISOString(),
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostEur: Math.round(estUsd * USD_TO_EUR * 10_000) / 10_000,
    byFunction: { ...memStats },
  };
}

/** Remet à zéro les compteurs en mémoire */
export function resetTokenStats(): void {
  for (const k of Object.keys(memStats)) delete memStats[k];
  totalCalls = totalInputTokens = totalOutputTokens = 0;
}
