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
function getAiClient() {
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
    
    const cgResults = await storage.searchCentralCg(questionEmbedding, [provider], 1);
    
    if (cgResults.length > 0 && cgResults[0].similarity > 0.7) {
      const cg = cgResults[0];
      console.log(`✅ CG trouvée dans RAG: ${cg.insurer} - ${cg.product_name} (similarité: ${cg.similarity})`);
      
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
        sourceUrl: cg.document_url,
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
 * Génère un embedding de 768 dimensions pour un texte donné
 * Utilise le modèle text-embedding-004 de Gemini
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = getAiClient();
  if (!ai) {
    console.warn('No Gemini client - returning zero embedding');
    return new Array(768).fill(0);
  }

  try {
    const model = ai.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.error('generateEmbedding error:', err);
    return new Array(768).fill(0);
  }
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

  try {
    const storage = require('../storage').storage;
    
    // Étape 1: Générer l'embedding de la question (peut échouer si ZScaler)
    let questionEmbedding: number[];
    try {
      questionEmbedding = await generateEmbedding(message);
      console.log(`✅ Embedding généré pour: "${message.substring(0, 50)}..."`);
    } catch (embErr) {
      console.warn('⚠️ Échec embedding, mode dégradé sans RAG:', embErr);
      questionEmbedding = new Array(768).fill(0);
    }
    
    // Étape 2: Rechercher dans les embeddings des contrats utilisateurs
    let policyChunks: any[] = [];
    try {
      const policyIds = policies.map(p => parseInt(p.id));
      if (policyIds.length > 0) {
        policyChunks = await storage.searchPolicyEmbeddings(questionEmbedding, policyIds, 5);
        console.log(`✅ RAG Policies: ${policyChunks.length} chunks trouvés`);
      }
    } catch (ragErr) {
      console.warn('⚠️ Échec recherche policy_embeddings:', ragErr);
    }
    
    // Étape 3: Rechercher dans les CG centralisées
    let cgChunks: any[] = [];
    try {
      const insurers = policies.map(p => p.provider);
      if (insurers.length > 0) {
        cgChunks = await storage.searchCentralCg(questionEmbedding, insurers, 3);
        console.log(`✅ RAG CG: ${cgChunks.length} documents trouvés`);
      }
    } catch (cgErr) {
      console.warn('⚠️ Échec recherche central_cg:', cgErr);
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
        enrichedContext += `[${cg.insurer} - ${cg.product_name}]\n${cg.content_text?.substring(0, 800) || 'Texte non disponible'}...\n\n`;
      });
    }
    
    // Si aucun contexte RAG, fallback sur metadata
    if (!enrichedContext) {
      console.log('⚠️ Aucun contexte RAG - utilisation metadata');
      enrichedContext = 'Vos contrats:\n' + policies.map(p => 
        `- ${p.name} (${p.type}) chez ${p.provider}: ${p.summary || 'Pas de résumé'}`
      ).join('\n');
    }
    
    const systemInstruction = `Tu es un assistant expert en assurance. Réponds en français de manière claire et concise.
    
Voici le contexte disponible pour répondre:

${enrichedContext}

CONSIGNES:
- Cite toujours les clauses exactes quand tu réponds
- Si une information n'est pas dans le contexte, dis que tu ne la trouves pas dans les documents fournis
- Sois précis sur quel contrat tu parles`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash'
    });
    
    // Ajouter le contexte système au premier message si l'historique est vide
    const chat = model.startChat({
      history: chatHistory.length === 0 ? [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Compris, je suis prêt à vous aider avec vos polices d\'assurance en m\'appuyant sur les documents fournis.' }] }
      ] : chatHistory
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
 * Extrait les contrats d'assurance à partir d'un texte libre.
 * Normalise les noms d'assureurs et identifie les types, formules et options.
 */
export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  const ai = getAiClient();
  if (!ai) {
    return { policies: [], clarificationQuestions: null };
  }

  const prompt = `Tu es un expert en analyse de documents d'assurance. Extrais les polices d'assurance du texte suivant et retourne un JSON.

Format attendu :
{
  "policies": [
    {
      "type": "Auto" | "Habitation" | "Santé" | "Vie" | "Autre",
      "provider": "Nom de l'assureur",
      "name": "Nom du contrat",
      "coverageDetail": "Formule (Essentiel/Confort/Premium/etc.)",
      "premium": nombre ou null,
      "startDate": "YYYY-MM-DD" ou null
    }
  ],
  "clarificationQuestions": ["Question 1", "Question 2"] ou null
}

Si des informations sont manquantes ou ambiguës, génère des questions de clarification.

Texte à analyser :
${text}`;

  try {
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
 * Indexe un document de Conditions Générales via URL PDF
 * Retourne les formules, options et un résumé sémantique
 */
export const indexCgDocument = async (provider: string, type: string, pdfUrl: string): Promise<any> => {
  const ai = getAiClient();
  if (!ai) {
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Service IA non disponible" };
  }

  const prompt = `Analyse en profondeur le document PDF des Conditions Générales ${type} de chez ${provider} disponible à l'URL : ${pdfUrl}

Extrais : 
1. Les formules commerciales (ex: Tiers, Tous Risques, Initiale, Confort, Essentiel, Premium).
2. Les options complémentaires (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Réponds UNIQUEMENT au format JSON suivant, sans texte ni markdown supplémentaire :
{
  "indexedFormulas": ["Formule 1", "Formule 2"],
  "indexedOptions": ["Option 1", "Option 2"],
  "semanticSummary": "Résumé des garanties principales..."
}`;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
    
    console.log(`📤 Demande d'indexation à Gemini pour: ${pdfUrl}`);
    const result = await model.generateContent([prompt]);
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
