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
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

  const prompt = `Recherche les conditions générales et les garanties types pour ce produit d'assurance :\n  Assureur: ${provider}\n  Catégorie: ${type}\n  Nom commercial approximatif: ${name}\n\n  Instructions :\n  1. Identifie les garanties incluses par défaut pour ce type de contrat chez cet assureur.\n  2. Liste les noms exacts des formules commerciales (ex: \"Essentiel\", \"Confort\", \"Sérénité\", \"Tiers Plus\", \"Tous Risques\").\n  3. Fournis un résumé structuré des plafonds et franchises types si disponibles.\n\n  Réponds EXCLUSIVEMENT sous forme d'un objet JSON.\n  {\n    "summary": "Texte détaillé des garanties en français",\n    "formulas": ["Nom Formule A", "Nom Formule B"]\n  }`;

  try {
    const model = ai.getGenerativeModel({ 
      model: 'gemini-1.0-pro',
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

export const detectDuplicates = async (policies: Policy[]): Promise<OptimizationFinding[]> => {
  if (!policies || policies.length < 2) return [];
  const ai = getAiClient();
  if (!ai) return [];

  const prompt = `Analyse ces contrats d'assurance et identifie les optimisations possibles (doublons, gaps de couverture, économies potentielles).

Retourne un tableau JSON d'optimisations avec les champs:
- title: titre court
- description: explication détaillée
- type: 'duplicate' | 'gap' | 'saving'
- severity: 'low' | 'medium' | 'high'
- involvedPolicies: tableau d'IDs de polices concernées
- estimatedSaving: montant économisé estimé (optionnel)
- recommendation: recommandation d'action`;

  const parts: any[] = [{ text: prompt }];
  policies.forEach(p => {
    parts.push({ text: `Contrat ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail || 'Non spécifiée'}. Résumé : ${p.summary || ''}` });
  });

  try {
    const model = ai.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
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

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "Le service d'assistant est temporairement indisponible. Veuillez configurer GEMINI_API_KEY.";
  }

  try {
    const policyContext = policies.map(p => 
      `- ${p.name} (${p.type}) chez ${p.provider}: ${p.summary || 'Pas de résumé'}`
    ).join('\n');

    const systemInstruction = `Tu es un assistant expert en assurance. Voici les polices de l'utilisateur :\n${policyContext}\n\nRéponds en français de manière claire et concise.`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const model = ai.getGenerativeModel({ 
      model: 'gemini-1.5-flash'
    });
    
    // Ajouter le contexte système au premier message si l'historique est vide
    const chat = model.startChat({
      history: chatHistory.length === 0 ? [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Compris, je suis prêt à vous aider avec vos polices d\'assurance.' }] }
      ] : chatHistory
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    return response.text() || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (err) {
    console.error('gemini sendMessageToAssistant error', err);
    return "Une erreur s'est produite lors de la communication avec l'assistant.";
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
      model: 'gemini-pro',
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
