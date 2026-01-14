// =============================================================================
// SERVICE GEMINI (MODE BACKEND)
// Utilise le backend Express comme proxy pour les appels à l'API Gemini
// Évite les problèmes CORS et protège la clé API
// =============================================================================

import { Policy, OptimizationFinding, Message, WebSearchResult, UserProfileData, PolicyType, CentralCgEntry } from "../types";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Les fonctions audio restent en direct car elles nécessitent des streams WebRTC
export { connectIntakeSession, connectLiveSession } from './geminiService.localStorage';

export interface SmartExtractionResult {
  policies: Array<Partial<Policy & { 
    isComplete: boolean; 
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
    summary?: string;
  }>>;
  clarificationQuestions: string[] | null;
}

// Fonction stub - à implémenter via backend si nécessaire
export const indexCgDocument = async (provider: string, type: string, pdfUrl: string): Promise<Partial<CentralCgEntry>> => {
  // TODO: Créer route backend /api/ai/index-cg
  console.warn('indexCgDocument: not implemented in backend mode');
  return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Non disponible en mode backend" };
};

// Extraction de contrats depuis texte libre via backend
export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  try {
    const response = await fetch(`${API_URL}/api/ai/parse-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('parsePoliciesFromText error:', error);
    return { policies: [], clarificationQuestions: null };
  }
};

export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  try {
    const response = await fetch(`${API_URL}/api/ai/search-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, type, name }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('searchPolicyInfo error:', error);
    return { summary: "Analyse web indisponible.", detectedFormulas: [], sourceUrl: "", availableOptions: [] };
  }
};

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, policies, history }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.reply || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (error) {
    console.error('sendMessageToAssistant error:', error);
    throw error;
  }
};

export const detectOptimizations = async (policies: Policy[], profile: UserProfileData): Promise<OptimizationFinding[]> => {
  try {
    const response = await fetch(`${API_URL}/api/ai/detect-duplicates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.duplicates || [];
  } catch (error) {
    console.error('detectOptimizations error:', error);
    return [];
  }
};

export const generateShareableReport = async (policies: Policy[], findings: OptimizationFinding[]): Promise<string> => {
  // Fonction simple - génération locale
  return `J'ai fait mon bilan AssurClair avec ${policies.length} contrat(s) !`;
};
