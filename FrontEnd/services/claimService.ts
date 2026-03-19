// ============================================================================
// SERVICE SINISTRE — Assistant Sinistre BienCouvert
// Gère les sessions sinistre : qualification, analyse IA, plan, lettre
// ============================================================================

import { fetchCsrfToken } from './authService';
import { API_URL } from './apiUrl';
const TOKEN_KEY = 'assurclair_token';

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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface ClaimAction {
  step: number;
  label: string;
  priority: 'urgent' | 'important' | 'normal';
  deadline?: string;
  done?: boolean;
}

export interface ClaimAnalysis {
  isCovered: boolean | null;
  confidence: 'high' | 'medium' | 'low';
  franchise?: string;
  declarationDeadlineDays: number;
  declarationDeadlineDate: string;
  requiredDocs: string[];
  obligations: string[];
  actions: ClaimAction[];
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
  insurerContact?: string;
  disclaimer: string;
}

export interface ClaimSession {
  id: number;
  userId: number;
  policyId?: number;
  status: 'qualification' | 'analyzing' | 'plan' | 'letter' | 'done';
  title: string;
  claimData: ClaimContext;
  analysis?: ClaimAnalysis;
  actionPlan?: ClaimAction[];
  letterContent?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const isMutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase());

  let csrfToken = null;
  if (isMutating) csrfToken = await fetchCsrfToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(isMutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(err.error || err.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export const claimService = {
  /** Liste toutes les sessions sinistre d'un utilisateur */
  getSessions: async (userId: string): Promise<ClaimSession[]> => {
    return apiFetch(`/sinistre/sessions/${userId}`);
  },

  /** Récupère une session par ID */
  getSession: async (id: number): Promise<ClaimSession> => {
    return apiFetch(`/sinistre/session/${id}`);
  },

  /** Crée une nouvelle session */
  createSession: async (
    userId: string,
    policyId: number | null,
    claimData: Partial<ClaimContext>,
    title: string
  ): Promise<ClaimSession> => {
    return apiFetch('/sinistre/sessions', {
      method: 'POST',
      body: JSON.stringify({ userId, policyId, claimData, title }),
    });
  },

  /** Met à jour la qualification */
  updateSession: async (
    id: number,
    data: { claimData?: Partial<ClaimContext>; policyId?: number | null; title?: string; status?: string }
  ): Promise<ClaimSession> => {
    return apiFetch(`/sinistre/session/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Lance l'analyse IA */
  analyze: async (sessionId: number): Promise<{ analysis: ClaimAnalysis }> => {
    return apiFetch(`/sinistre/session/${sessionId}/analyze`, { method: 'POST', body: '{}' });
  },

  /** Génère la lettre de déclaration */
  generateLetter: async (sessionId: number, userId: string): Promise<{ letter: string; emailSubject: string }> => {
    return apiFetch(`/sinistre/session/${sessionId}/letter`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  /** Supprime une session */
  deleteSession: async (id: number): Promise<void> => {
    await apiFetch(`/sinistre/session/${id}`, { method: 'DELETE' });
  },

  /** Envoie un message et récupère la réponse IA avec historique persisté */
  chat: async (sessionId: number, message: string): Promise<{ reply: string; messages: ChatMessage[] }> => {
    return apiFetch(`/sinistre/session/${sessionId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};
