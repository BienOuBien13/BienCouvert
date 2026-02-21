import dotenv from 'dotenv';
import { WebSearchResult, DuplicateFinding, OptimizationFinding, Policy, Message, SmartExtractionResult, PolicyType } from '../types';

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
  return client;
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
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
      });
      
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
    });
    
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

  const prompt = `Analyse ces contrats d'assurance en fonction du profil utilisateur et identifie les optimisations possibles (doublons, gaps de couverture, économies potentielles).

PROFIL UTILISATEUR : ${JSON.stringify(profile)}

CRITÈRES D'ANALYSE PRIORITAIRES :
1. ADÉQUATION FAMILLE : Vérifie si les âges des membres justifient des garanties santé spécifiques.
2. HABITAT & RISQUES : Analyse la présence de piscine, jardin ou l'année de construction.
3. LOCALISATION : Utilise le code postal pour évaluer les risques géographiques.
4. ANIMAUX : Vérifie si une mutuelle santé animale ou RC adaptée existe.
5. DOUBLONS & MANQUES : Détecte les chevauchements et manques critiques en analysant les clauses exactes.

Retourne un tableau JSON d'optimisations avec les champs:
- title: titre court
- description: explication détaillée avec citations des clauses
- type: 'duplicate' | 'gap' | 'saving'
- severity: 'low' | 'medium' | 'high'
- involvedPolicies: tableau d'IDs de polices concernées
- savingsPotential: montant économisé estimé (nombre)
- recommendation: recommandation d'action`;

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
    });
    
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
 * Génère un embedding pour un texte donné via l'API REST Gemini.
 *
 * Règles REST Gemini (AI Studio) :
 *  - Le modèle est dans l'URL, PAS dans le body.
 *  - v1beta est la version correcte pour les clés AI Studio.
 *  - Fallback sur embedding-001 (768 dims) si text-embedding-004 introuvable.
 *  - Backoff exponentiel sur 429 / 503.
 */
// Modèles candidats pour embedding (ordre de préférence)
const EMBEDDING_MODELS = [
  'text-embedding-004',
  'text-multilingual-embedding-002',
  'embedding-001',
  'gemini-embedding-exp-03-07',
];

// Cache du modèle qui fonctionne (évite de re-tester à chaque page)
let _workingEmbedModel: string | null | undefined = undefined; // undefined = pas encore testé

async function callEmbedApi(modelName: string, text: string, retries: number): Promise<number[] | null> {
  // Utilise node-fetch pour compatibilité (évite les quirks du fetch natif Node)
  const nodeFetch = require('node-fetch');
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${GEMINI_KEY}`;

  let response: any;
  try {
    response = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 8192) }] }
      })
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
      return callEmbedApi(modelName, text, retries - 1);
    }
    return null;
  }

  if (response.status === 404 || response.status === 400) {
    // Modèle indisponible pour cette clé/région
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

  // Si on sait déjà qu'aucun modèle ne marche pour cette clé
  if (_workingEmbedModel === null) return null;

  // Utiliser directement le modèle connu si déjà trouvé
  const modelsToTry = _workingEmbedModel
    ? [_workingEmbedModel]
    : EMBEDDING_MODELS;

  for (const name of modelsToTry) {
    try {
      const values = await callEmbedApi(name, text, retries);
      if (values) {
        if (_workingEmbedModel === undefined) {
          console.log(`✅ Modèle embedding actif: ${name} (${values.length} dims)`);
          _workingEmbedModel = name;
        }
        return values;
      }
      if (_workingEmbedModel === undefined) {
        console.warn(`   ⚠️  ${name} → indisponible`);
      }
    } catch (err) {
      console.error(`generateEmbedding [${name}]:`, err);
    }
  }

  if (_workingEmbedModel === undefined) {
    console.error('❌ Aucun modèle embedding disponible pour cette clé API — les pages seront indexées sans vecteur (recherche sémantique désactivée).');
    _workingEmbedModel = null; // ne plus réessayer
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

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "Le service d'assistant est temporairement indisponible. Veuillez configurer GEMINI_API_KEY.";
  }
  // DEBUG: Afficher les policies reçues
  console.log(`\n🔍 sendMessageToAssistant reçoit ${policies.length} policies:`);
  policies.forEach((p: any, idx: number) => {
    console.log(`   ${idx + 1}. ${p.name} - summary: "${p.summary}" - metadata:`, p.metadata ? JSON.stringify(p.metadata).substring(0, 100) : 'null');
  });
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
      const centralCgIds = policies.map(p => (p as any).centralCgId).filter(id => id != null);
      const userCgIds = policies.map(p => (p as any).userCgId).filter(id => id != null);
      
      console.log(`🔍 Recherche CG liés aux policies: ${centralCgIds.length} central_cg, ${userCgIds.length} user_cg`);
      
      // Recherche dans central_cg via embeddings
      if (centralCgIds.length > 0 && questionEmbedding) {
        const centralResults = await storage.query(
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
        const userResults = await storage.query(
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
      
      console.log(`✅ Total CG: ${cgChunks.length} documents pertinents`);
      cgChunks.forEach((cg, idx) => {
        console.log(`   ${idx + 1}. ${cg.insurer_label} - ${cg.type_label} (similarité: ${cg.similarity.toFixed(3)})`);
      });
      
    } catch (cgErr) {
      console.warn('⚠️ Échec recherche CG liées:', cgErr);
    }

    // Étape 3b: Données structurées coverage_facts (garantie × formule) — priorité absolue
    let coverageFacts: any[] = [];
    try {
      const cgIdsForFacts = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
      if (cgIdsForFacts.length > 0) {
        const formulaKeys = policies
          .map(p => normalizeKey((p as any).formula || ''))
          .filter((k: string) => k.length > 2);
        const coverageFactsBase = `SELECT cf.guarantee_label, cf.guarantee_key, cf.formula_label, cf.formula_key,
                    cf.coverage_status, cf.coverage_amount, cf.franchise, cf.coverage_notes,
                    cf.source_page_number, cg.url as pdf_url, i.label as insurer_label
             FROM coverage_facts cf
             JOIN central_cg cg ON cf.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code`;
        let factsResult: any;
        if (formulaKeys.length > 0) {
          // Niveau 1: match exact de la formule (ex: "tous_risques_leasing")
          factsResult = await storage.query(
            `${coverageFactsBase}
             WHERE cf.central_cg_id = ANY($1) AND cf.formula_key = ANY($2)
             ORDER BY cf.guarantee_key`,
            [cgIdsForFacts, formulaKeys]
          );
          // Niveau 2: si vide, match partiel LIKE (ex: "tous_risques_leasing" → "tous_risques%")
          if (factsResult.rows.length === 0) {
            const baseKeys = [...new Set(formulaKeys.map((k: string) => k.split('_').slice(0, 2).join('_')))] as string[];
            const likeConditions = baseKeys.map((_: string, i: number) => `cf.formula_key LIKE $${i + 2}`).join(' OR ');
            const likeParams: any[] = [cgIdsForFacts, ...baseKeys.map((k: string) => `${k}%`)];
            factsResult = await storage.query(
              `${coverageFactsBase}
               WHERE cf.central_cg_id = ANY($1) AND (${likeConditions})
               ORDER BY cf.guarantee_key`,
              likeParams
            );
            if (factsResult.rows.length > 0) console.log(`✅ coverage_facts LIKE (${baseKeys.join(',')}): ${factsResult.rows.length} faits`);
          }
          // Niveau 3 (fallback total): toutes les formules du document CG
          if (factsResult.rows.length === 0) {
            factsResult = await storage.query(
              `${coverageFactsBase}
               WHERE cf.central_cg_id = ANY($1)
               ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
              [cgIdsForFacts]
            );
            if (factsResult.rows.length > 0) console.log(`✅ coverage_facts fallback (toutes formules): ${factsResult.rows.length} faits`);
          }
        } else {
          factsResult = await storage.query(
            `${coverageFactsBase}
             WHERE cf.central_cg_id = ANY($1)
             ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
            [cgIdsForFacts]
          );
        }
        coverageFacts = factsResult.rows;
        console.log(`✅ coverage_facts: ${coverageFacts.length} faits structurés`);
      }
    } catch (cfErr) {
      console.warn('⚠️ Échec coverage_facts:', cfErr);
    }

    // Niveau 4 (table_json fallback): si coverage_facts vide, lire directement central_cg_pages.table_json
    if (coverageFacts.length === 0) {
      try {
        const cgIdsForTableFallback = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
        if (cgIdsForTableFallback.length > 0) {
          const tableResult = await storage.query(
            `SELECT p.table_json, p.page_number, cg.url as pdf_url, i.label as insurer_label
             FROM central_cg_pages p
             JOIN central_cg cg ON p.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code
             WHERE p.central_cg_id = ANY($1) AND p.has_table = true AND p.table_json IS NOT NULL
             ORDER BY p.page_number`,
            [cgIdsForTableFallback]
          );
          tableResult.rows.forEach((row: any) => {
            const table = typeof row.table_json === 'string' ? JSON.parse(row.table_json) : row.table_json;
            if (table && Array.isArray(table.rows)) {
              const headers: string[] = Array.isArray(table.headers) ? table.headers : [];
              table.rows.forEach((tableRow: any) => {
                Object.entries(tableRow.formulas || {}).forEach(([geminiKey, sym]) => {
                  const fKey = normalizeKey(geminiKey);
                  const fLabel = headers.find((h: string) => normalizeKey(h) === fKey || normalizeKey(h) === fKey.replace(/_plus$/, '')) || geminiKey;
                  const s = String(sym).trim().toLowerCase();
                  const status = /✓|✔|●|•|oui|inclus|included/.test(s) ? 'included'
                    : /○|option/.test(s) ? 'optional'
                    : /-|—|non|exclu|excluded/.test(s) ? 'excluded'
                    : s.length > 0 ? 'included' : 'not_applicable';
                  coverageFacts.push({
                    guarantee_label: tableRow.guarantee || '',
                    guarantee_key: normalizeKey(tableRow.guarantee || ''),
                    formula_label: fLabel,
                    formula_key: fKey,
                    coverage_status: status,
                    coverage_amount: null,
                    franchise: null,
                    coverage_notes: null,
                    insurer_label: row.insurer_label,
                    source_page_number: row.page_number,
                    pdf_url: row.pdf_url
                  });
                });
              });
            }
          });
          if (coverageFacts.length > 0) console.log(`✅ coverage_facts depuis table_json: ${coverageFacts.length} faits`);
        }
      } catch (tjErr) {
        console.warn('⚠️ Échec table_json fallback:', tjErr);
      }
    }

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
          const pagesResult = await storage.query(
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
      const grouped = new Map<string, any[]>();
      coverageFacts.forEach((f: any) => {
        const key = `${f.insurer_label || 'Assureur'} - Formule ${f.formula_label}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(f);
      });
      enrichedContext += '📊 TABLEAU DES GARANTIES PAR FORMULE (données structurées — à utiliser en PRIORITÉ):\n\n';
      grouped.forEach((facts, key) => {
        enrichedContext += `[${key}]\n`;
        facts.forEach((f: any) => {
          const statusIcon = f.coverage_status === 'included' ? '✓ INCLUSE'
                           : f.coverage_status === 'optional' ? '○ EN OPTION'
                           : f.coverage_status === 'excluded' ? '✗ EXCLUE'
                           : '— N/A';
          const details = [
            f.coverage_amount ? `plafond: ${f.coverage_amount}` : '',
            f.franchise       ? `franchise: ${f.franchise}`      : '',
            f.coverage_notes  ? f.coverage_notes.substring(0, 80) : ''
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
        const options = (p as any).options || (p as any).metadata?.options || [];
        
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        const optionsInfo = options.length > 0 ? ` [Options: ${options.join(', ')}]` : '';
        return `- ${p.name} (${p.type}) chez ${insurer}${formulaInfo}${optionsInfo}: ${p.summary || 'Pas de résumé'}`;
      }).join('\n');
    } else {
      // Ajouter les infos des contrats utilisateur en début de contexte
      const policiesInfo = policies.map(p => {
        const insurer = p.provider || (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || (p as any).coverage || (p as any).metadata?.formula || null;
        const options = (p as any).options || (p as any).metadata?.options || [];
        
        // Construire la ligne avec toutes les infos importantes
        const optionsInfo = options.length > 0 ? ` [Options: ${options.join(', ')}]` : '';
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        
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

FORMAT DE RÉPONSE OBLIGATOIRE:
- Une ligne d'introduction courte identifiant la formule
- Liste à puces avec - (jamais de *)
- Pas de sections avec titres en gras
- Indiquer clairement si la garantie demandée est INCLUSE / EN OPTION / EXCLUE dans la formule de l'utilisateur
- Terminer par une ligne source discrète: [NomProduit - page X](url_pdf) si url_pdf disponible, sinon [NomProduit - page X]

Exemple CORRECT:
Votre contrat MAAF AUTO avec formule TIERS ESSENTIEL couvre:

- Responsabilité civile: dommages causés aux tiers (illimité pour dommages corporels, 100M€ pour dommages matériels)
- Défense recours: prise en charge frais avocat jusqu'à 16 000€
- Assistance aux personnes: incluse dès 0 km
- Bris de glace: EN OPTION (franchise 50€ — à souscrire séparément)

[CG MAAF Auto - page 5](https://storage.azure.com/cg/maaf-auto.pdf)

Exemple INTERDIT:
Il existe plusieurs niveaux de garantie. **Responsabilité civile** est obligatoire... Pour connaître votre couverture exacte, consultez vos Conditions Particulières.`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash'
    });
    
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
      const centralCgIds = policies.map(p => (p as any).centralCgId).filter(id => id != null);
      const userCgIds = policies.map(p => (p as any).userCgId).filter(id => id != null);

      if (centralCgIds.length > 0 && questionEmbedding) {
        const centralResults = await storage.query(
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
        const userResults = await storage.query(
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
    } catch (cgErr) {
      console.warn('⚠️ Échec recherche CG:', cgErr);
    }

    // Étape 3b: Données structurées coverage_facts (garantie × formule) — priorité absolue
    let coverageFacts: any[] = [];
    try {
      const cgIdsForFacts = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
      if (cgIdsForFacts.length > 0) {
        const formulaKeys = policies
          .map(p => normalizeKey((p as any).formula || ''))
          .filter((k: string) => k.length > 2);
        const coverageFactsBase = `SELECT cf.guarantee_label, cf.guarantee_key, cf.formula_label, cf.formula_key,
                    cf.coverage_status, cf.coverage_amount, cf.franchise, cf.coverage_notes,
                    cf.source_page_number, cg.url as pdf_url, i.label as insurer_label
             FROM coverage_facts cf
             JOIN central_cg cg ON cf.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code`;
        let factsResult: any;
        if (formulaKeys.length > 0) {
          // Niveau 1: match exact de la formule
          factsResult = await storage.query(
            `${coverageFactsBase}
             WHERE cf.central_cg_id = ANY($1) AND cf.formula_key = ANY($2)
             ORDER BY cf.guarantee_key`,
            [cgIdsForFacts, formulaKeys]
          );
          // Niveau 2: si vide, match partiel LIKE (ex: "tous_risques_leasing" → "tous_risques%")
          if (factsResult.rows.length === 0) {
            const baseKeys = [...new Set(formulaKeys.map((k: string) => k.split('_').slice(0, 2).join('_')))] as string[];
            const likeConditions = baseKeys.map((_: string, i: number) => `cf.formula_key LIKE $${i + 2}`).join(' OR ');
            const likeParams: any[] = [cgIdsForFacts, ...baseKeys.map((k: string) => `${k}%`)];
            factsResult = await storage.query(
              `${coverageFactsBase}
               WHERE cf.central_cg_id = ANY($1) AND (${likeConditions})
               ORDER BY cf.guarantee_key`,
              likeParams
            );
            if (factsResult.rows.length > 0) console.log(`✅ coverage_facts LIKE stream (${baseKeys.join(',')}): ${factsResult.rows.length} faits`);
          }
          // Niveau 3 (fallback total): toutes les formules du document CG
          if (factsResult.rows.length === 0) {
            factsResult = await storage.query(
              `${coverageFactsBase}
               WHERE cf.central_cg_id = ANY($1)
               ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
              [cgIdsForFacts]
            );
            if (factsResult.rows.length > 0) console.log(`✅ coverage_facts fallback stream (toutes formules): ${factsResult.rows.length} faits`);
          }
        } else {
          factsResult = await storage.query(
            `${coverageFactsBase}
             WHERE cf.central_cg_id = ANY($1)
             ORDER BY cf.formula_key, cf.guarantee_key LIMIT 200`,
            [cgIdsForFacts]
          );
        }
        coverageFacts = factsResult.rows;
        console.log(`✅ coverage_facts (stream): ${coverageFacts.length} faits structurés`);
      }
    } catch (cfErr) {
      console.warn('⚠️ Échec coverage_facts (stream):', cfErr);
    }

    // Niveau 4 (table_json fallback stream): si coverage_facts vide, lire directement central_cg_pages.table_json
    if (coverageFacts.length === 0) {
      try {
        const cgIdsForTableFallback = policies.map(p => (p as any).centralCgId).filter((id: any) => id != null);
        if (cgIdsForTableFallback.length > 0) {
          const tableResult = await storage.query(
            `SELECT p.table_json, p.page_number, cg.url as pdf_url, i.label as insurer_label
             FROM central_cg_pages p
             JOIN central_cg cg ON p.central_cg_id = cg.id
             LEFT JOIN insurers i ON cg.insurer_code = i.code
             WHERE p.central_cg_id = ANY($1) AND p.has_table = true AND p.table_json IS NOT NULL
             ORDER BY p.page_number`,
            [cgIdsForTableFallback]
          );
          tableResult.rows.forEach((row: any) => {
            const table = typeof row.table_json === 'string' ? JSON.parse(row.table_json) : row.table_json;
            if (table && Array.isArray(table.rows)) {
              const headers: string[] = Array.isArray(table.headers) ? table.headers : [];
              table.rows.forEach((tableRow: any) => {
                Object.entries(tableRow.formulas || {}).forEach(([geminiKey, sym]) => {
                  const fKey = normalizeKey(geminiKey);
                  const fLabel = headers.find((h: string) => normalizeKey(h) === fKey || normalizeKey(h) === fKey.replace(/_plus$/, '')) || geminiKey;
                  const s = String(sym).trim().toLowerCase();
                  const status = /✓|✔|●|•|oui|inclus|included/.test(s) ? 'included'
                    : /○|option/.test(s) ? 'optional'
                    : /-|—|non|exclu|excluded/.test(s) ? 'excluded'
                    : s.length > 0 ? 'included' : 'not_applicable';
                  coverageFacts.push({
                    guarantee_label: tableRow.guarantee || '',
                    guarantee_key: normalizeKey(tableRow.guarantee || ''),
                    formula_label: fLabel,
                    formula_key: fKey,
                    coverage_status: status,
                    coverage_amount: null,
                    franchise: null,
                    coverage_notes: null,
                    insurer_label: row.insurer_label,
                    source_page_number: row.page_number,
                    pdf_url: row.pdf_url
                  });
                });
              });
            }
          });
          if (coverageFacts.length > 0) console.log(`✅ coverage_facts depuis table_json (stream): ${coverageFacts.length} faits`);
        }
      } catch (tjErr) {
        console.warn('⚠️ Échec table_json fallback (stream):', tjErr);
      }
    }

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
          const pagesResult = await storage.query(
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

    // Donn\u00e9es structur\u00e9es coverage_facts (tableau pr\u00e9cis garantie \u00d7 formule)
    if (coverageFacts.length > 0) {
      const grouped = new Map<string, any[]>();
      coverageFacts.forEach((f: any) => {
        const key = `${f.insurer_label || 'Assureur'} - Formule ${f.formula_label}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(f);
      });
      enrichedContext += '\ud83d\udcca TABLEAU DES GARANTIES PAR FORMULE (donn\u00e9es structur\u00e9es \u2014 \u00e0 utiliser en PRIORIT\u00c9):\n\n';
      grouped.forEach((facts, key) => {
        enrichedContext += `[${key}]\n`;
        facts.forEach((f: any) => {
          const statusIcon = f.coverage_status === 'included' ? '\u2713 INCLUSE'
                           : f.coverage_status === 'optional' ? '\u25cb EN OPTION'
                           : f.coverage_status === 'excluded' ? '\u2717 EXCLUE'
                           : '\u2014 N/A';
          const details = [
            f.coverage_amount ? `plafond: ${f.coverage_amount}` : '',
            f.franchise       ? `franchise: ${f.franchise}`      : '',
            f.coverage_notes  ? f.coverage_notes.substring(0, 80) : ''
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
        const options = (p as any).options || [];
        const formulaInfo = formula ? ` - Formule: ${formula}` : '';
        const optionsInfo = options.length > 0 ? ` [Options: ${options.join(', ')}]` : '';
        return `- ${p.name} (${p.type}) chez ${insurer}${formulaInfo}${optionsInfo}`;
      }).join('\n');
    } else {
      const policiesInfo = policies.map(p => {
        const insurer = (p as any).insurer || 'Assureur inconnu';
        const formula = (p as any).formula || null;
        const options = (p as any).options || [];
        const optionsInfo = options.length > 0 ? ` [Options: ${options.join(', ')}]` : '';
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
    });
    
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
    });
    
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
 * Indexe un document de Conditions Générales via URL PDF ou base64
 * Télécharge le PDF et l'analyse directement pour extraire uniquement le contenu réel
 */
export const indexCgDocument = async (provider: string, type: string, pdfUrl: string): Promise<any> => {
  const ai = getAiClient();
  if (!ai) {
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Service IA non disponible" };
  }

  try {
    console.log(`📥 Téléchargement du PDF depuis: ${pdfUrl.substring(0, 100)}...`);
    
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
1. Les formules commerciales mentionnées (ex: Tiers, Tous Risques, Initiale, Confort, Essentiel, Premium).
2. Les options complémentaires listées (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Si une information n'est pas présente dans le document, laisse le tableau vide ou indique "Non spécifié" dans le résumé.

Réponds UNIQUEMENT au format JSON suivant, sans texte ni markdown supplémentaire :
{
  "indexedFormulas": ["Formule 1", "Formule 2"],
  "indexedOptions": ["Option 1", "Option 2"],
  "semanticSummary": "Résumé des garanties principales..."
}`;

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
    
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
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    return response.text().trim() || "J'ai fait mon bilan AssurClair !";
  } catch (error) {
    console.error('gemini generateShareableReport error', error);
    return "J'ai fait mon bilan AssurClair !";
  }
};
