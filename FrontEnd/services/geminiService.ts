// =============================================================================
// SERVICE GEMINI (VIA BACKEND)
// Toutes les fonctions IA passent par le backend pour éviter CORS et sécuriser la clé API
// =============================================================================

import { Policy, OptimizationFinding, Message, WebSearchResult, UserProfileData, PolicyType, CentralCgEntry } from "../types";
import { fetchCsrfToken } from './authService';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Effectue une requête vers le backend
 */
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Ajout du token CSRF si la méthode n'est pas GET
  let headers: any = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const method = options.method ? options.method.toUpperCase() : 'POST';
  if (method !== 'GET') {
    const csrfToken = await fetchCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(`${API_URL}/api${endpoint}`, {
    method,
    headers,
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export interface SmartExtractionResult {
  policies: Array<Partial<Policy & { 
    isComplete: boolean; 
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
    summary?: string;
  }>>;
  clarificationQuestions: string | null;
}

/**
 * Indexe un document CG via le backend
 */
export const indexCgDocument = async (provider: string, type: string, pdfUrl: string): Promise<Partial<CentralCgEntry>> => {
  try {
    const result = await apiFetch('/ai/index-cg', {
      body: JSON.stringify({ provider, type, pdfUrl })
    });
    return result;
  } catch (e) {
    console.error('Erreur indexCgDocument:', e);
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Erreur" };
  }
};

/**
 * Parse les contrats d'assurance depuis du texte via le backend
 */
export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  try {
    const result = await apiFetch('/ai/parse-text', {
      body: JSON.stringify({ text })
    });
    return result;
  } catch (e) {
    console.error('Erreur parsePoliciesFromText:', e);
    return { policies: [], clarificationQuestions: null };
  }
};

/**
 * Recherche des informations sur une police via le backend
 */
export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  try {
    const result = await apiFetch('/ai/search-policy', {
      body: JSON.stringify({ provider, type, name })
    });
    return result;
  } catch (e) {
    console.error('Erreur searchPolicyInfo:', e);
    return { summary: "Analyse web indisponible.", detectedFormulas: [], sourceUrl: "", availableOptions: [] };
  }
};

/**
 * Envoie un message à l'assistant via le backend
 */
export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  try {
    const result = await apiFetch('/ai/chat', {
      body: JSON.stringify({ message, policies, history })
    });
    return result.response;
  } catch (e) {
    console.error('Erreur sendMessageToAssistant:', e);
    return "Désolé, le service IA n'est pas disponible actuellement.";
  }
};

/**
 * Détecte les optimisations possibles via le backend
 */
export const detectOptimizations = async (policies: Policy[], profile: UserProfileData): Promise<OptimizationFinding[]> => {
  try {
    const result = await apiFetch('/ai/detect-duplicates', {
      body: JSON.stringify({ policies, profile })
    });
    return result;
  } catch (e) {
    console.error('Erreur detectOptimizations:', e);
    return [{ title: "Service IA non disponible", severity: "medium", description: "Impossible de contacter le serveur.", savingsPotential: 0 }];
  }
};

/**
 * Génère un rapport partageable via le backend
 */
export const generateShareableReport = async (policies: Policy[], findings: OptimizationFinding[]): Promise<string> => {
  try {
    const result = await apiFetch('/ai/generate-report', {
      body: JSON.stringify({ policies, findings })
    });
    return result.text || "J'ai fait mon bilan BienCouvert !";
  } catch (error) {
    console.error('Erreur generateShareableReport:', error);
    return "J'ai fait mon bilan BienCouvert !";
  }
};

/**
 * ❌ FONCTIONS LIVE AUDIO NON SUPPORTÉES VIA BACKEND (nécessite websocket)
 * Ces fonctions audio ne fonctionneront pas en mode backend car elles nécessitent une connexion WebSocket bidirectionnelle
 */
export const connectIntakeSession = async (
  onInput: (t: string) => void,
  onOutput: (t: string) => void,
  onComplete: () => void,
  existingPolicyTypes: PolicyType[]
) => {
  throw new Error('Fonction audio non supportée via backend. Nécessite une connexion WebSocket.');
};

export const connectLiveSession = async (
  policies: Policy[],
  onInput: (t: string) => void,
  onOutput: (t: string) => void,
  onComplete: () => void
) => {
  throw new Error('Fonction audio non supportée via backend. Nécessite une connexion WebSocket.');
};
