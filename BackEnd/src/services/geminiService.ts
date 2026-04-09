import dotenv from 'dotenv';
import { WebSearchResult, DuplicateFinding, OptimizationFinding, Policy, Message, SmartExtractionResult, PolicyType } from '../types';
import { query as dbQuery } from '../db';
import { trackGeminiClient } from '../utils/geminiMetrics';

// -----------------------------------------------------------------------------
// Service AI (Gemini) - wrapper minimal
// Ce service encapsule l'accès à l'API Gemini (librairie `@google/genai`). Si la
// clé `GEMINI_API_KEY` n'est pas définie, les fonctions retournent des valeurs
// simulées, ce qui facilite le prototypage local sans accès à Gemini.
// -----------------------------------------------------------------------------

dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
let client: any | null = null;

/**
 * Crée et met en cache un client Gemini si la clé est disponible.
 * Retourne `null` si la clé est absente ou si l'import échoue.
 */
export function getAiClient() {
  if (!GEMINI_KEY) return null;
  if (!client) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      client = new GoogleGenerativeAI(GEMINI_KEY);
    } catch (e) {
      console.error('Failed to require @google/generative-ai - AI features will be disabled.', e);
      return null;
    }
  }
  // Retourne un client proxié qui track automatiquement les tokens Gemini
  return trackGeminiClient(client);
}
const generateSystemInstruction = (policies: Policy[] = []) => {
  let context = "Tu es AssurClair, un assistant personnel expert en assurances. Ton but est d'aider l'utilisateur à comprendre ses couvertures. ";
  context += "Voici la liste des contrats de l'utilisateur (analyse-les pour répondre) :\n";
  policies.forEach(p => {
    context += `- Contrat \"${p.name}\" chez \"${p.provider}\" (Type: ${p.type}, Formule: ${p.coverageDetail || 'Non spécifiée'}). `;
    if (p.summary) context += `Résumé garanties: ${p.summary}. `;
    if (p.sourceUrl) context += `Source web: ${p.sourceUrl}. `;
    context += "\n";
  });
  context += "\nConsignes :\n1. Sois précis et cite le contrat concerné quand tu réponds.\n2. Si une garantie n'est pas mentionnée, dis que tu ne la trouves pas dans les documents.\n3. Sois concis et serviable.";
  return context;
};

/**
 * Normalise un libellé en clé snake_case sans accents (identique à la normalisation DB coverage_facts)
 * '+' est converti en '_plus' pour cohérence avec tableExtractionService.normalizeFormulaKey
 */
function normalizeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\+/g, '_plus')  // "TIERS ESSENTIEL+" → "tiers_essentiel_plus"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const summarizePolicy = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return `Résumé simulé (${mimeType}) : impossible d'accéder à Gemini, configurez GEMINI_API_KEY.`;
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'summarizePolicy');
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: fileBase64
        }
      },
      "Analyse ce document d'assurance. Extrais en français : le nom de l'assureur, le type de contrat, et une liste à puces très concise des garanties majeures. Limite la réponse à 150 mots."
    ]);
    
    const response = await result.response;
    return response.text() || 'Impossible de générer un résumé.';
  } catch (err) {
    console.error('gemini summarize error', err);
    throw err;
  }
};

export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  const ai = getAiClient();
  if (!ai) {
    return { summary: `Recherche simulée pour ${provider} - ${type} - ${name}`, sourceUrl: undefined, detectedFormulas: [], availableOptions: [] };
  }

  // ÉTAPE 1: Chercher dans central_cg (RAG) d'abord
  try {
    const storage = require('../storage').storage;
    const questionText = `Informations sur le contrat ${name} de ${provider} (${type})`;
    const questionEmbedding = await generateEmbedding(questionText);
    if (!questionEmbedding) throw new Error('Embedding indisponible');

    const cgResults = await storage.searchCentralCg(questionEmbedding, [provider], 1);
    
    if (cgResults.length > 0 && cgResults[0].similarity > 0.7) {
      const cg = cgResults[0];
      console.log(`✅ CG trouvée dans RAG: ${cg.insurer_label || cg.insurer_code} - ${cg.product_name} (similarité: ${cg.similarity}, page: ${cg.page_number}, type: ${cg.chunk_type})`);
      
      // Extraire formules et options du contenu
      const promptExtract = `Analyse ce document de conditions générales et extrais:

${cg.content_text?.substring(0, 5000) || ''}

Réponds en JSON:
{
  "summary": "Résumé des garanties principales",
  "formulas": ["liste des formules trouvées"],
  "options": ["liste des options trouvées"]
}`;
      
      const model = ai.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      }, 'searchPolicyInfo_rag');
      
      const extractResult = await model.generateContent([promptExtract]);
      const extractText = extractResult.response.text();
      const extracted = JSON.parse(extractText);
      
      return {
        summary: extracted.summary || 'Informations extraites des conditions générales',
        sourceUrl: cg.url || undefined,
        detectedFormulas: Array.isArray(extracted.formulas) ? extracted.formulas : [],
        availableOptions: Array.isArray(extracted.options) ? extracted.options : []
      };
    }
  } catch (e: any) {
    console.warn('⚠️ Recherche RAG échouée, fallback sur Internet:', e.message);
  }

  // ÉTAPE 2: Si pas trouvé dans RAG, chercher sur Internet
  console.log('🌐 Recherche sur Internet pour', provider, name);
  
  const prompt = `Tu es un expert en assurances. Recherche sur Internet les conditions générales actuelles pour ce produit d'assurance :
  
  Assureur: ${provider}
  Catégorie: ${type}
  Nom commercial: ${name}
  
  Instructions :
  1. RECHERCHE WEB: Trouve les informations officielles les plus récentes sur ce contrat
  2. Identifie les garanties incluses par défaut pour ce type de contrat chez cet assureur
  3. Liste les noms EXACTS des formules commerciales disponibles (ex: "Essentiel", "Confort", "Sérénité", "Tiers", "Tiers Plus", "Tous Risques")
  4. Fournis un résumé structuré des plafonds et franchises types si disponibles
  
  Réponds EXCLUSIVEMENT sous forme d'un objet JSON :
  {
    "summary": "Texte détaillé des garanties en français avec sources",
    "formulas": ["Nom Exact Formule A", "Nom Exact Formule B", "Nom Exact Formule C"],
    "options": ["Option 1", "Option 2"]
  }`;

  try {
    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, 'searchPolicyInfo_internet');
    
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    let jsonResponse: any = {};
    try {
      jsonResponse = JSON.parse(text);
    } catch (e) {
      jsonResponse = { summary: text, formulas: [] };
    }

    const summary = jsonResponse.summary || 'Aucun résumé structuré disponible.';
    const detectedFormulas = Array.isArray(jsonResponse.formulas) ? jsonResponse.formulas : [];
    const availableOptions = Array.isArray(jsonResponse.options) ? jsonResponse.options : [];

    return { summary, sourceUrl: undefined, detectedFormulas, availableOptions } as WebSearchResult;
  } catch (err) {
    console.error('gemini search error', err);
    return { summary: 'La recherche automatique n\'a pas pu aboutir.', sourceUrl: undefined, detectedFormulas: [], availableOptions: [] };
  }
};

export const detectDuplicates = async (policies: Policy[], profile: any = {}): Promise<OptimizationFinding[]> => {
  if (!policies || policies.length < 2) return [];
  const ai = getAiClient();
  if (!ai) return [];

  // ÉTAPE 1: Enrichir les contrats avec RAG (extraits pertinents)
  const storage = require('../storage').storage;
  const enrichedPolicies: any[] = [];
  
  for (const p of policies) {
    let enrichedContext = `Contrat ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail || 'Non spécifiée'}.`;
    
    try {
      // Chercher dans les embeddings de ce contrat
      const questionEmbedding = await generateEmbedding(`Garanties et couvertures du contrat ${p.name}`);
      if (!questionEmbedding) throw new Error('Embedding indisponible');
      const chunks = await storage.searchPolicyEmbeddings(questionEmbedding, [parseInt(p.id)], 3);
      
      if (chunks.length > 0) {
        enrichedContext += '\n\n📄 Extraits du contrat:\n';
        chunks.forEach((chunk: any) => {
          enrichedContext += chunk.chunk_text.substring(0, 500) + '...\n';
        });
      } else {
        enrichedContext += ` Résumé : ${p.summary || 'Non disponible'}`;
      }
    } catch (e: any) {
      console.warn(`⚠️ RAG échoué pour policy ${p.id}, utilisation métadonnées`);
      enrichedContext += ` Résumé : ${p.summary || 'Non disponible'}`;
    }
    
    enrichedPolicies.push(enrichedContext);
  }

  const contractList = policies.map(p => `- ID ${p.id}: "${p.name}" chez ${p.provider || (p as any).insurer}, type ${p.type}, formule: ${p.coverageDetail || (p as any).formula || 'Non spécifiée'}, prime annuelle: ${p.annualPremium ? p.annualPremium + '€' : 'inconnue'}`).join('\n');

  const prompt = `Tu es un expert en optimisation de portefeuilles d'assurance. Analyse ces ${policies.length} contrats d'assurance et le profil détaillé de l'utilisateur.

CONTRATS ANALYSÉS :
${contractList}

PROFIL UTILISATEUR COMPLET : ${JSON.stringify(profile)}

EFFECTUE UNE ANALYSE APPROFONDIE sur 3 axes :

## AXE 1 — DOUBLONS DE GARANTIES (type: 'duplicate')
- Identifie les garanties présentes dans plusieurs contrats (RC, protection juridique, assistance, vol, etc.)
- Nomme précisément les contrats et garanties qui se chevauchent
- Calcule l'économie si l'une des couvertures était supprimée/réduite
- Exemple: RC auto déjà couverte par la carte bancaire Visa Premier

## AXE 2 — GARANTIES MANQUANTES (type: 'gap')
- Identifie les risques non couverts au regard du profil (piscine, jardin, animaux, revenu, âge, sport, télétravail)
- Prioritise par criticité : décès sans prévoyance, logement sans assurance, etc.
- Propose un contrat spécifique à ajouter ou une formule à monter en gamme
- Nomme l'assureur et la formule recommandée si possible

## AXE 3 — ÉCONOMIES & OPTIMISATIONS (type: 'saving')
- Propose des changements de formule (montée/descente) avec gain estimé
- Identifie les regroupements multi-contrats chez le même assureur (remise fidélité)
- Suggère des options inutiles à supprimer selon le profil
- Calcule un gain annuel réaliste basé sur les primes connues

RÈGLES IMPORTANTES :
- Chaque finding doit être ACTIONNABLE et SPÉCIFIQUE (pas générique)
- Les estimatedSaving doivent être des nombres réalistes (fourchette 50-2000€/an)
- Pour chaque gap, indique si on doit AJOUTER un contrat ou MODIFIER une formule existante
- Minimum 3 findings, maximum 12

Retourne UNIQUEMENT un tableau JSON valide d'optimisations avec les champs:
- title: titre court et percutant (ex: "Double protection juridique détectée")
- description: explication précise avec noms des contrats concernés et justification
- type: 'duplicate' | 'gap' | 'saving'
- severity: 'low' | 'medium' | 'high'
- involvedPolicies: tableau d'IDs (strings) des polices concernées
- estimatedSaving: gain annuel estimé en euros (nombre entier, 0 si pas applicable)
- recommendation: action concrète à faire ("Supprimer l'option X du contrat Y", "Ajouter une assurance Z", "Changer la formule de ... vers ...")
- action: 'remove_duplicate' | 'add_contract' | 'change_formula' | 'remove_option' | 'group_contracts' | 'info'`;

  const parts: any[] = [{ text: prompt }];
  enrichedPolicies.forEach(enrichedText => {
    parts.push({ text: enrichedText });
  });

  try {
    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, 'detectDuplicates');
    
    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    return JSON.parse(text) as OptimizationFinding[];
  } catch (err) {
    console.error('gemini detectDuplicates error', err);
    return [];
  }
};

/**
 * Analyse une police d'assurance et retourne une structure détaillée des garanties,
 * exclusions, forces/faiblesses, et formules alternatives.
 */
export const getCoverageAnalysis = async (policy: any): Promise<any> => {
  const ai = getAiClient();
  const formulaName = policy.coverageDetail || policy.formula || policy.coverage || 'Formule souscrite';
  const insurer = policy.provider || policy.insurer || 'Assureur';
  const type = policy.type || 'Assurance';
  const summary = policy.summary || '';

  // Fallback sans IA
  if (!ai) {
    return buildFallbackCoverage(formulaName, type, summary);
  }

  // Tenter de récupérer du contexte RAG
  let ragContext = '';
  try {
    const storage = require('../storage').storage;
    const questionEmbedding = await generateEmbedding(
      `Garanties incluses formule ${formulaName} assurance ${type} ${insurer}`
    );
    if (questionEmbedding) {
      const chunks = await storage.searchCentralCg(questionEmbedding, [insurer], 4);
      if (chunks.length > 0) {
        ragContext = chunks.map((c: any) => c.content_text?.substring(0, 800)).join('\n\n---\n\n');
        console.log(`✅ RAG: ${chunks.length} chunks pour analyse couverture`);
      }
    }
  } catch (e: any) {
    console.warn('⚠️ RAG coverage indisponible:', e.message);
  }

  const contextSection = ragContext
    ? `\nEXTRAITS DES CONDITIONS GÉNÉRALES :\n${ragContext.substring(0, 4000)}`
    : (summary ? `\nRÉSUMÉ CONTRAT : ${summary}` : '');

  const prompt = `Tu es un expert en assurances. Analyse ce contrat d'assurance et génère une fiche détaillée des garanties.

CONTRAT :
- Assureur : ${insurer}
- Type : ${type}
- Formule souscrite : ${formulaName}
- Prime annuelle : ${policy.annualPremium ? policy.annualPremium + '€' : 'non connue'}${contextSection}

Génère une analyse structurée et realiste. Réponds UNIQUEMENT en JSON valide :
{
  "formulaName": "Nom exact de la formule",
  "formulaLevel": "basic" | "intermediate" | "premium",
  "formulaDescription": "Description courte du niveau de couverture en 1-2 phrases",
  "coverages": [
    {
      "category": "Catégorie (ex: Responsabilité Civile, Dommages, Assistance, Vol)",
      "guarantee": "Nom de la garantie",
      "included": true|false,
      "limit": "Plafond si connu (ex: 500 000€, 30€/jour)",
      "note": "Note additionnelle si pertinente",
      "importance": "key" | "standard" | "optional"
    }
  ],
  "exclusions": [
    "Exclusion 1 importante",
    "Exclusion 2 importante"
  ],
  "keyStrengths": [
    "Point fort 1",
    "Point fort 2"
  ],
  "keyWeaknesses": [
    "Point faible 1",
    "Point faible 2"
  ],
  "recommendation": "Conseil personnalisé sur cette formule (max 2 phrases)",
  "alternativeFormulas": [
    {
      "name": "Nom formule alternative",
      "priceVariation": "+X€/mois ou -X€/mois",
      "mainDifference": "Ce que cette formule apporte en plus/moins",
      "recommended": true|false
    }
  ]
}

CONSIGNES :
- Inclure 6 à 14 garanties couvrant les risques principaux du type d'assurance
- Marquer "included: false" les garanties importantes NON incluses dans cette formule
- Les exclusions doivent être les plus importantes (4-8 maximum)
- Les priceVariation des alternatives doivent être réalistes au marché français
- La recommendation doit être personnalisée et actionnable`;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    }, 'getCoverageAnalysis');
    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error('getCoverageAnalysis error:', err);
    return buildFallbackCoverage(formulaName, type, summary);
  }
};

function buildFallbackCoverage(formulaName: string, type: string, summary: string): any {
  return {
    formulaName,
    formulaLevel: 'intermediate',
    formulaDescription: summary || `Couverture ${type} — formule ${formulaName}`,
    coverages: [],
    exclusions: ['Analyse IA non disponible — consultez les conditions générales'],
    keyStrengths: summary ? [summary.substring(0, 120)] : [],
    keyWeaknesses: [],
    recommendation: 'Ajoutez le document PDF de vos conditions générales pour une analyse complète.',
    alternativeFormulas: []
  };
}

/**
 * Génère un embedding pour un texte donné via l'API REST Gemini.
 *
 * Règles REST Gemini (AI Studio) :
 *  - Le modèle est dans l'URL, PAS dans le body.
 *  - v1beta est la version correcte pour les clés AI Studio.
 *  - Fallback sur embedding-001 (768 dims) si text-embedding-004 introuvable.
 *  - Backoff exponentiel sur 429 / 503.
 */
// Modèles candidats pour embedding (ordre de préférence)
// text-embedding-004 et embedding-001 sont sur v1 (stable), les autres sur v1beta
const EMBEDDING_MODELS: { name: string; version: string }[] = [
  { name: 'text-embedding-004',             version: 'v1'     },
  { name: 'text-multilingual-embedding-002', version: 'v1'     },
  { name: 'embedding-001',                  version: 'v1'     },
  { name: 'gemini-embedding-exp-03-07',      version: 'v1beta' },
];

// Cache du modèle qui fonctionne (évite de re-tester à chaque page)
// Réinitialisé après 5 min pour éviter que les erreurs transitoires bloquent définitivement.
let _workingEmbedModel: string | null | undefined = undefined; // undefined = pas encore testé
let _workingEmbedModelTs  = 0; // timestamp du dernier passage à null
let _embeddingPermanentlyDisabled = false; // true si tous les modèles ont répondu 404 (non disponibles pour cette clé)

async function callEmbedApi(modelName: string, text: string, retries: number, apiVersion = 'v1'): Promise<number[] | null> {
  // Utilise node-fetch pour compatibilité (évite les quirks du fetch natif Node)
  const nodeFetch = require('node-fetch');
  const url =
    `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:embedContent?key=${GEMINI_KEY}`;

  // Agent TLS : désactive la vérification de cert si NODE_TLS_REJECT_UNAUTHORIZED=0
  // (nécessaire sur les postes avec proxy Zscaler/corporate SSL inspection)
  const _nodeHttps = require('https');
  const _tlsAgent = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    ? new _nodeHttps.Agent({ rejectUnauthorized: false })
    : undefined;

  let response: any;
  try {
    response = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 8192) }] }
      }),
      ...(_tlsAgent ? { agent: _tlsAgent } : {})
    });
  } catch (err: any) {
    console.error(`callEmbedApi network error [${modelName}]:`, err.message);
    return null;
  }

  if (response.status === 429 || response.status === 503) {
    if (retries > 0) {
      const wait = (5 - retries) * 4000;
      console.warn(`⚠️  Gemini rate limit (${response.status}) — attente ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      return callEmbedApi(modelName, text, retries - 1, apiVersion);
    }
    return null;
  }

  if (response.status === 404 || response.status === 400) {
    // Modèle indisponible pour cette clé/région
    const body = await response.text().catch(() => '');
    console.warn(`   ⚠️  ${modelName} → HTTP ${response.status}: ${body.slice(0, 150)}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`callEmbedApi [${modelName}] ${response.status}: ${body.slice(0, 200)}`);
    return null;
  }

  const data = await response.json() as any;
  const values: number[] | undefined = data.embedding?.values;
  if (!values || values.length === 0) return null;
  return values;
}

/**
 * Génère un embedding pour un texte donné.
 * Retourne null si aucun modèle n'est disponible (la vectorisation continue sans embedding).
 * Met en cache le premier modèle qui fonctionne pour éviter de re-tester à chaque page.
 */
export const generateEmbedding = async (text: string, retries = 4): Promise<number[] | null> => {
  if (!GEMINI_KEY) {
    console.warn('No GEMINI_API_KEY - embedding désactivé');
    return null;
  }

  // Désactivation permanente : tous les modèles ont répondu 404 (indisponibles pour cette clé)
  if (_embeddingPermanentlyDisabled) return null;

  // Si on sait déjà qu'aucun modèle ne marche — réessayer toutes les 5 min (erreur transiente 429/503)
  if (_workingEmbedModel === null) {
    if (Date.now() - _workingEmbedModelTs < 5 * 60 * 1000) return null;
    _workingEmbedModel = undefined; // réinitialiser pour re-tenter
  }

  // Utiliser directement le modèle connu si déjà trouvé
  const modelsToTry = _workingEmbedModel
    ? [EMBEDDING_MODELS.find(m => m.name === _workingEmbedModel) ?? EMBEDDING_MODELS[0]]
    : EMBEDDING_MODELS;

  let allWere404 = true;
  for (const { name, version } of modelsToTry) {
    try {
      const values = await callEmbedApi(name, text, retries, version);
      if (values) {
        if (_workingEmbedModel === undefined) {
          console.log(`✅ Modèle embedding actif: ${name} (${version}, ${values.length} dims)`);
          _workingEmbedModel = name;
        }
        return values;
      }
      // callEmbedApi retourne null pour 404 ET pour 429 — on distingue via le log déjà émis
      // On considère non-404 si le modèle était le modèle connu (cache hit qui échoue = transitoire)
      if (_workingEmbedModel !== undefined) allWere404 = false;
      if (_workingEmbedModel === undefined) {
        console.warn(`   ⚠️  ${name} → indisponible`);
      }
    } catch (err) {
      console.error(`generateEmbedding [${name}]:`, err);
      allWere404 = false;
    }
  }

  if (_workingEmbedModel === undefined) {
    if (allWere404) {
      // Tous ont répondu 404 : modèles embedding non disponibles pour cette clé (permanent)
      console.error('❌ Embedding désactivé définitivement — modèles non accessibles avec cette clé API (plan AI Studio Free). Les pages sont indexées sans vecteur, la recherche sémantique est désactivée.');
      _embeddingPermanentlyDisabled = true;
    } else {
      // Erreurs transitoires (429/503) — réessayer dans 5 min
      console.error('❌ Aucun modèle embedding disponible (erreur transitoire) — réessai dans 5 min.');
      _workingEmbedModel = null;
      _workingEmbedModelTs = Date.now();
    }
  }
  return null;
};

/**
 * Découpe un texte en chunks de ~1000 tokens
 * Utilise des séparateurs naturels (paragraphes, phrases)
 */
export const chunkText = (text: string, maxChars: number = 3000): string[] => {
  if (!text) return [];
  
  // Diviser par paragraphes d'abord
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length < maxChars) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // Si le paragraphe est trop long, le découper par phrases
      if (paragraph.length > maxChars) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        let sentenceChunk = '';
        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length < maxChars) {
            sentenceChunk += sentence;
          } else {
            if (sentenceChunk) chunks.push(sentenceChunk);
            sentenceChunk = sentence;
          }
        }
        if (sentenceChunk) chunks.push(sentenceChunk);
        currentChunk = '';
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: résolution robuste des coverage_facts pour un ensemble de policies
// Gère tous les cas: centralCgId direct, fallback insurer+type, LIKE partiel, table_json
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveCoverageFacts(storage: any, policies: any[], label = ''): Promise<any[]> {
  const tag = label ? `[${label}] ` : '';
  let coverageFacts: any[] = [];

  try {
    // ── Diagnostics de base ──
    policies.forEach((p: any, i: number) => {
      console.log(`${tag}📋 Policy ${i + 1}: name="${p.name}" insurer="${p.insurer}" insurerCode="${p.insurerCode}" typeCode="${p.typeCode}" subTypeCode="${p.subTypeCode || ''}" formula="${p.formula}" centralCgId=${p.centralCgId} userCgId=${p.userCgId}`);
    });

    // ── Résolution des centralCgIds ──
    // Priorité 1 : lien direct policy.central_cg_id
    let cgIdsForFacts: number[] = policies
      .map((p: any) => p.centralCgId)
      .filter((id: any) => id != null)
      .map(Number);

    // Priorité 2 : si certaines policies n'ont pas de centralCgId, chercher par insurer_code + insurance_type_code (+ sous-type si présent)
    const policiesNoCgId = policies.filter((p: any) => !p.centralCgId);
    if (policiesNoCgId.length > 0) {
      console.log(`${tag}🔎 ${policiesNoCgId.length} policy(s) sans centralCgId — recherche par insurer+type+sous-type`);
      try {
        const eligiblePolicies = policiesNoCgId.filter((p: any) => p.insurerCode && p.typeCode);
        const params: any[] = [];
        const conditions = eligiblePolicies.map((p: any) => {
          params.push(p.insurerCode, p.typeCode);
          let clause = `(cg.insurer_code = $${params.length - 1} AND cg.insurance_type_code = $${params.length}`;
          if (p.subTypeCode) {
            params.push(p.subTypeCode);
            // Correspondance exacte si sous-type connu, sinon on accepte aussi les lignes sans sous-type
            clause += ` AND (cg.insurance_sub_type_code = $${params.length} OR cg.insurance_sub_type_code IS NULL)`;
          }
          clause += ')';
          return clause;
        }).join(' OR ');

        if (conditions && params.length > 0) {
          const cgLookup = await dbQuery(
            `SELECT id FROM central_cg WHERE (${conditions}) AND status = 'active' LIMIT 10`,
            params
          );
          const found = cgLookup.rows.map((r: any) => Number(r.id));
          console.log(`${tag}✅ CG trouvés par insurer+type+sous-type: [${found.join(', ')}]`);
          cgIdsForFacts = [...new Set([...cgIdsForFacts, ...found])];
        } else {
          console.warn(`${tag}⚠️ Impossible de résoudre CG: insurerCode ou typeCode manquant`);
        }

        // Fallback supplémentaire : policies sans typeCode → chercher par insurerCode seul
        const policiesInsurerOnly = policiesNoCgId.filter((p: any) => p.insurerCode && !p.typeCode);
        if (policiesInsurerOnly.length > 0) {
          const onlyCodes = [...new Set(policiesInsurerOnly.map((p: any) => p.insurerCode))];
          const cgByInsurer = await dbQuery(
            `SELECT DISTINCT id FROM central_cg WHERE insurer_code = ANY($1) AND status = 'active' LIMIT 10`,
            [onlyCodes]
          );
          const foundByInsurer = cgByInsurer.rows.map((r: any) => Number(r.id));
          if (foundByInsurer.length > 0) {
            console.log(`${tag}✅ CG trouvés par insurerCode seul: [${foundByInsurer.join(', ')}]`);
            cgIdsForFacts = [...new Set([...cgIdsForFacts, ...foundByInsurer])];
          }
        }
      } catch (e) {
        console.warn(`${tag}⚠️ Échec lookup CG par insurer+type:`, e);
      }
    }

    if (cgIdsForFacts.length === 0) {
      console.warn(`${tag}⚠️ Aucun centralCgId résolu — passage direct aux user_coverage_facts`);
    } else {

    console.log(`${tag}🔍 Recherche coverage_facts pour CG IDs: [${cgIdsForFacts.join(', ')}]`);

    const coverageFactsBase = `SELECT cf.guarantee_label, cf.guarantee_key, cf.formula_label, cf.formula_key,
                cf.coverage_status, cf.coverage_amount, cf.franchise, cf.coverage_notes,
                cf.source_page_number, cg.url as pdf_url, i.label as insurer_label
         FROM coverage_facts cf
         JOIN central_cg cg ON cf.central_cg_id = cg.id
         LEFT JOIN insurers i ON cg.insurer_code = i.code`;

    // Construire les variantes de clé de formule (avec ET sans _plus pour compat données existantes)
    const formulasRaw = [...new Set(policies.map((p: any) => p.formula || '').filter(Boolean))];
    const formulaKeys = [...new Set(formulasRaw.flatMap((f: string) => {
      const withPlus = normalizeKey(f);
      const withoutPlus = normalizeKey(f.replace(/\+/g, '')); // fallback ancien format
      return [withPlus, withoutPlus].filter(k => k.length > 2);
    }))];

    console.log(`${tag}🔍 formulas brutes: [${formulasRaw.join(' | ')}] → formulaKeys: [${formulaKeys.join(', ')}]`);

    let factsResult: any;

    if (formulaKeys.length > 0) {
      // ── Niveau 1: match exact (supporte les deux normalisations) ──
      factsResult = await dbQuery(
        `${coverageFactsBase} WHERE cf.central_cg_id = ANY($1) AND cf.formula_key = ANY($2) ORDER BY cf.guarantee_key`,
        [cgIdsForFacts, formulaKeys]
      );
      console.log(`${tag}Niveau 1 (exact): ${factsResult.rows.length} faits`);

      // ── Niveau 2: LIKE sur le préfixe de 2 mots ──
      if (factsResult.rows.length === 0) {
        const baseKeys = [...new Set(formulaKeys.map((k: string) => k.split('_').slice(0, 2).join('_')))] as string[];
        const likeConditions = baseKeys.map((_: string, i: number) => `cf.formula_key LIKE $${i + 2}`).join(' OR ');
        const likeParams: any[] = [cgIdsForFacts, ...baseKeys.map((k: string) => `${k}%`)];
        factsResult = await dbQuery(
          `${coverageFactsBase} WHERE cf.central_cg_id = ANY($1) AND (${likeConditions}) ORDER BY cf.guarantee_key`,
          likeParams
        );
        console.log(`${tag}Niveau 2 (LIKE ${baseKeys.map(k => k + '%').join(', ')}): ${factsResult.rows.length} faits`);
      }

      // ── Niveau 3: fallback total (toutes formules du CG) ──
      if (factsResult.rows.length === 0) {
        factsResult = await dbQuery(
          `${coverageFactsBase} WHERE cf.central_cg_id = ANY($1) ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
          [cgIdsForFacts]
        );
        console.log(`${tag}Niveau 3 (toutes formules): ${factsResult.rows.length} faits`);
      }
    } else {
      // Pas de formule connue: toutes les formules du CG
      factsResult = await dbQuery(
        `${coverageFactsBase} WHERE cf.central_cg_id = ANY($1) ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
        [cgIdsForFacts]
      );
      console.log(`${tag}(sans formule) Niveau total: ${factsResult.rows.length} faits`);
    }

    coverageFacts = factsResult.rows;

    // ── Niveau 4: fallback table_json ──
    if (coverageFacts.length === 0) {
      console.log(`${tag}🔄 Niveau 4: fallback table_json`);
      try {
        const tableResult = await dbQuery(
          `SELECT p.table_json, p.page_number, cg.url as pdf_url, i.label as insurer_label
           FROM central_cg_pages p
           JOIN central_cg cg ON p.central_cg_id = cg.id
           LEFT JOIN insurers i ON cg.insurer_code = i.code
           WHERE p.central_cg_id = ANY($1) AND p.has_table = true AND p.table_json IS NOT NULL
           ORDER BY p.page_number`,
          [cgIdsForFacts]
        );
        tableResult.rows.forEach((row: any) => {
          const table = typeof row.table_json === 'string' ? JSON.parse(row.table_json) : row.table_json;
          if (table && Array.isArray(table.rows)) {
            const headers: string[] = Array.isArray(table.headers) ? table.headers : [];
            // Récupérer la légende si présente dans le table_json
            const legend: Record<string, string> | null = (table.legend && typeof table.legend === 'object') ? table.legend : null;
            if (legend) console.log(`${tag}📖 Légende table_json page ${row.page_number}: ${JSON.stringify(legend)}`);

            const formulaHeaders = headers.slice(1); // colonnes de formules

            table.rows.forEach((tableRow: any) => {
              const isArrayRow = Array.isArray(tableRow);
              const guaranteeLabel: string = isArrayRow ? String(tableRow[0] || '') : (tableRow.guarantee || '');
              if (!guaranteeLabel.trim()) return; // ignorer lignes vides / sections

              // Itérer sur les formules (par position pour arrays, par clé pour objets)
              const entries: Array<[string, string]> = isArrayRow
                ? formulaHeaders.map((h: string, i: number) => [h, String(tableRow[i + 1] ?? '')] as [string, string])
                : Object.entries(tableRow.formulas || {});

              entries.forEach(([geminiKey, sym]) => {
                const fKey = normalizeKey(geminiKey);
                const fLabel = headers.find((h: string) => normalizeKey(h) === fKey || normalizeKey(h) === fKey.replace(/_plus$/, '')) || geminiKey;
                const rawSym = String(sym).trim();
                const s = rawSym.toLowerCase();

                // 1. Vérifier la légende en priorité
                let status: string = '';
                if (legend) {
                  const legendVal = legend[rawSym] || legend[s] || legend[rawSym.toUpperCase()];
                  if (legendVal) {
                    const lv = legendVal.toLowerCase();
                    if (/inclu|garanti|compris|couvert|oui|yes|included/.test(lv)) status = 'included';
                    else if (/exclu|non|no|néant|neant|excluded/.test(lv)) status = 'excluded';
                    else if (/option|en sus|optionnel|optional/.test(lv)) status = 'optional';
                    else if (/n\/a|sans objet|not.applicable/.test(lv)) status = 'not_applicable';
                  }
                }

                // 2. Si pas résolu par la légende, appliquer les règles standard
                if (!status) {
                  status = /✓|✔|●|•|√|■|▪|◆|oui|inclus|included|garanti|compris|couvert/.test(s) ? 'included'
                    : /✗|✘|×|✕|□|▫/.test(rawSym) ? 'excluded'  // symboles négatifs (test sur RAW, pas lowercase)
                    : /^x$/.test(s) ? 'excluded'               // lettre x seule
                    : /^(-|−|–|—|\.\.\.|--)$/.test(rawSym) ? 'excluded'  // tirets seuls
                    : /\bexclu|\bnon\b|\bnéant\b|\bneant\b|\bnul\b/.test(s) ? 'excluded'
                    : /○|◯|△|option|en sus|optionnel/.test(s) ? 'optional'
                    : /^(n\/a|na|s\.o\.|sans objet)$/i.test(s) ? 'not_applicable'
                    : s.length > 0 ? 'included' : 'not_applicable';
                }

                coverageFacts.push({
                  guarantee_label: guaranteeLabel,
                  guarantee_key: normalizeKey(guaranteeLabel),
                  formula_label: fLabel,
                  formula_key: fKey,
                  coverage_status: status,
                  coverage_amount: null, franchise: null, coverage_notes: null,
                  insurer_label: row.insurer_label,
                  source_page_number: row.page_number,
                  pdf_url: row.pdf_url
                });
              });
            });
          }
        });
        console.log(`${tag}Niveau 4 (table_json): ${coverageFacts.length} faits`);
      } catch (tjErr) {
        console.warn(`${tag}⚠️ Échec table_json fallback:`, tjErr);
      }
    }

    // ── Log des formula_keys disponibles en DB ──
    if (coverageFacts.length > 0) {
      const availableFormulas = [...new Set(coverageFacts.map((f: any) => f.formula_key))];
      console.log(`${tag}✅ ${coverageFacts.length} faits — formules disponibles: [${availableFormulas.join(', ')}]`);
    } else {
      // Debug: combien de faits existent pour ce CG (toutes formules confondues) ?
      try {
        const countResult = await dbQuery(
          `SELECT formula_key, COUNT(*) as cnt FROM coverage_facts WHERE central_cg_id = ANY($1) GROUP BY formula_key ORDER BY formula_key`,
          [cgIdsForFacts]
        );
        if (countResult.rows.length > 0) {
          console.warn(`${tag}⚠️ coverage_facts vide après tous niveaux. Formules en DB: ${countResult.rows.map((r: any) => `${r.formula_key}(${r.cnt})`).join(', ')}`);
        } else {
          console.warn(`${tag}⚠️ AUCUNE donnée dans coverage_facts pour ces CG IDs`);
        }
      } catch (_) {}
    }
    } // fin else (faits centraux)

    // ── Résolution des user_coverage_facts (CG uploadés par l'utilisateur) ──
    const userCgIdsForFacts = [...new Set(
      policies.map((p: any) => p.userCgId).filter((id: any) => id != null).map(Number)
    )];
    if (userCgIdsForFacts.length > 0) {
      console.log(`${tag}🔍 Recherche user_coverage_facts pour user_cg IDs: [${userCgIdsForFacts.join(', ')}]`);
      try {
        const formulasRawU = [...new Set(policies.map((p: any) => p.formula || '').filter(Boolean))];
        const formulaKeysU = [...new Set(formulasRawU.flatMap((f: string) => {
          const withPlus = normalizeKey(f);
          const withoutPlus = normalizeKey(f.replace(/\+/g, ''));
          return [withPlus, withoutPlus].filter(k => k.length > 2);
        }))] as string[];

        const userFactsBase = `SELECT ucf.guarantee_label, ucf.guarantee_key, ucf.formula_label, ucf.formula_key,
                  ucf.coverage_status, ucf.coverage_amount, NULL::text as franchise, NULL::text as coverage_notes,
                  ucf.source_page_number, uc.target_filename as pdf_url, NULL::text as insurer_label
           FROM user_coverage_facts ucf
           JOIN user_cg uc ON ucf.user_cg_id = uc.id`;

        let userFactsResult: any;
        if (formulaKeysU.length > 0) {
          userFactsResult = await dbQuery(
            `${userFactsBase} WHERE ucf.user_cg_id = ANY($1) AND ucf.formula_key = ANY($2) ORDER BY ucf.guarantee_key`,
            [userCgIdsForFacts, formulaKeysU]
          );
          if (userFactsResult.rows.length === 0) {
            userFactsResult = await dbQuery(
              `${userFactsBase} WHERE ucf.user_cg_id = ANY($1) ORDER BY ucf.formula_key, ucf.guarantee_key LIMIT 200`,
              [userCgIdsForFacts]
            );
          }
        } else {
          userFactsResult = await dbQuery(
            `${userFactsBase} WHERE ucf.user_cg_id = ANY($1) ORDER BY ucf.formula_key, ucf.guarantee_key LIMIT 200`,
            [userCgIdsForFacts]
          );
        }

        if (userFactsResult.rows.length > 0) {
          coverageFacts = [...coverageFacts, ...userFactsResult.rows];
          console.log(`${tag}✅ +${userFactsResult.rows.length} faits user_coverage_facts ajoutés`);
        }
      } catch (uErr) {
        console.warn(`${tag}⚠️ Échec lookup user_coverage_facts:`, uErr);
      }
    }

  } catch (err) {
    console.error(`${tag}❌ resolveCoverageFacts erreur:`, err);
  }

  return coverageFacts;
}

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "Le service d'assistant est temporairement indisponible. Veuillez configurer GEMINI_API_KEY.";
  }
  console.log(`\n🔍 sendMessageToAssistant reçoit ${policies.length} policies`);
  try {
    const storage = require('../storage').storage;
    
    // Étape 1: Générer l'embedding de la question (peut échouer si ZScaler)
    let questionEmbedding: number[] | null;
    try {
      questionEmbedding = await generateEmbedding(message);
      if (questionEmbedding) console.log(`✅ Embedding généré pour: "${message.substring(0, 50)}..."`);
      else console.warn('⚠️ Embedding indisponible, mode dégradé sans RAG vectoriel');
    } catch (embErr) {
      console.warn('⚠️ Échec embedding, mode dégradé sans RAG:', embErr);
      questionEmbedding = null;
    }
    
    // Étape 2: Rechercher dans les embeddings des contrats utilisateurs
    let policyChunks: any[] = [];
    try {
      const policyIds = policies.map(p => parseInt(p.id));
      if (policyIds.length > 0 && questionEmbedding) {
        policyChunks = await storage.searchPolicyEmbeddings(questionEmbedding, policyIds, 5);
        console.log(`✅ RAG Policies: ${policyChunks.length} chunks trouvés`);
      }
    } catch (ragErr) {
      console.warn('⚠️ Échec recherche policy_embeddings:', ragErr);
    }
    
    // Étape 3: Rechercher dans les CG liées aux policies (central_cg et user_cg)
    let cgChunks: any[] = [];
    try {
      // Récupérer les IDs des CG liés aux policies
      let centralCgIds: number[] = policies.map(p => (p as any).centralCgId).filter(id => id != null).map(Number);
      const userCgIds = policies.map(p => (p as any).userCgId).filter(id => id != null);

      // Fallback A: policies avec insurerCode + typeCode
      const policiesWithBoth = policies.filter((p: any) => !p.centralCgId && p.insurerCode && p.typeCode);
      if (policiesWithBoth.length > 0) {
        try {
          const params: any[] = [];
          const conditions = policiesWithBoth.map((p: any) => {
            params.push(p.insurerCode, p.typeCode);
            let clause = `(cg.insurer_code = $${params.length - 1} AND cg.insurance_type_code = $${params.length}`;
            if (p.subTypeCode) {
              params.push(p.subTypeCode);
              clause += ` AND (cg.insurance_sub_type_code = $${params.length} OR cg.insurance_sub_type_code IS NULL)`;
            }
            clause += ')';
            return clause;
          }).join(' OR ');
          const cgLookup = await dbQuery(
            `SELECT id FROM central_cg WHERE (${conditions}) AND status = 'active' LIMIT 10`,
            params
          );
          const foundIds = cgLookup.rows.map((r: any) => Number(r.id));
          centralCgIds = [...new Set([...centralCgIds, ...foundIds])];
          if (foundIds.length > 0) console.log(`🔍 Fallback CG résolu par insurer+type: [${foundIds.join(', ')}]`);
        } catch (lookupErr) {
          console.warn('⚠️ Échec fallback CG lookup (insurer+type):', lookupErr);
        }
      }

      // Fallback B: policies sans typeCode → chercher par insurerCode seul
      const policiesInsurerOnly = policies.filter((p: any) => !p.centralCgId && p.insurerCode && !p.typeCode);
      if (policiesInsurerOnly.length > 0) {
        try {
          const insurerCodes = [...new Set(policiesInsurerOnly.map((p: any) => p.insurerCode))];
          const cgByInsurer = await dbQuery(
            `SELECT DISTINCT id FROM central_cg WHERE insurer_code = ANY($1) AND status = 'active' LIMIT 10`,
            [insurerCodes]
          );
          const foundByInsurer = cgByInsurer.rows.map((r: any) => Number(r.id));
          centralCgIds = [...new Set([...centralCgIds, ...foundByInsurer])];
          if (foundByInsurer.length > 0) console.log(`🔍 Fallback CG résolu par insurerCode seul: [${foundByInsurer.join(', ')}]`);
        } catch (lookupErr) {
          console.warn('⚠️ Échec fallback CG lookup (insurer only):', lookupErr);
        }
      }

      console.log(`🔍 Recherche CG liés aux policies: ${centralCgIds.length} central_cg, ${userCgIds.length} user_cg`);
      
      // Recherche dans central_cg via embeddings
      if (centralCgIds.length > 0 && questionEmbedding) {
        const centralResults = await dbQuery(
          `SELECT 
            cg.id,
            cg.content_text,
            i.label as insurer_label,
            it.label_fr as type_label,
            cg.metadata->>'productName' as product_name,
            1 - (cg.embedding <=> $1::vector) as similarity
          FROM central_cg cg
          LEFT JOIN insurers i ON cg.insurer_code = i.code
          LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
          WHERE cg.id = ANY($2)
            AND cg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 5`,
          [JSON.stringify(questionEmbedding), centralCgIds]
        );
        
        cgChunks = cgChunks.concat(centralResults.rows.filter((cg: any) => !isNaN(cg.similarity)));
        console.log(`✅ RAG central_cg: ${centralResults.rows.length} documents trouvés`);
      }
      
      // Recherche dans user_cg via embeddings
      if (userCgIds.length > 0) {
        const userResults = await dbQuery(
          `SELECT 
            ucg.id,
            ucg.content_text,
            i.label as insurer_label,
            it.label_fr as type_label,
            ucg.metadata->>'productName' as product_name,
            1 - (ucg.embedding <=> $1::vector) as similarity
          FROM user_cg ucg
          LEFT JOIN insurers i ON ucg.insurer_code = i.code
          LEFT JOIN insurance_types it ON ucg.insurance_type_code = it.code
          WHERE ucg.id = ANY($2)
            AND ucg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 5`,
          [JSON.stringify(questionEmbedding), userCgIds]
        );
        
        cgChunks = cgChunks.concat(userResults.rows.filter((cg: any) => !isNaN(cg.similarity)));
        console.log(`✅ RAG user_cg: ${userResults.rows.length} documents trouvés`);
      }
      
      // Trier par similarité
      cgChunks.sort((a, b) => b.similarity - a.similarity);
      cgChunks = cgChunks.slice(0, 5);

      // Fallback: si aucun résultat embedding (CG sans vecteur), lire le content_text directement
      if (cgChunks.length === 0) {
        if (centralCgIds.length > 0) {
          try {
            const fallbackCentral = await dbQuery(
              `SELECT cg.id, cg.content_text, i.label as insurer_label,
                      it.label_fr as type_label,
                      cg.metadata->>'productName' as product_name,
                      0.5 as similarity
               FROM central_cg cg
               LEFT JOIN insurers i ON cg.insurer_code = i.code
               LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
               WHERE cg.id = ANY($1) AND cg.content_text IS NOT NULL AND cg.content_text <> ''
               LIMIT 3`,
              [centralCgIds]
            );
            cgChunks = cgChunks.concat(fallbackCentral.rows);
            console.log(`📋 Fallback central_cg text: ${fallbackCentral.rows.length} docs (sans embedding)`);
          } catch (fbErr) {
            console.warn('⚠️ Échec fallback central_cg text:', fbErr);
          }
        }
        if (userCgIds.length > 0) {
          try {
            const fallbackUser = await dbQuery(
              `SELECT ucg.id, ucg.content_text, i.label as insurer_label,
                      it.label_fr as type_label,
                      ucg.metadata->>'productName' as product_name,
                      0.5 as similarity
               FROM user_cg ucg
               LEFT JOIN insurers i ON ucg.insurer_code = i.code
               LEFT JOIN insurance_types it ON ucg.insurance_type_code = it.code
               WHERE ucg.id = ANY($1) AND ucg.content_text IS NOT NULL AND ucg.content_text <> ''
               LIMIT 3`,
              [userCgIds]
            );
            cgChunks = cgChunks.concat(fallbackUser.rows);
            console.log(`📋 Fallback user_cg text: ${fallbackUser.rows.length} docs (sans embedding)`);
          } catch (fbErr) {
            console.warn('⚠️ Échec fallback user_cg text:', fbErr);
          }
        }
      }

      console.log(`✅ Total CG: ${cgChunks.length} documents pertinents`);
      cgChunks.forEach((cg, idx) => {
        console.log(`   ${idx + 1}. ${cg.insurer_label} - ${cg.type_label} (similarité: ${cg.similarity.toFixed(3)})`);
      });
      
    } catch (cgErr) {
      console.warn('⚠️ Échec recherche CG liées:', cgErr);
    }

    // Étape 3b: Données structurées coverage_facts (garantie × formule) — priorité absolue
    const coverageFacts: any[] = await resolveCoverageFacts(storage, policies, 'chat');

    // Étape 3c: Pages CG ciblées par le type de garantie détecté dans la question
    let relevantPages: any[] = [];
    try {
      const cgIdsForPages = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
      if (cgIdsForPages.length > 0) {
        const GUARANTEE_KEYWORDS: Record<string, string[]> = {
          'BRIS_GLACE': ['bris', 'glace', 'vitrage', 'pare-brise', 'lunette'],
          'VOL':        ['vol', 'cambriolage', 'tentative'],
          'INCENDIE':   ['incendie', 'feu', 'explosion'],
          'RC':         ['responsabilit', 'civil', 'tiers'],
          'DOMMAGES':   ['dommages', 'collision', 'choc', 'accident'],
          'ASSISTANCE': ['assistance', 'remorquage', 'panne'],
          'PJ':         ['protection juridique', 'défense', 'defense', 'recours'],
          'CONDUCTEUR': ['conducteur', 'corporel'],
          'CAT_NAT':    ['catastrophe', 'naturelle', 'tempête', 'tempete', 'grêle', 'grele'],
        };
        const msgLower = message.toLowerCase();
        const detectedCodes = Object.entries(GUARANTEE_KEYWORDS)
          .filter(([, kws]) => kws.some(kw => msgLower.includes(kw)))
          .map(([code]) => code);
        if (detectedCodes.length > 0) {
          const pagesResult = await dbQuery(
            `SELECT p.page_number, p.content_text, p.chunk_type, p.article_ref,
                    cg.url as pdf_url, i.label as insurer_label
             FROM central_cg_pages p
             JOIN central_cg cg ON p.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code
             WHERE p.central_cg_id = ANY($1) AND p.guarantee_codes && $2::text[]
             ORDER BY p.page_number LIMIT 10`,
            [cgIdsForPages, detectedCodes]
          );
          relevantPages = pagesResult.rows;
          console.log(`✅ Pages CG ciblées: ${relevantPages.length} pages (codes: ${detectedCodes.join(',')})`);
        }
      }
    } catch (pgErr) {
      console.warn('⚠️ Échec pages CG ciblées:', pgErr);
    }

    // Étape 4: Construire le contexte enrichi
    let enrichedContext = '';
    
    if (policyChunks.length > 0) {
      enrichedContext += '📄 Extraits de vos contrats:\n\n';
      policyChunks.forEach((chunk: any, idx: number) => {
        enrichedContext += `[${chunk.provider} - ${chunk.type}]\n${chunk.chunk_text.substring(0, 800)}...\n\n`;
      });
    }
    
    if (cgChunks.length > 0) {
      enrichedContext += '📚 Conditions générales:\n\n';
      cgChunks.forEach((cg: any, idx: number) => {
        const insurerName = cg.insurer_label || cg.insurer || 'Assureur inconnu';
        const productName = cg.product_name || cg.type_label || 'Produit';
        
        // Extraction intelligente : chercher les mots-clés de la question dans le document
        // Exclure les mots purement numériques (ex: modèle véhicule "5008") et les surnoms de contrats
        const policyNicknames = new Set(policies.map((p: any) => (p.name || '').toLowerCase()));
        const keywords = message.toLowerCase()
          .replace(/[^\w\séàèùäöüâêîôû]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3
            && !['pour', 'avec', 'dans', 'donne', 'quelle', 'comment', 'moi', 'mes', 'mon', 'les', 'des', 'une', 'est', 'que', 'couverte', 'couverts', 'couvert', 'contrat'].includes(w)
            && !/^\d+$/.test(w) // exclure les mots purement numériques (ex: modèle véhicule "5008")
            && !policyNicknames.has(w) // exclure les surnoms de contrats
          );
        
        // Ajouter les formules des policies comme mots-clés
        policies.forEach(p => {
          const formula = (p as any).formula;
          if (formula) {
            keywords.push(...formula.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          }
        });
        
        let extractedText = '';
        const fullText = cg.content_text || '';
        
        if (keywords.length > 0 && fullText.length > 10000) {
          // Chercher TOUTES les positions des mots-clés dans le texte
          const keywordPositions = new Map<string, number[]>();
          keywords.forEach(kw => {
            const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            let match;
            const positions: number[] = [];
            while ((match = regex.exec(fullText)) !== null) {
              positions.push(match.index);
            }
            if (positions.length > 0) {
              keywordPositions.set(kw, positions);
            }
          });
          
          if (keywordPositions.size > 0) {
            // Extraire plusieurs zones autour des occurrences de mots-clés
            const allPositions = Array.from(keywordPositions.values()).flat().sort((a, b) => a - b);
            console.log(`   📌 Trouvé ${allPositions.length} occurrences de mots-clés [${Array.from(keywordPositions.keys()).join(', ')}]`);
            
            const extractedChunks: string[] = [];
            const maxChunks = 5; // Extraire jusqu'à 5 zones différentes
            const chunkSize = 20000; // 20k par chunk
            
            // Grouper les positions proches ensemble
            const zones: number[] = [];
            allPositions.forEach(pos => {
              const hasNearbyZone = zones.some(z => Math.abs(z - pos) < 10000);
              if (!hasNearbyZone) {
                zones.push(pos);
              }
            });
            
            // Prendre les premières zones jusqu'à maxChunks
            zones.slice(0, maxChunks).forEach(centerPos => {
              const start = Math.max(0, centerPos - 5000);
              const end = Math.min(fullText.length, centerPos + chunkSize);
              extractedChunks.push(fullText.substring(start, end));
            });
            
            extractedText = extractedChunks.join('\n[...]\n');
            console.log(`   📌 Extraction de ${zones.length} zones (${extractedText.length} chars total)`);
          } else {
            // Aucun mot-clé trouvé, prendre début + milieu + fin pour couvrir large
            const third = Math.floor(fullText.length / 3);
            extractedText = fullText.substring(0, 15000) + 
                          '\n[...]\n' + 
                          fullText.substring(third, third + 15000) + 
                          '\n[...]\n' + 
                          fullText.substring(fullText.length - 15000);
            console.log(`   ⚠️ Aucun mot-clé trouvé, extraction 3 zones (début/milieu/fin)`);
          }
        } else {
          // Document court ou pas de mots-clés, prendre une grande partie
          extractedText = fullText.substring(0, 40000);
          console.log(`   📝 Document court ou peu de mots-clés, extraction 40k chars`);
        }
        
        enrichedContext += `[${insurerName} - ${productName}]\n${extractedText}\n\n`;
      });
    }

    // Données structurées coverage_facts (tableau précis garantie × formule — source prioritaire)
    if (coverageFacts.length > 0) {
      // ── Construire l'ensemble des options souscrites par l'utilisateur ──────
      // On collecte les options de TOUTES les policies pour construire un dict
      // guarantee_key → policy_name (pour attribution dans le tableau)
      const subscribedOptionsByKey = new Map<string, string>(); // key → policy name
      policies.forEach((p: any) => {
        const opts: string[] = Array.isArray(p.options)
          ? p.options
          : Array.isArray(p.metadata?.options)
          ? p.metadata.options
          : [];
        opts.forEach((opt: string) => {
          const k = normalizeKey(opt);
          subscribedOptionsByKey.set(k, p.name || 'Contrat');
          // Alias sans accents et variantes courtes (ex: "Bris de glace" → "bris_de_glace" déjà OK)
        });
      });

      const grouped = new Map<string, any[]>();
      coverageFacts.forEach((f: any) => {
        const fl = f.formula_label || '';
        const formulaDisplay = /^formule\s/i.test(fl) ? fl : `Formule ${fl}`;
        const key = `${f.insurer_label || 'Assureur'} - ${formulaDisplay}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(f);
      });

      // ── Bannière des options souscrites ──────────────────────────────────
      if (subscribedOptionsByKey.size > 0) {
        enrichedContext += '⚙️ OPTIONS SOUSCRITES PAR L\'UTILISATEUR (garanties EN OPTION effectivement achetées):\n';
        subscribedOptionsByKey.forEach((policyName, key) => {
          // Retrouver le label lisible depuis les facts (prefer guarantee_label)
          const matchFact = coverageFacts.find((f: any) => f.guarantee_key === key);
          const label = matchFact?.guarantee_label || key;
          enrichedContext += `  ✓ ${label} (contrat: ${policyName})\n`;
        });
        enrichedContext += '\n⚠️ INSTRUCTION IA: les options listées ci-dessus sont INCLUSES dans la couverture de l\'utilisateur même si le tableau les marque "EN OPTION". Réponds en conséquence.\n\n';
      }

      enrichedContext += '📊 TABLEAU DES GARANTIES PAR FORMULE (données structurées — à utiliser en PRIORITÉ):\n\n';
      grouped.forEach((facts, key) => {
        enrichedContext += `[${key}]\n`;
        facts.forEach((f: any) => {
          // Déterminer si cette garantie EN OPTION est souscrite par l'utilisateur
          const isSubscribedOption =
            f.coverage_status === 'optional' &&
            (subscribedOptionsByKey.has(f.guarantee_key) ||
             subscribedOptionsByKey.has(normalizeKey(f.guarantee_label || '')));

          const statusIcon = isSubscribedOption
            ? '✓ INCLUSE (option souscrite)'
            : f.coverage_status === 'included'  ? '✓ INCLUSE'
            : f.coverage_status === 'optional'  ? '○ EN OPTION (non souscrite)'
            : f.coverage_status === 'excluded'  ? '✗ EXCLUE'
            : '— N/A';

          const details = [
            f.coverage_amount ? `détail: ${f.coverage_amount}` : '',
            f.franchise       ? `franchise: ${f.franchise}`      : '',
            f.coverage_notes  ? f.coverage_notes.substring(0, 100) : ''
          ].filter(Boolean).join(', ');
          const pageSrc = f.source_page_number
            ? ` [page ${f.source_page_number}${f.pdf_url ? ` | PDF: ${f.pdf_url}` : ''}]`
            : '';
          enrichedContext += `- ${f.guarantee_label}: ${statusIcon}${details ? ` (${details})` : ''}${pageSrc}\n`;
        });
        enrichedContext += '\n';
      });
    }

    // Pages CG spécifiques à la garantie demandée (texte contractuel détaillé)
    if (relevantPages.length > 0) {
      enrichedContext += '📄 ARTICLES CG SPÉCIFIQUES À CETTE GARANTIE:\n\n';
      relevantPages.forEach((p: any) => {
        const artRef = p.article_ref ? ` | ${p.article_ref}` : '';
        enrichedContext += `[${p.insurer_label || 'Assureur'} - page ${p.page_number}${artRef}]\n`;
        enrichedContext += `${(p.content_text || '').substring(0, 2000)}\n`;
        if (p.pdf_url) enrichedContext += `SOURCE: ${p.pdf_url} page ${p.page_number}\n`;
        enrichedContext += '\n';
      });
    }

    // Si aucun contexte RAG, fallback sur metadata
    if (!enrichedContext) {
      console.log('⚠️ Aucun contexte RAG - utilisation metadata');
      enrichedContext = 'Vos contrats:\n' + policies.map(p => {
        const insurer = p.provider || (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || (p as any).coverage || (p as any).metadata?.formula || null;
        const options: string[] = (p as any).options || (p as any).metadata?.options || [];
        
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        const optionsInfo = options.length > 0
          ? ` - Options souscrites: ${options.join(', ')}`
          : '';
        return `- ${p.name} (${p.type}) chez ${insurer}${formulaInfo}${optionsInfo}: ${p.summary || 'Pas de résumé'}`;
      }).join('\n');
    } else {
      // Ajouter les infos des contrats utilisateur en début de contexte
      const policiesInfo = policies.map(p => {
        const insurer = p.provider || (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || (p as any).coverage || (p as any).metadata?.formula || null;
        const options: string[] = (p as any).options || (p as any).metadata?.options || [];
        
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        // Distinguer options souscrites clairement pour l'IA
        const optionsInfo = options.length > 0
          ? ` - Options souscrites (INCLUSES dans la couverture): ${options.join(', ')}`
          : ' - Aucune option souscrite';
        
        const policyLine = `${p.name}: ${insurer} / ${p.type}${formulaInfo}${optionsInfo}`;
        console.log(`📝 Contexte policy: ${policyLine}`);
        return policyLine;
      }).join('\n');
      enrichedContext = `📋 VOS CONTRATS:\n${policiesInfo}\n\n` + enrichedContext;
    }
    
    const systemInstruction = `Tu es l'assistant expert en assurance pour AssurClair. Tu as DIRECTEMENT ACCÈS aux conditions générales complètes des contrats de l'utilisateur.

CONTEXTE DISPONIBLE:

${enrichedContext}

IDENTIFICATION DES CONTRATS:
- Dans "📋 VOS CONTRATS", le premier champ (avant ":") est un SURNOM donné par l'utilisateur (peut être un modèle de véhicule ex: "5008", "308", "Clio", ou un nom de bien)
- Quand l'utilisateur mentionne un modèle de véhicule ("ma 5008", "mon SUV", "ma Clio"...), identifie le contrat Automobile dont le surnom correspond
- Identifie toujours le contrat par son TYPE + ASSUREUR + FORMULE, pas uniquement par son surnom
- Si le tableau 📊 affiche plusieurs formules (mode fallback), repère la formule de l'utilisateur dans "📋 VOS CONTRATS" et concentre ta réponse sur CETTE formule uniquement

RÈGLES ABSOLUES:
- Tu AS accès aux documents contractuels via le contexte ci-dessus
- Ne dis JAMAIS "je n'ai pas accès", "consultez vos documents", "vérifiez auprès de votre assureur"
- Identifie la formule exacte du contrat dans "📋 VOS CONTRATS" (ex: TIERS ESSENTIEL, TOUS RISQUES CONFORT, Plénitude...)
- Réponds UNIQUEMENT avec les infos SPÉCIFIQUES à SA formule
- Si le contexte contient "📊 TABLEAU DES GARANTIES PAR FORMULE": c'est la source la plus fiable (extraction directe du document) — utilise-la EN PRIORITÉ pour confirmer si une garantie est incluse, en option ou exclue
- Si le contexte contient "📄 ARTICLES CG SPÉCIFIQUES": utilise-les pour les détails (franchise, plafond, conditions, procédure de déclaration)
- Utilise TOUJOURS le format bullet point (liste à puces avec -)
- N'utilise JAMAIS de texte en gras (pas de ** ou __)
- Reste concis et direct
- Si l'info n'est pas dans le contexte fourni, dis simplement "Cette information n'apparaît pas dans vos conditions générales"

HIÉRARCHIE DES GARANTIES (CRITIQUE):
- Une clause d'exclusion GÉNÉRALE d'une section (ex: "dommages résultant d'une perte") ne s'applique JAMAIS à une autre section qui couvre spécifiquement ce cas
- Les garanties d'ASSISTANCE (serrurerie, plomberie, électricité, chauffage, dépannage) sont des PRESTATIONS DE SERVICE — elles sont distinctes et séparées des garanties couvrant les dommages aux biens
- Si la section "Assistance" mentionne explicitement "serrurerie", "perte de clés", "dépannage électrique" etc. → c'est INCLUS, même si la section "Protection des biens" exclut les "pertes" en général
- Principe de spécificité: une garantie SPÉCIFIQUE nommée dans une section l'emporte toujours sur une exclusion générale d'une autre section
- TOUJOURS lire la section "Assistance" INDÉPENDAMMENT de la section "Dommages aux biens" avant de répondre sur une prestation d'assistance
- Ne jamais appliquer une exclusion d'une section à une garantie couverte par une section différente du contrat

COHÉRENCE ET FIABILITÉ (CRITIQUE):
- Tes réponses sont DÉFINITIVES — chaque réponse doit être fiable du premier coup
- Ne JAMAIS s'excuser d'une réponse précédente, admettre une "imprécision initiale" ou "corriger" une réponse passée
- Interdiction absolue de phrases comme: "Je m'excuse", "Mon analyse initiale était incorrecte", "J'aurais dû", "je m'engage à être plus rigoureux", "Vous avez eu raison de me reprendre"
- Si une garantie est mentionnée dans le tableau 📊 comme INCLUSE → réponds INCLUSE, sans vérification contradictoire dans d'autres sections
- En cas de doute entre deux sections du contrat, applique TOUJOURS la règle de spécificité : la section qui nomme explicitement la garantie l'emporte

RÈGLE OPTIONS SOUSCRITES (CRITIQUE):
- Dans "📋 VOS CONTRATS", le champ "Options souscrites (INCLUSES dans la couverture): ..." liste les options que l'utilisateur a RÉELLEMENT ACHETÉES
- Dans le tableau 📊, ces options apparaissent marquées "✓ INCLUSE (option souscrite)" → elles SONT couvertes
- Si dans 📊 une option est "○ EN OPTION (non souscrite)" → elle N'EST PAS couverte
- Ne confonds JAMAIS "option disponible dans le contrat" avec "option souscrite par l'utilisateur"
- Si l'utilisateur demande "est-ce que je suis couvert pour X ?", vérifie d'abord la liste des options souscrites avant de répondre

FORMAT DE RÉPONSE OBLIGATOIRE:
- Une ligne d'introduction courte identifiant la formule
- Liste à puces avec - (jamais de *)
- Pas de sections avec titres en gras
- Indiquer clairement si la garantie demandée est INCLUSE / EN OPTION / EXCLUE dans la formule de l'utilisateur
- Terminer par une ligne source discrète: [NomProduit - page X](url_pdf) si url_pdf disponible, sinon [NomProduit - page X]

Exemple CORRECT (avec option souscrite):
Votre contrat MAAF AUTO avec formule TIERS ESSENTIEL + option Bris de glace couvre:

- Responsabilité civile: dommages causés aux tiers (illimité pour dommages corporels, 100M€ pour dommages matériels)
- Défense recours: prise en charge frais avocat jusqu'à 16 000€
- Assistance aux personnes: incluse dès 0 km
- Bris de glace: incluse (option souscrite — franchise 50€)

[CG MAAF Auto - page 5](https://storage.azure.com/cg/maaf-auto.pdf)

Exemple INTERDIT:
Il existe plusieurs niveaux de garantie. **Responsabilité civile** est obligatoire... Pour connaître votre couverture exacte, consultez vos Conditions Particulières.`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash'
    }, 'chat');
    
    // Ajouter le contexte système au premier message si l'historique est vide
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Compris, je suis prêt à vous aider avec vos polices d\'assurance en m\'appuyant sur les documents fournis.' }] },
        ...chatHistory
      ]
    });

    console.log(`📤 Envoi du message à Gemini...`);
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const responseText = response.text();
    console.log(`✅ Réponse Gemini reçue (${responseText.length} chars)`);
    return responseText || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (err: any) {
    console.error('❌ gemini sendMessageToAssistant error:', err);
    console.error('Stack:', err?.stack);
    return `Une erreur s'est produite lors de la communication avec l'assistant: ${err?.message || 'Erreur inconnue'}`;
  }
};

/**
 * Version streaming de sendMessageToAssistant
 * Envoie les chunks de réponse au fur et à mesure via un callback
 * @param callback - Fonction appelée pour chaque chunk de texte reçu
 */
export const sendMessageToAssistantStream = async (
  message: string,
  policies: any[],
  history: any[],
  onChunk: (chunk: string) => void
): Promise<void> => {
  console.log(`\n🔍 sendMessageToAssistantStream reçoit ${policies.length} policies`);
  
  try {
    const storage = require('../storage').storage;
    
    // Même logique d'extraction du contexte que sendMessageToAssistant
    let questionEmbedding: number[] | null;
    try {
      questionEmbedding = await generateEmbedding(message);
      if (questionEmbedding) console.log(`✅ Embedding généré pour streaming: "${message.substring(0, 50)}..."`);
      else console.warn('⚠️ Embedding indisponible, mode dégradé sans RAG vectoriel');
    } catch (embErr) {
      console.warn('⚠️ Échec embedding, mode dégradé sans RAG:', embErr);
      questionEmbedding = null;
    }

    // Rechercher dans les embeddings (même logique)
    let policyChunks: any[] = [];
    let cgChunks: any[] = [];

    try {
      const policyIds = policies.map(p => parseInt(p.id));
      if (policyIds.length > 0 && questionEmbedding) {
        policyChunks = await storage.searchPolicyEmbeddings(questionEmbedding, policyIds, 5);
      }
    } catch (ragErr) {
      console.warn('⚠️ Échec recherche policy_embeddings:', ragErr);
    }

    try {
      // Résolution des centralCgIds (direct + fallback insurer+type)
      let centralCgIds: number[] = policies.map(p => (p as any).centralCgId).filter(id => id != null).map(Number);
      const userCgIds = policies.map(p => (p as any).userCgId).filter(id => id != null);

      // Fallback A: policies avec insurerCode + typeCode
      const policiesWithBothStream = policies.filter((p: any) => !p.centralCgId && p.insurerCode && p.typeCode);
      if (policiesWithBothStream.length > 0) {
        try {
          const params: any[] = [];
          const conditions = policiesWithBothStream.map((p: any) => {
            params.push(p.insurerCode, p.typeCode);
            let clause = `(cg.insurer_code = $${params.length - 1} AND cg.insurance_type_code = $${params.length}`;
            if (p.subTypeCode) {
              params.push(p.subTypeCode);
              clause += ` AND (cg.insurance_sub_type_code = $${params.length} OR cg.insurance_sub_type_code IS NULL)`;
            }
            clause += ')';
            return clause;
          }).join(' OR ');
          const cgLookup = await dbQuery(
            `SELECT id FROM central_cg WHERE (${conditions}) AND status = 'active' LIMIT 10`,
            params
          );
          const foundIds = cgLookup.rows.map((r: any) => Number(r.id));
          centralCgIds = [...new Set([...centralCgIds, ...foundIds])];
          if (foundIds.length > 0) console.log(`🔍 Stream fallback CG (insurer+type): [${foundIds.join(', ')}]`);
        } catch (lookupErr) {
          console.warn('⚠️ Échec fallback CG lookup (stream insurer+type):', lookupErr);
        }
      }

      // Fallback B: policies sans typeCode → insurerCode seul
      const policiesInsurerOnlyStream = policies.filter((p: any) => !p.centralCgId && p.insurerCode && !p.typeCode);
      if (policiesInsurerOnlyStream.length > 0) {
        try {
          const insurerCodes = [...new Set(policiesInsurerOnlyStream.map((p: any) => p.insurerCode))];
          const cgByInsurer = await dbQuery(
            `SELECT DISTINCT id FROM central_cg WHERE insurer_code = ANY($1) AND status = 'active' LIMIT 10`,
            [insurerCodes]
          );
          const foundByInsurer = cgByInsurer.rows.map((r: any) => Number(r.id));
          centralCgIds = [...new Set([...centralCgIds, ...foundByInsurer])];
          if (foundByInsurer.length > 0) console.log(`🔍 Stream fallback CG (insurer only): [${foundByInsurer.join(', ')}]`);
        } catch (lookupErr) {
          console.warn('⚠️ Échec fallback CG lookup (stream insurer only):', lookupErr);
        }
      }

      if (centralCgIds.length > 0 && questionEmbedding) {
        const centralResults = await dbQuery(
          `SELECT 
            cg.id,
            cg.content_text,
            i.label as insurer_label,
            it.label_fr as type_label,
            cg.metadata->>'productName' as product_name,
            1 - (cg.embedding <=> $1::vector) as similarity
          FROM central_cg cg
          LEFT JOIN insurers i ON cg.insurer_code = i.code
          LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
          WHERE cg.id = ANY($2)
            AND cg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 5`,
          [JSON.stringify(questionEmbedding), centralCgIds]
        );
        cgChunks = cgChunks.concat(centralResults.rows.filter((cg: any) => !isNaN(cg.similarity)));
      }

      if (userCgIds.length > 0) {
        const userResults = await dbQuery(
          `SELECT 
            ucg.id,
            ucg.content_text,
            'CG Personnalisé' as insurer_label,
            it.label_fr as type_label,
            1 - (ucg.embedding <=> $1::vector) as similarity
          FROM user_cg ucg
          LEFT JOIN insurance_types it ON ucg.insurance_type_code = it.code
          WHERE ucg.id = ANY($2)
            AND ucg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 3`,
          [JSON.stringify(questionEmbedding), userCgIds]
        );
        cgChunks = cgChunks.concat(userResults.rows.filter((cg: any) => !isNaN(cg.similarity)));
      }

      // Sort + dedup
      cgChunks.sort((a, b) => b.similarity - a.similarity);
      cgChunks = cgChunks.slice(0, 5);

      // Fallback texte si aucun embedding disponible
      if (cgChunks.length === 0) {
        if (centralCgIds.length > 0) {
          try {
            const fbCentral = await dbQuery(
              `SELECT cg.id, cg.content_text, i.label as insurer_label,
                      it.label_fr as type_label, cg.metadata->>'productName' as product_name, 0.5 as similarity
               FROM central_cg cg
               LEFT JOIN insurers i ON cg.insurer_code = i.code
               LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
               WHERE cg.id = ANY($1) AND cg.content_text IS NOT NULL AND cg.content_text <> '' LIMIT 3`,
              [centralCgIds]
            );
            cgChunks = cgChunks.concat(fbCentral.rows);
            if (fbCentral.rows.length > 0) console.log(`📋 Stream fallback text central: ${fbCentral.rows.length} docs`);
          } catch (_) {}
        }
        if (userCgIds.length > 0) {
          try {
            const fbUser = await dbQuery(
              `SELECT ucg.id, ucg.content_text, 'CG Personnalisé' as insurer_label,
                      it.label_fr as type_label, 0.5 as similarity
               FROM user_cg ucg
               LEFT JOIN insurance_types it ON ucg.insurance_type_code = it.code
               WHERE ucg.id = ANY($1) AND ucg.content_text IS NOT NULL AND ucg.content_text <> '' LIMIT 3`,
              [userCgIds]
            );
            cgChunks = cgChunks.concat(fbUser.rows);
            if (fbUser.rows.length > 0) console.log(`📋 Stream fallback text user: ${fbUser.rows.length} docs`);
          } catch (_) {}
        }
      }
    } catch (cgErr) {
      console.warn('⚠️ Échec recherche CG:', cgErr);
    }

    // Étape 3b: Données structurées coverage_facts (garantie × formule) — priorité absolue
    const coverageFacts: any[] = await resolveCoverageFacts(storage, policies, 'stream');

    // Étape 3c: Pages CG ciblées par le type de garantie détecté dans la question
    let relevantPages: any[] = [];
    try {
      const cgIdsForPages = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
      if (cgIdsForPages.length > 0) {
        const GUARANTEE_KEYWORDS: Record<string, string[]> = {
          'BRIS_GLACE': ['bris', 'glace', 'vitrage', 'pare-brise', 'lunette'],
          'VOL':        ['vol', 'cambriolage', 'tentative'],
          'INCENDIE':   ['incendie', 'feu', 'explosion'],
          'RC':         ['responsabilit', 'civil', 'tiers'],
          'DOMMAGES':   ['dommages', 'collision', 'choc', 'accident'],
          'ASSISTANCE': ['assistance', 'remorquage', 'panne'],
          'PJ':         ['protection juridique', 'défense', 'defense', 'recours'],
          'CONDUCTEUR': ['conducteur', 'corporel'],
          'CAT_NAT':    ['catastrophe', 'naturelle', 'tempête', 'tempete', 'grêle', 'grele'],
        };
        const msgLower = message.toLowerCase();
        const detectedCodes = Object.entries(GUARANTEE_KEYWORDS)
          .filter(([, kws]) => kws.some(kw => msgLower.includes(kw)))
          .map(([code]) => code);
        if (detectedCodes.length > 0) {
          const pagesResult = await dbQuery(
            `SELECT p.page_number, p.content_text, p.chunk_type, p.article_ref,
                    cg.url as pdf_url, i.label as insurer_label
             FROM central_cg_pages p
             JOIN central_cg cg ON p.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code
             WHERE p.central_cg_id = ANY($1) AND p.guarantee_codes && $2::text[]
             ORDER BY p.page_number LIMIT 10`,
            [cgIdsForPages, detectedCodes]
          );
          relevantPages = pagesResult.rows;
          console.log(`✅ Pages CG ciblées (stream): ${relevantPages.length} pages (codes: ${detectedCodes.join(',')})`);
        }
      }
    } catch (pgErr) {
      console.warn('⚠️ Échec pages CG ciblées (stream):', pgErr);
    }

    // Construction du contexte enrichi (même logique d'extraction multi-zones)
    let enrichedContext = '';
    
    if (cgChunks.length > 0) {
      enrichedContext += '📚 Conditions générales:\n\n';
      cgChunks.forEach((cg: any) => {
        const insurerName = cg.insurer_label || 'Assureur inconnu';
        const productName = cg.product_name || cg.type_label || 'Produit';
        
        // Exclure les mots purement numériques (ex: modèle véhicule "5008") et les surnoms de contrats
        const policyNicknames = new Set(policies.map((p: any) => (p.name || '').toLowerCase()));
        const keywords = message.toLowerCase()
          .replace(/[^\w\séàèùäöüâêîôû]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3
            && !['pour', 'avec', 'dans', 'donne', 'quelle', 'comment', 'moi', 'mes', 'mon', 'les', 'des', 'une', 'est', 'que', 'couverte', 'couverts', 'couvert', 'contrat'].includes(w)
            && !/^\d+$/.test(w) // exclure les mots purement numériques (ex: modèle véhicule "5008")
            && !policyNicknames.has(w) // exclure les surnoms de contrats
          );
        
        policies.forEach(p => {
          const formula = (p as any).formula;
          if (formula) {
            keywords.push(...formula.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          }
        });
        
        let extractedText = '';
        const fullText = cg.content_text || '';
        
        if (keywords.length > 0 && fullText.length > 10000) {
          const keywordPositions = new Map<string, number[]>();
          keywords.forEach(kw => {
            const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            let match;
            const positions: number[] = [];
            while ((match = regex.exec(fullText)) !== null) {
              positions.push(match.index);
            }
            if (positions.length > 0) {
              keywordPositions.set(kw, positions);
            }
          });
          
          if (keywordPositions.size > 0) {
            const allPositions = Array.from(keywordPositions.values()).flat().sort((a, b) => a - b);
            const extractedChunks: string[] = [];
            const maxChunks = 5;
            const chunkSize = 20000;
            
            const zones: number[] = [];
            allPositions.forEach(pos => {
              const hasNearbyZone = zones.some(z => Math.abs(z - pos) < 10000);
              if (!hasNearbyZone) zones.push(pos);
            });
            
            zones.slice(0, maxChunks).forEach(centerPos => {
              const start = Math.max(0, centerPos - 5000);
              const end = Math.min(fullText.length, centerPos + chunkSize);
              extractedChunks.push(fullText.substring(start, end));
            });
            
            extractedText = extractedChunks.join('\n[...]\n');
          } else {
            const third = Math.floor(fullText.length / 3);
            extractedText = fullText.substring(0, 15000) + 
                          '\n[...]\n' + 
                          fullText.substring(third, third + 15000) + 
                          '\n[...]\n' + 
                          fullText.substring(fullText.length - 15000);
          }
        } else {
          extractedText = fullText.substring(0, 40000);
        }
        
        enrichedContext += `[${insurerName} - ${productName}]\n${extractedText}\n\n`;
      });
    }

    // Données structurées coverage_facts (tableau précis garantie × formule)
    if (coverageFacts.length > 0) {
      // Construire l'ensemble des options souscrites
      const subscribedOptionsByKey2 = new Map<string, string>();
      policies.forEach((p: any) => {
        const opts: string[] = (p as any).options || (p as any).metadata?.options || [];
        opts.forEach((opt: string) => {
          subscribedOptionsByKey2.set(normalizeKey(opt), p.name || 'Contrat');
        });
      });

      const grouped = new Map<string, any[]>();
      coverageFacts.forEach((f: any) => {
        const fl = f.formula_label || '';
        const formulaDisplay = /^formule\s/i.test(fl) ? fl : `Formule ${fl}`;
        const key = `${f.insurer_label || 'Assureur'} - ${formulaDisplay}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(f);
      });

      if (subscribedOptionsByKey2.size > 0) {
        enrichedContext += '⚙️ OPTIONS SOUSCRITES (garanties optionnelles effectivement achetées):\n';
        subscribedOptionsByKey2.forEach((policyName, key) => {
          const matchFact = coverageFacts.find((f: any) => f.guarantee_key === key);
          const label = matchFact?.guarantee_label || key;
          enrichedContext += `  ✓ ${label} (contrat: ${policyName})\n`;
        });
        enrichedContext += '\n';
      }

      enrichedContext += '📊 TABLEAU DES GARANTIES PAR FORMULE (données structurées — à utiliser en PRIORITÉ):\n\n';
      grouped.forEach((facts, key) => {
        enrichedContext += `[${key}]\n`;
        facts.forEach((f: any) => {
          const isSubscribedOption =
            f.coverage_status === 'optional' &&
            (subscribedOptionsByKey2.has(f.guarantee_key) ||
             subscribedOptionsByKey2.has(normalizeKey(f.guarantee_label || '')));

          const statusIcon = isSubscribedOption
            ? '✓ INCLUSE (option souscrite)'
            : f.coverage_status === 'included'  ? '✓ INCLUSE'
            : f.coverage_status === 'optional'  ? '○ EN OPTION (non souscrite)'
            : f.coverage_status === 'excluded'  ? '✗ EXCLUE'
            : '— N/A';
          const details = [
            f.coverage_amount ? `détail: ${f.coverage_amount}` : '',
            f.franchise       ? `franchise: ${f.franchise}`      : '',
            f.coverage_notes  ? f.coverage_notes.substring(0, 100) : ''
          ].filter(Boolean).join(', ');
          const pageSrc = f.source_page_number
            ? ` [page ${f.source_page_number}${f.pdf_url ? ` | PDF: ${f.pdf_url}` : ''}]`
            : '';
          enrichedContext += `- ${f.guarantee_label}: ${statusIcon}${details ? ` (${details})` : ''}${pageSrc}\n`;
        });
        enrichedContext += '\n';
      });
    }

    // Pages CG sp\u00e9cifiques \u00e0 la garantie demand\u00e9e
    if (relevantPages.length > 0) {
      enrichedContext += '\ud83d\udcc4 ARTICLES CG SP\u00c9CIFIQUES \u00c0 CETTE GARANTIE:\n\n';
      relevantPages.forEach((p: any) => {
        const artRef = p.article_ref ? ` | ${p.article_ref}` : '';
        enrichedContext += `[${p.insurer_label || 'Assureur'} - page ${p.page_number}${artRef}]\n`;
        enrichedContext += `${(p.content_text || '').substring(0, 2000)}\n`;
        if (p.pdf_url) enrichedContext += `SOURCE: ${p.pdf_url} page ${p.page_number}\n`;
        enrichedContext += '\n';
      });
    }

    if (!enrichedContext) {
      enrichedContext = 'Vos contrats:\n' + policies.map(p => {
        const insurer = (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || null;
        const options: string[] = (p as any).options || (p as any).metadata?.options || [];
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        const optionsInfo = options.length > 0
          ? ` - Options souscrites: ${options.join(', ')}`
          : '';
        return `- ${p.name} (${p.type}) chez ${insurer}${formulaInfo}${optionsInfo}`;
      }).join('\n');
    } else {
      const policiesInfo = policies.map(p => {
        const insurer = (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || null;
        const options: string[] = (p as any).options || (p as any).metadata?.options || [];
        const optionsInfo = options.length > 0
          ? ` - Options souscrites (INCLUSES): ${options.join(', ')}`
          : ' - Aucune option souscrite';
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        return `${p.name}: ${insurer} / ${p.type}${formulaInfo}${optionsInfo}`;
      }).join('\n');
      enrichedContext = `📋 VOS CONTRATS:\n${policiesInfo}\n\n` + enrichedContext;
    }
    
    const systemInstruction = `Tu es l'assistant expert en assurance pour AssurClair. Tu as DIRECTEMENT ACCÈS aux conditions générales complètes des contrats de l'utilisateur.

CONTEXTE DISPONIBLE:

${enrichedContext}

IDENTIFICATION DES CONTRATS:
- Dans "📋 VOS CONTRATS", le premier champ (avant ":") est un SURNOM donné par l'utilisateur (peut être un modèle de véhicule ex: "5008", "308", "Clio", ou un nom de bien)
- Quand l'utilisateur mentionne un modèle de véhicule ("ma 5008", "mon SUV", "ma Clio"...), identifie le contrat Automobile dont le surnom correspond
- Identifie toujours le contrat par son TYPE + ASSUREUR + FORMULE, pas uniquement par son surnom
- Si le tableau 📊 affiche plusieurs formules (mode fallback), repère la formule de l'utilisateur dans "📋 VOS CONTRATS" et concentre ta réponse sur CETTE formule uniquement

RÈGLES ABSOLUES:
- Tu AS accès aux documents contractuels via le contexte ci-dessus
- Ne dis JAMAIS "je n'ai pas accès", "consultez vos documents", "vérifiez auprès de votre assureur"
- Identifie la formule exacte du contrat dans "📋 VOS CONTRATS" (ex: TIERS ESSENTIEL, TOUS RISQUES CONFORT, Plénitude...)
- Réponds UNIQUEMENT avec les infos SPÉCIFIQUES à SA formule
- Si le contexte contient "📊 TABLEAU DES GARANTIES PAR FORMULE": c'est la source la plus fiable — utilise-la EN PRIORITÉ pour confirmer si une garantie est incluse, en option ou exclue
- Si le contexte contient "📄 ARTICLES CG SPÉCIFIQUES": utilise-les pour les détails (franchise, plafond, conditions)
- Utilise TOUJOURS le format bullet point (liste à puces avec -)
- N'utilise JAMAIS de texte en gras (pas de ** ou __)
- Reste concis et direct
- Indiquer clairement si la garantie demandée est INCLUSE / EN OPTION / EXCLUE dans la formule de l'utilisateur
- Si l'info n'est pas dans le contexte fourni, dis simplement "Cette information n'apparaît pas dans vos conditions générales"

HIÉRARCHIE DES GARANTIES (CRITIQUE):
- Une clause d'exclusion GÉNÉRALE d'une section (ex: "dommages résultant d'une perte") ne s'applique JAMAIS à une autre section qui couvre spécifiquement ce cas
- Les garanties d'ASSISTANCE (serrurerie, plomberie, électricité, chauffage, dépannage) sont des PRESTATIONS DE SERVICE — distinctes et séparées des garanties couvrant les dommages aux biens
- Si la section "Assistance" mentionne explicitement "serrurerie", "perte de clés", "dépannage électrique" etc. → c'est INCLUS, même si la section "Protection des biens" exclut les "pertes" en général
- Principe de spécificité: la garantie SPÉCIFIQUE nommée dans une section l'emporte toujours sur une exclusion générale d'une autre section
- Ne jamais appliquer une exclusion d'une section à une garantie couverte par une section différente du contrat

COHÉRENCE ET FIABILITÉ (CRITIQUE):
- Tes réponses sont DÉFINITIVES — chaque réponse doit être fiable du premier coup
- Ne JAMAIS s'excuser d'une réponse précédente, admettre une "imprécision initiale" ou "corriger" une réponse passée
- Interdiction absolue de phrases comme: "Je m'excuse", "Mon analyse initiale était incorrecte", "J'aurais dû", "je m'engage à être plus rigoureux", "Vous avez eu raison de me reprendre"
- Si une garantie est dans le tableau 📊 comme INCLUSE → réponds INCLUSE, sans contradiction possible via d'autres sections
- En cas de doute entre deux sections, applique la règle de spécificité : la section qui nomme explicitement la garantie l'emporte

FORMAT DE RÉPONSE OBLIGATOIRE:
- Une ligne d'introduction courte identifiant la formule
- Liste à puces avec - (jamais de *)
- Pas de sections avec titres en gras
- Terminer par une ligne source discrète: [NomProduit - page X](url_pdf) si url_pdf disponible, sinon [NomProduit - page X]`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const ai = getAiClient();
    if (!ai) {
      onChunk('[Erreur: Client AI non disponible]');
      return;
    }

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash'
    }, 'chatStream');
    
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Compris.' }] },
        ...chatHistory
      ]
    });

    console.log(`📤 Envoi du message à Gemini (streaming)...`);
    const result = await chat.sendMessageStream(message);
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        onChunk(chunkText);
      }
    }
    
    console.log(`✅ Streaming terminé`);
  } catch (err: any) {
    console.error('❌ gemini sendMessageToAssistantStream error:', err);
    onChunk(`\n\n[Erreur: ${err?.message || 'Erreur inconnue'}]`);
  }
};

/**
 * Extrait les contrats d'assurance à partir d'un texte libre.
 * Normalise les noms d'assureurs et identifie les types, formules et options.
 */
export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  const ai = getAiClient();
  if (!ai) {
    return { policies: [], clarificationQuestions: null };
  }

  try {
    const storage = require('../storage').storage;
    
    // 🔍 Étape 1 : Récupérer toutes les formules et options disponibles depuis central_cg
    let availableFormulasAndOptions = '';
    try {
      const allCg = await storage.readCentralCg();
      if (allCg && allCg.length > 0) {
        const formulasByInsurer: { [key: string]: string[] } = {};
        const optionsByInsurer: { [key: string]: string[] } = {};
        
        allCg.forEach((cg: any) => {
          const insurer = cg.insurer || 'Inconnu';
          const formulas = cg.metadata?.indexedFormulas || [];
          const options = cg.metadata?.indexedOptions || [];
          
          if (formulas.length > 0) {
            if (!formulasByInsurer[insurer]) formulasByInsurer[insurer] = [];
            formulasByInsurer[insurer].push(...formulas);
          }
          
          if (options.length > 0) {
            if (!optionsByInsurer[insurer]) optionsByInsurer[insurer] = [];
            optionsByInsurer[insurer].push(...options);
          }
        });
        
        // Construire la liste des formules et options disponibles
        if (Object.keys(formulasByInsurer).length > 0) {
          availableFormulasAndOptions += '\n📋 FORMULES DISPONIBLES PAR ASSUREUR (utilise-les en priorité):\n';
          for (const [insurer, formulas] of Object.entries(formulasByInsurer)) {
            availableFormulasAndOptions += `- ${insurer}: ${[...new Set(formulas)].join(', ')}\n`;
          }
        }
        
        if (Object.keys(optionsByInsurer).length > 0) {
          availableFormulasAndOptions += '\n🔧 OPTIONS DISPONIBLES PAR ASSUREUR (suggère-les si pertinent):\n';
          for (const [insurer, options] of Object.entries(optionsByInsurer)) {
            availableFormulasAndOptions += `- ${insurer}: ${[...new Set(options)].join(', ')}\n`;
          }
        }
        
        console.log('✅ Formules et options chargées depuis central_cg');
      }
    } catch (cgErr) {
      console.warn('⚠️ Impossible de charger les formules/options depuis central_cg:', cgErr);
    }

  const prompt = `Tu es un expert en analyse de documents d'assurance. Extrais les polices d'assurance du texte suivant et retourne un JSON.
${availableFormulasAndOptions}

IMPORTANT : 
- Si l'assureur est dans la liste ci-dessus, utilise EXACTEMENT les noms de formules listées (ne les invente pas).
- Suggère les options pertinentes si elles sont mentionnées ou implicites dans le texte.
- Si l'assureur n'est pas dans la liste, tu peux utiliser des noms génériques (Essentiel/Confort/Premium/etc.).

Format attendu :
{
  "policies": [
    {
      "type": "Auto" | "Habitation" | "Santé" | "Vie" | "Autre",
      "provider": "Nom de l'assureur",
      "name": "Nom du contrat",
      "coverageDetail": "Formule exacte (utilise celles de la liste ci-dessus si disponible)",
      "suggestedFormulas": ["Formule 1", "Formule 2"] ou [],
      "suggestedOptions": ["Option 1", "Option 2"] ou [],
      "premium": nombre ou null,
      "startDate": "YYYY-MM-DD" ou null
    }
  ],
  "clarificationQuestions": ["Question 1", "Question 2"] ou null
}

Si des informations sont manquantes ou ambiguës, génère des questions de clarification.

Texte à analyser :
${text}`;

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, 'parsePoliciesFromText');
    
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const jsonText = response.text();

    const parsed = JSON.parse(jsonText);
    return {
      policies: Array.isArray(parsed.policies) ? parsed.policies : [],
      clarificationQuestions: Array.isArray(parsed.clarificationQuestions) ? parsed.clarificationQuestions : null
    };
  } catch (err) {
    console.error('gemini parsePoliciesFromText error', err);
    return { policies: [], clarificationQuestions: null };
  }
};

/**
 * Indexe un document de Conditions Générales.
 * Si `contentText` est fourni (déjà extrait localement), Gemini reçoit uniquement
 * du texte brut → zéro token d'entrée lié au binaire PDF, output minimal.
 * Sinon, télécharge le PDF et l'envoie en binaire (fallback pour compatibilité).
 */
export const indexCgDocument = async (provider: string, type: string, pdfUrl: string, contentText?: string): Promise<any> => {
  const ai = getAiClient();
  if (!ai) {
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Service IA non disponible" };
  }

  // ─── CHEMIN OPTIMISÉ : texte déjà extrait localement ───────────────────────
  if (contentText && contentText.trim().length > 100) {
    console.log(`💡 indexCgDocument: utilisation du texte pré-extrait (${contentText.length} chars) - 0 token PDF`);
    try {
      const prompt = `Analyse ce texte extrait de Conditions Générales ${type} de chez ${provider}.

IMPORTANT: Base-toi UNIQUEMENT sur le contenu fourni. N'invente AUCUNE information.

Extrais du texte :
1. Les formules commerciales du contrat (les niveaux de couverture vendus par l'assureur).
   RÈGLES STRICTES — une formule est un EN-TÊTE DE COLONNE dans le tableau principal des garanties :
   • Exemples valides : Économique, Élargie, Confort, Tiers, Tous Risques, Essentiel, Gold, Premium, Bronze, Silver
   • NOMS COURTS : 1 à 5 mots maximum.
   • Si la formule s'appelle "Formule Économique", retourne "Économique" (sans le préfixe "Formule").
   • EXCLURE absolument : zones géographiques (France métropolitaine, Monaco, Corse, DROM, COM…)
   • EXCLURE : catégories produit ou segments clients (Appareils neufs, reconditionnés, Individu, Famille…)
   • EXCLURE : noms de garanties = lignes du tableau (Responsabilité Civile, Vol, Incendie, Bris de glace…)
   • EXCLURE : combinaisons avec "/" (ex : "Éco/Éq/Confort", "Standard / Autres Formules")
   • MAXIMUM 8 formules. En cas de doute, ne PAS inclure l'élément. Tableau vide [] si aucune formule certaine.
2. Les options complémentaires listées (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Si une information n'est pas présente, laisse le tableau vide ou indique "Non spécifié" dans le résumé.

Réponds UNIQUEMENT au format JSON suivant, sans texte ni markdown supplémentaire :
{
  "indexedFormulas": ["Économique", "Confort"],
  "indexedOptions": ["Option 1", "Option 2"],
  "semanticSummary": "Résumé des garanties principales..."
}

Texte du document (tronqué à 25 000 caractères) :
${contentText.slice(0, 25000)}`;

      const model = ai.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      }, 'indexCgDocument');
      const result = await model.generateContent([{ text: prompt }]);
      const response = await result.response;
      let jsonText = response.text().trim();

      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '');
      }
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonText);
      if (!parsed.indexedFormulas || !parsed.indexedOptions || !parsed.semanticSummary) {
        throw new Error('Réponse Gemini incomplète');
      }
      console.log(`✅ Indexation (texte): ${parsed.indexedFormulas.length} formules, ${parsed.indexedOptions.length} options`);
      return parsed;
    } catch (err: any) {
      console.error('❌ gemini indexCgDocument (texte) error:', err);
      return { indexedFormulas: [], indexedOptions: [], semanticSummary: `Erreur: ${err?.message || 'Erreur inconnue'}` };
    }
  }

  // ─── FALLBACK : envoi du PDF binaire (admin manuel, aucun texte pré-extrait) ─
  console.log(`📥 Téléchargement du PDF depuis: ${pdfUrl.substring(0, 100)}...`);
  try {
    // Télécharger le PDF
    let pdfBase64: string;
    if (pdfUrl.startsWith('data:application/pdf;base64,')) {
      // Si déjà en base64, extraire la partie data
      pdfBase64 = pdfUrl.split(',')[1];
    } else {
      // Sinon, télécharger depuis l'URL
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Impossible de télécharger le PDF: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
    }
    
    console.log(`✅ PDF téléchargé (${Math.round(pdfBase64.length / 1024)}KB en base64)`);

    const prompt = `Analyse en profondeur ce document PDF des Conditions Générales ${type} de chez ${provider}.

IMPORTANT: Base-toi UNIQUEMENT sur le contenu réel du document PDF fourni. N'invente AUCUNE information.

Extrais du document :
1. Les formules commerciales du contrat (les niveaux de couverture vendus par l'assureur).
   RÈGLES STRICTES — une formule est un EN-TÊTE DE COLONNE dans le tableau principal des garanties :
   • Exemples valides : Économique, Élargie, Confort, Tiers, Tous Risques, Essentiel, Gold, Premium, Bronze, Silver
   • NOMS COURTS : 1 à 5 mots maximum.
   • Si la formule s'appelle "Formule Économique", retourne "Économique" (sans le préfixe "Formule").
   • EXCLURE absolument : zones géographiques (France métropolitaine, Monaco, Corse, DROM, COM…)
   • EXCLURE : catégories produit ou segments clients (Appareils neufs, reconditionnés, Individu, Famille…)
   • EXCLURE : noms de garanties = lignes du tableau (Responsabilité Civile, Vol, Incendie, Bris de glace…)
   • EXCLURE : combinaisons avec "/" (ex : "Éco/Éq/Confort", "Standard / Autres Formules")
   • MAXIMUM 8 formules. En cas de doute, ne PAS inclure l'élément. Tableau vide [] si aucune formule certaine.
2. Les options complémentaires listées (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Si une information n'est pas présente dans le document, laisse le tableau vide ou indique "Non spécifié" dans le résumé.

Réponds UNIQUEMENT au format JSON suivant, sans texte ni markdown supplémentaire :
{
  "indexedFormulas": ["Économique", "Confort"],
  "indexedOptions": ["Option 1", "Option 2"],
  "semanticSummary": "Résumé des garanties principales..."
}`;

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, 'indexCgDocument_pdf');
    
    console.log(`📤 Demande d'indexation à Gemini avec le contenu du PDF`);
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      },
      prompt
    ]);
    const response = await result.response;
    let jsonText = response.text();
    
    console.log(`✅ Réponse Gemini reçue (${jsonText.length} chars)`);
    
    // Nettoyage robuste du JSON (enlever markdown, extraire JSON valide)
    jsonText = jsonText.trim();
    
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    }
    
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
    
    const parsed = JSON.parse(jsonText);
    
    if (!parsed.indexedFormulas || !parsed.indexedOptions || !parsed.semanticSummary) {
      throw new Error('Réponse Gemini incomplète');
    }
    
    console.log(`✅ Indexation réussie: ${parsed.indexedFormulas.length} formules, ${parsed.indexedOptions.length} options`);
    return parsed;
    
  } catch (err: any) {
    console.error('❌ gemini indexCgDocument error:', err);
    return { 
      indexedFormulas: [], 
      indexedOptions: [], 
      semanticSummary: `Erreur: ${err?.message || 'Erreur inconnue'}` 
    };
  }
};

/**
 * Génère un texte de partage court résumant le bilan AssurClair de l'utilisateur
 */
export const generateShareableReport = async (policies: Policy[], findings: any[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "J'ai fait mon bilan AssurClair !";
  }

  const prompt = `Génère un court texte de partage (max 2 phrases) résumant mon bilan AssurClair.
  Mes contrats : ${policies.map(p => `${p.provider} (${p.type})`).join(', ')}.
  ${findings.length > 0 ? `J'ai ${findings.length} optimisation(s) possibles.` : ''}
  Ton texte doit être engageant et positif.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'generateShareableReport');
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    return response.text().trim() || "J'ai fait mon bilan AssurClair !";
  } catch (error) {
    console.error('gemini generateShareableReport error', error);
    return "J'ai fait mon bilan AssurClair !";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Assistant Sinistre — Analyse de couverture et génération du plan d'actions
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimContext {
  typeAssurance: string;
  evenement: string;
  dateIncident: string;
  lieu?: string;
  tiers: boolean;
  dommages: string[];
  urgence: boolean;
  details?: string;
}

export interface ClaimAnalysisResult {
  isCovered: boolean | null;       // null = incertain
  confidence: 'high' | 'medium' | 'low';
  franchise?: string;
  declarationDeadlineDays: number;
  declarationDeadlineDate: string; // calculé côté front
  requiredDocs: string[];
  obligations: string[];
  actions: Array<{ step: number; label: string; priority: 'urgent' | 'important' | 'normal'; deadline?: string }>;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
  insurerContact?: string;
  disclaimer: string;
}

export interface ClaimLetterResult {
  letter: string;
  emailSubject: string;
}

const CLAIM_RULES: Record<string, { deadlineDays: number; volDeadlineDays: number; docs: string[] }> = {
  AUTO: {
    deadlineDays: 5,
    volDeadlineDays: 2,
    docs: ['Constat amiable ou rapport de police', 'Photos des dommages', 'Certificat d\'immatriculation', 'Permis de conduire'],
  },
  AUT01: {
    deadlineDays: 5,
    volDeadlineDays: 2,
    docs: ['Constat amiable ou rapport de police', 'Photos des dommages', 'Certificat d\'immatriculation', 'Permis de conduire'],
  },
  HAB01: {
    deadlineDays: 5,
    volDeadlineDays: 2,
    docs: ['Photos des dommages', 'Rapport artisan ou plombier', 'Factures de réparation', 'Liste des objets endommagés avec estimations'],
  },
  SAN01: {
    deadlineDays: 365,
    volDeadlineDays: 365,
    docs: ['Feuille de soins', 'Ordonnance médicale', 'Factures acquittées'],
  },
  VIE01: {
    deadlineDays: 30,
    volDeadlineDays: 30,
    docs: ['Certificat médical', 'Arrêt de travail', 'Justificatifs revenus'],
  },
  EMP01: {
    deadlineDays: 30,
    volDeadlineDays: 30,
    docs: ['Certificat médical', 'Arrêt de travail', 'Attestation employeur'],
  },
  JUR01: {
    deadlineDays: 30,
    volDeadlineDays: 30,
    docs: ['Description détaillée des faits', 'Documents contractuels litigieux', 'Correspondances'],
  },
};

const getClaimRules = (typeCode: string) =>
  CLAIM_RULES[typeCode] || CLAIM_RULES[(typeCode || '').replace(/[0-9]/g, '')] || { deadlineDays: 5, volDeadlineDays: 2, docs: [] };

export const analyzeClaim = async (
  claimCtx: ClaimContext,
  policyContext: string,   // résumé ou texte CG de la police
  policyName: string,
  insurerName: string,
  typeCode: string
): Promise<ClaimAnalysisResult> => {
  const ai = getAiClient();
  const rules = getClaimRules(typeCode);
  const isVol = /vol|theft|stolen/i.test(claimCtx.evenement);
  const deadlineDays = isVol ? rules.volDeadlineDays : rules.deadlineDays;

  const fallback: ClaimAnalysisResult = {
    isCovered: null,
    confidence: 'low',
    franchise: undefined,
    declarationDeadlineDays: deadlineDays,
    declarationDeadlineDate: '',
    requiredDocs: [...rules.docs, ...getBasicDocs(claimCtx)],
    obligations: [
      'Déclarer le sinistre dans les délais contractuels',
      'Ne pas aggraver les dommages avant expertise',
      'Conserver tous les documents et justificatifs',
    ],
    actions: buildDefaultActions(claimCtx, deadlineDays, rules.docs),
    reasoning: 'Analyse IA indisponible — se référer aux conditions générales du contrat.',
    riskLevel: 'medium',
    disclaimer: '⚠️ Cet assistant est un outil d\'aide à la préparation. Il ne remplace pas les conseils de votre assureur ou d\'un professionnel.',
  };

  if (!ai) return fallback;

  const prompt = `Tu es un expert en droit des assurances français. Analyse ce sinistre et réponds en JSON strict.

CONTRAT : "${policyName}" chez ${insurerName} (type: ${typeCode})
INFORMATIONS CONTRAT :
${policyContext || '(aucune information disponible — base-toi sur les règles générales du marché français)'}

SINISTRE DÉCLARÉ :
- Événement : ${claimCtx.evenement}
- Date : ${claimCtx.dateIncident}
- Lieu : ${claimCtx.lieu || 'non précisé'}
- Tiers impliqué : ${claimCtx.tiers ? 'Oui' : 'Non'}
- Dommages : ${claimCtx.dommages.join(', ') || 'non précisés'}
- Urgence : ${claimCtx.urgence ? 'Oui' : 'Non'}
- Détails : ${claimCtx.details || 'aucun'}

Réponds UNIQUEMENT en JSON valide, sans markdown ni texte autour :
{
  "isCovered": true | false | null,
  "confidence": "high" | "medium" | "low",
  "franchise": "montant ou description ou null",
  "declarationDeadlineDays": ${deadlineDays},
  "requiredDocs": ["doc1", "doc2", ...],
  "obligations": ["obligation1", ...],
  "actions": [
    {"step": 1, "label": "action claire et concrète", "priority": "urgent" | "important" | "normal", "deadline": "délai optionnel"},
    ...
  ],
  "reasoning": "explication courte et claire pour l'assuré (max 3 phrases)",
  "riskLevel": "low" | "medium" | "high",
  "insurerContact": "numéro ou adresse si connu ou null"
}

Règles :
- isCovered = null si incertain faute d'information suffisante
- Limite à 7 actions maximum, ordonnées par priorité
- reasoning en français, simple, compréhensible par un non-expert
- Si urgence = true, mettre "Appeler immédiatement le numéro d'urgence de votre assureur" en step 1
`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'analyzeClaim');
    const result = await model.generateContent([prompt]);
    const text = (await result.response).text().trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      isCovered: parsed.isCovered ?? null,
      confidence: parsed.confidence || 'medium',
      franchise: parsed.franchise || undefined,
      declarationDeadlineDays: deadlineDays,
      declarationDeadlineDate: '',
      requiredDocs: Array.isArray(parsed.requiredDocs) ? parsed.requiredDocs : rules.docs,
      obligations: Array.isArray(parsed.obligations) ? parsed.obligations : fallback.obligations,
      actions: Array.isArray(parsed.actions) ? parsed.actions : fallback.actions,
      reasoning: parsed.reasoning || fallback.reasoning,
      riskLevel: parsed.riskLevel || 'medium',
      insurerContact: parsed.insurerContact || undefined,
      disclaimer: '⚠️ Cet assistant est un outil d\'aide à la préparation. Il ne remplace pas les conseils de votre assureur ou d\'un professionnel.',
    };
  } catch (err) {
    console.error('[analyzeClaim] JSON parse error:', err);
    return fallback;
  }
};

export const generateClaimLetter = async (
  claimCtx: ClaimContext,
  analysis: ClaimAnalysisResult,
  policyName: string,
  insurerName: string,
  userFirstName: string,
  userLastName: string,
  userEmail?: string
): Promise<ClaimLetterResult> => {
  const ai = getAiClient();

  const dateFr = claimCtx.dateIncident
    ? new Date(claimCtx.dateIncident).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'date du sinistre';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const fallbackLetter = `${userFirstName} ${userLastName}
${userEmail || ''}

[Ville], le ${today}

Objet : Déclaration de sinistre — Contrat "${policyName}"

Madame, Monsieur,

Je soussigné(e) ${userFirstName} ${userLastName}, titulaire du contrat d'assurance "${policyName}" souscrit auprès de ${insurerName}, ai l'honneur de vous informer d'un sinistre survenu le ${dateFr}.

Nature du sinistre : ${claimCtx.evenement}
Lieu : ${claimCtx.lieu || 'à préciser'}
${claimCtx.tiers ? `Un tiers est impliqué dans ce sinistre.` : ''}
Dommages constatés : ${claimCtx.dommages.join(', ') || 'à décrire'}

${claimCtx.details ? `Circonstances détaillées :\n${claimCtx.details}\n` : ''}
Je vous transmets ci-joint les justificatifs suivants :
${analysis.requiredDocs.map(d => `- ${d}`).join('\n')}

Je reste à votre disposition pour tout renseignement complémentaire et vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

${userFirstName} ${userLastName}`;

  if (!ai) {
    return {
      letter: fallbackLetter,
      emailSubject: `Déclaration de sinistre — ${policyName} — ${dateFr}`,
    };
  }

  const prompt = `Rédige une lettre de déclaration de sinistre professionnelle en français pour :
- Assuré : ${userFirstName} ${userLastName}${userEmail ? ` — ${userEmail}` : ''}
- Assureur : ${insurerName}
- Contrat : "${policyName}"
- Sinistre : ${claimCtx.evenement} survenu le ${dateFr}
- Lieu : ${claimCtx.lieu || 'non précisé'}
- Tiers impliqué : ${claimCtx.tiers ? 'Oui' : 'Non'}
- Dommages : ${claimCtx.dommages.join(', ')}
- Détails : ${claimCtx.details || 'aucun'}
- Documents joints à mentionner : ${analysis.requiredDocs.join(', ')}
- Date de rédaction : ${today}

Rédige une lettre formelle complète (courrier postal), prête à envoyer. Inclus un objet clair.
Réponds en JSON : {"letter": "...", "emailSubject": "..."} — texte plain (pas de markdown dans la lettre).`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'generateClaimLetter');
    const result = await model.generateContent([prompt]);
    const text = (await result.response).text().trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      letter: parsed.letter || fallbackLetter,
      emailSubject: parsed.emailSubject || `Déclaration de sinistre — ${policyName}`,
    };
  } catch {
    return { letter: fallbackLetter, emailSubject: `Déclaration de sinistre — ${policyName} — ${dateFr}` };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Chat contextuel dans une session sinistre
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export const chatClaim = async (
  userMessage: string,
  history: ChatMessage[],
  claimData: ClaimContext,
  analysis: ClaimAnalysisResult | null,
  policyName: string,
  insurerName: string,
  policyContext: string = ''
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return 'Service IA non disponible. Vérifiez la configuration GEMINI_API_KEY.';

  const claimSummary = [
    `Événement : ${claimData.evenement || '?'}`,
    `Date : ${claimData.dateIncident || '?'}`,
    claimData.lieu ? `Lieu : ${claimData.lieu}` : '',
    (claimData.dommages || []).length ? `Dommages : ${claimData.dommages!.join(', ')}` : '',
    claimData.tiers ? 'Tiers impliqué.' : '',
  ].filter(Boolean).join(' | ');

  const analysisSummary = analysis
    ? `Couverture estimée : ${analysis.isCovered === true ? 'OUI' : analysis.isCovered === false ? 'NON' : 'INCERTAINE'}. Délai déclaration : ${analysis.declarationDeadlineDays}j. Franchise : ${analysis.franchise || 'inconnue'}.`
    : 'Analyse IA non encore effectuée.';

  const historyText = history
    .slice(-8) // Keep last 8 messages for context window
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const systemPrompt = `Tu es un assistant expert en assurance française, spécialisé dans l'accompagnement des assurés lors de sinistres.
Contrat concerné : ${policyName} (${insurerName}).
Sinistre déclaré : ${claimSummary}.
${analysisSummary}
${policyContext ? `Contexte contrat :\n${policyContext.slice(0, 2000)}` : ''}

Règles :
- Réponds en français, de façon concise et pédagogique
- Tu aides à préparer la déclaration, tu n'es pas l'assureur
- Si tu n'es pas sûr, dis-le clairement
- En cas d'urgence réelle, conseille d'appeler le 15/17/18 ou l'assureur directement
- Ne donne pas de conseils juridiques qui nécessiteraient un avocat`;

  const fullPrompt = `${systemPrompt}\n\nHistorique :\n${historyText}\n\nUtilisateur: ${userMessage}\nAssistant:`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'chatClaim');
    const result = await model.generateContent([fullPrompt]);
    const text = (await result.response).text().trim();
    return text || 'Désolé, je n\'ai pas pu générer une réponse. Veuillez réessayer.';
  } catch {
    return 'Une erreur est survenue. Veuillez réessayer ou contacter directement votre assureur.';
  }
};

function getBasicDocs(ctx: ClaimContext): string[] {
  const docs: string[] = [];
  if (ctx.tiers) docs.push('Coordonnées du tiers impliqué');
  if (/vol|theft/i.test(ctx.evenement)) docs.push('Dépôt de plainte (récépissé)');
  if (ctx.urgence) docs.push('Rapport des secours ou pompiers');
  return docs;
}

function buildDefaultActions(ctx: ClaimContext, deadlineDays: number, docs: string[]): any[] {
  const actions = [];
  let step = 1;
  if (ctx.urgence) actions.push({ step: step++, label: 'Appeler le numéro d\'urgence de votre assureur', priority: 'urgent', deadline: 'Immédiatement' });
  actions.push({ step: step++, label: 'Prendre des photos des dommages', priority: 'urgent', deadline: 'Dès que possible' });
  if (/dégât des eaux|fuite|inondation/i.test(ctx.evenement)) actions.push({ step: step++, label: 'Couper l\'eau et prévenir l\'aggravation', priority: 'urgent', deadline: 'Immédiatement' });
  if (/vol/i.test(ctx.evenement)) actions.push({ step: step++, label: 'Déposer plainte auprès des forces de l\'ordre', priority: 'urgent', deadline: 'Dans les 24h' });
  if (ctx.tiers) actions.push({ step: step++, label: 'Récupérer les coordonnées du tiers et établir un constat amiable', priority: 'urgent' });
  actions.push({ step: step++, label: `Déclarer le sinistre à votre assureur (délai légal : ${deadlineDays} jours ouvrés)`, priority: 'important', deadline: `Sous ${deadlineDays} jours` });
  if (docs.length > 0) actions.push({ step: step++, label: `Rassembler les pièces justificatives : ${docs.slice(0, 2).join(', ')}${docs.length > 2 ? '…' : ''}`, priority: 'important' });
  return actions;
}

