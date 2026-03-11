// =============================================================================
// services/geminiService.ts — Appels IA via le backend pour React Native
// Adapté depuis FrontEnd/services/geminiService.ts
// =============================================================================

import { apiFetch } from './api';
import { Policy, OptimizationFinding, Message, UserProfileData } from '../types';

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
 * Parse des contrats depuis du texte (via le backend + IA)
 */
export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  try {
    return apiFetch('/ai/parse-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  } catch {
    return { policies: [], clarificationQuestions: null };
  }
};

/**
 * Envoie un message au chatbot assurance
 */
export const sendMessageToAssistant = async (
  message: string,
  policies: Policy[],
  history: Message[],
  userProfile?: UserProfileData,
): Promise<string> => {
  const data = await apiFetch<{ text: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, policies, history, userProfile }),
  });
  return data.text;
};

/**
 * Envoie un message en streaming (Server-Sent Events)
 * Retourne un ReadableStream que le composant peut itérer
 */
export const sendMessageToAssistantStream = async (
  message: string,
  policies: Policy[],
  history: Message[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  userProfile?: UserProfileData,
): Promise<void> => {
  const { API_URL } = await import('../constants/Config');
  const { getToken } = await import('./api');

  const token = await getToken();
  const response = await fetch(`${API_URL}/api/ai/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, policies, history, userProfile }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // SSE format: "data: <text>\n\n"
    chunk.split('\n').forEach(line => {
      if (line.startsWith('data: ')) {
        const content = line.slice(6);
        if (content !== '[DONE]') onChunk(content);
      }
    });
  }
  onDone();
};

/**
 * Détecte les optimisations du portefeuille
 */
export const detectOptimizations = async (
  policies: Policy[],
  profile: UserProfileData,
): Promise<OptimizationFinding[]> => {
  try {
    const data = await apiFetch<{ findings: OptimizationFinding[] }>('/ai/optimize', {
      method: 'POST',
      body: JSON.stringify({ policies, profile }),
    });
    return data.findings || [];
  } catch {
    return [];
  }
};

/**
 * Recherche des informations sur une police via IA
 */
export const searchPolicyInfo = async (
  policyName: string,
  insurerName: string,
): Promise<{ summary: string; sourceUrl?: string }> => {
  return apiFetch('/ai/search-policy', {
    method: 'POST',
    body: JSON.stringify({ policyName, insurerName }),
  });
};
