"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageToAssistant = exports.detectDuplicates = exports.searchPolicyInfo = exports.summarizePolicy = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// -----------------------------------------------------------------------------
// Service AI (Gemini) - wrapper minimal
// Ce service encapsule l'accès à l'API Gemini (librairie `@google/genai`). Si la
// clé `GEMINI_API_KEY` n'est pas définie, les fonctions retournent des valeurs
// simulées, ce qui facilite le prototypage local sans accès à Gemini.
// -----------------------------------------------------------------------------
dotenv_1.default.config();
const GEMINI_KEY = process.env.GEMINI_API_KEY;
let client = null;
/**
 * Crée et met en cache un client Gemini si la clé est disponible.
 * Retourne `null` si la clé est absente ou si l'import échoue.
 */
function getAiClient() {
    if (!GEMINI_KEY)
        return null;
    if (!client) {
        try {
            const mod = require('@google/genai');
            const GoogleGenAI = mod?.GoogleGenAI || mod?.default?.GoogleGenAI || mod?.default;
            if (!GoogleGenAI) {
                console.error('Loaded @google/genai but could not find GoogleGenAI export.');
                return null;
            }
            client = new GoogleGenAI({ apiKey: GEMINI_KEY });
        }
        catch (e) {
            console.error('Failed to require @google/genai - AI features will be disabled. Install @google/genai to enable them.', e);
            return null;
        }
    }
    return client;
}
const generateSystemInstruction = (policies = []) => {
    let context = "Tu es AssurClair, un assistant personnel expert en assurances. Ton but est d'aider l'utilisateur à comprendre ses couvertures. ";
    context += "Voici la liste des contrats de l'utilisateur (analyse-les pour répondre) :\n";
    policies.forEach(p => {
        context += `- Contrat \"${p.name}\" chez \"${p.provider}\" (Type: ${p.type}, Formule: ${p.coverageDetail || 'Non spécifiée'}). `;
        if (p.summary)
            context += `Résumé garanties: ${p.summary}. `;
        if (p.sourceUrl)
            context += `Source web: ${p.sourceUrl}. `;
        context += "\n";
    });
    context += "\nConsignes :\n1. Sois précis et cite le contrat concerné quand tu réponds.\n2. Si une garantie n'est pas mentionnée, dis que tu ne la trouves pas dans les documents.\n3. Sois concis et serviable.";
    return context;
};
const summarizePolicy = async (fileBase64, mimeType) => {
    // Tente d'obtenir un résumé via Gemini. Si le client AI n'est pas dispo
    // (clé manquante ou lib non installée), on retourne un message simulé
    // pour que l'UX reste cohérente en environnement de développement.
    const ai = getAiClient();
    if (!ai) {
        return `Résumé simulé (${mimeType}) : impossible d'accéder à Gemini, configurez GEMINI_API_KEY.`;
    }
    try {
        // On envoie d'abord le fichier (inlineData) puis l'instruction de résumé.
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: fileBase64
                        }
                    },
                    {
                        text: "Analyse ce document d'assurance. Extrais en français : le nom de l'assureur, le type de contrat, et une liste à puces très concise des garanties majeures. Limite la réponse à 150 mots."
                    }
                ]
            },
            config: {
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        // response.text contient le texte renvoyé par Gemini (ou undefined)
        return response.text || 'Impossible de générer un résumé.';
    }
    catch (err) {
        // Log détaillé pour faciliter le débogage en dev
        console.error('gemini summarize error', err);
        throw err;
    }
};
exports.summarizePolicy = summarizePolicy;
const searchPolicyInfo = async (provider, type, name) => {
    const ai = getAiClient();
    if (!ai) {
        return { summary: `Recherche simulée pour ${provider} - ${type} - ${name}`, sourceUrl: undefined, detectedFormulas: [] };
    }
    const prompt = `Recherche les conditions générales et les garanties types pour ce produit d'assurance :\n  Assureur: ${provider}\n  Catégorie: ${type}\n  Nom commercial approximatif: ${name}\n\n  Instructions :\n  1. Identifie les garanties incluses par défaut pour ce type de contrat chez cet assureur.\n  2. Liste les noms exacts des formules commerciales (ex: \"Essentiel\", \"Confort\", \"Sérénité\", \"Tiers Plus\", \"Tous Risques\").\n  3. Fournis un résumé structuré des plafonds et franchises types si disponibles.\n\n  Réponds EXCLUSIVEMENT sous forme d'un objet JSON.\n  {\n    "summary": "Texte détaillé des garanties en français",\n    "formulas": ["Nom Formule A", "Nom Formule B"]\n  }`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json'
            }
        });
        let jsonResponse = {};
        try {
            jsonResponse = JSON.parse(response.text);
        }
        catch (e) {
            jsonResponse = { summary: response.text, formulas: [] };
        }
        const summary = jsonResponse.summary || 'Aucun résumé structuré disponible.';
        const detectedFormulas = Array.isArray(jsonResponse.formulas) ? jsonResponse.formulas : [];
        let sourceUrl = undefined;
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks && chunks.length > 0) {
            const webChunk = chunks.find((c) => c.web?.uri);
            if (webChunk)
                sourceUrl = webChunk.web.uri;
        }
        return { summary, sourceUrl, detectedFormulas };
    }
    catch (err) {
        console.error('gemini search error', err);
        return { summary: 'La recherche automatique n\'a pas pu aboutir.', sourceUrl: undefined, detectedFormulas: [] };
    }
};
exports.searchPolicyInfo = searchPolicyInfo;
const detectDuplicates = async (policies) => {
    if (!policies || policies.length < 2)
        return [];
    const ai = getAiClient();
    if (!ai)
        return [];
    const parts = [
        { text: `Analyse ces contrats d'assurance et identifie les doublons (chevauchements de garanties). Exemple : "Protection Juridique" présente dans deux contrats différents. Retourne un tableau JSON.` }
    ];
    policies.forEach(p => {
        parts.push({ text: `Contrat ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail || 'Non spécifiée'}. Résumé : ${p.summary || ''}` });
    });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts },
            config: {
                responseMimeType: 'application/json'
            }
        });
        return JSON.parse(response.text);
    }
    catch (err) {
        console.error('gemini detectDuplicates error', err);
        return [];
    }
};
exports.detectDuplicates = detectDuplicates;
const sendMessageToAssistant = async (message, policies, history) => {
    const ai = getAiClient();
    if (!ai)
        return 'Assistant non disponible (GEMINI_API_KEY manquante).';
    const systemInstruction = generateSystemInstruction(policies || []);
    try {
        const finalParts = [
            ...((history || []).map(h => ({ text: `${h.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${h.text}` }))),
            { text: message }
        ];
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: finalParts },
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }]
            }
        });
        return response.text || 'Désolé, je n\'ai pas pu analyser cette demande.';
    }
    catch (err) {
        console.error('gemini chat error', err);
        return 'Une erreur technique est survenue.';
    }
};
exports.sendMessageToAssistant = sendMessageToAssistant;
