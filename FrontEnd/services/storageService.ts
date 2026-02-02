// =============================================================================
// SERVICE DE STOCKAGE (MODE BACKEND)
// Utilise des appels API vers le backend Express au lieu de localStorage.
// Gère les polices d'assurance via l'API REST sur VITE_API_URL.
// =============================================================================

import { Policy, CentralCgEntry, PolicyType } from '../types';
import { fetchCsrfToken } from './authService';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'assurclair_token';

/**
 * Effectue une requête authentifiée vers le backend
 */
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const isMutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase());
  
  // Récupérer le token CSRF pour les requêtes mutantes
  let csrfToken = null;
  if (isMutating) {
    csrfToken = await fetchCsrfToken();
  }
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(isMutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Toujours envoyer les cookies (pour CSRF)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export const storageService = {
  /**
   * Récupère toutes les polices d'un utilisateur
   */
  getPolicies: async (userId: string): Promise<Policy[]> => {
    return apiFetch(`/policies?userId=${userId}`, { method: 'GET' });
  },

  /**
   * Sauvegarde une nouvelle police
   */
  savePolicy: async (policy: Policy): Promise<void> => {
    await apiFetch('/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
  },

  /**
   * Met à jour une police existante
   */
  updatePolicy: async (updatedPolicy: Policy): Promise<void> => {
    await apiFetch(`/policies/${updatedPolicy.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedPolicy),
    });
  },

  /**
   * Supprime une police
   */
  deletePolicy: async (policyId: string): Promise<void> => {
    await apiFetch(`/policies/${policyId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Récupère le référentiel central des CG
   */
  getCentralCgRepo: async (): Promise<CentralCgEntry[]> => {
    return apiFetch('/policies/central-cg', { method: 'GET' });
  },

  /**
   * Sauvegarde une entrée CG dans le référentiel
   */
  saveCgEntry: async (entry: Omit<CentralCgEntry, 'id' | 'lastVerified'>): Promise<void> => {
    console.log('📤 saveCgEntry - Envoi vers backend:', {
      insurer: entry.insurer,
      productName: entry.productName,
      type: entry.type,
      pdfUrlLength: entry.pdfUrl?.length || 0,
      hasFormulas: entry.indexedFormulas?.length || 0,
      hasOptions: entry.indexedOptions?.length || 0
    });
    
    const result = await apiFetch('/policies/central-cg', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    
    console.log('✅ saveCgEntry - Réponse reçue:', result);
    return result;
  },

  /**
   * Supprime une entrée CG du référentiel
   */
  deleteCgEntry: async (id: string): Promise<void> => {
    await apiFetch(`/policies/central-cg/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Recherche une CG dans le référentiel
   */
  findCgInRepo: async (
    provider: string,
    name: string,
    type: PolicyType
  ): Promise<CentralCgEntry | null> => {
    const repo = await storageService.getCentralCgRepo();
    const p = provider.toLowerCase().trim();
    const n = name.toLowerCase().trim();
    
    return repo.find(entry => 
      entry.insurer.toLowerCase().includes(p) && 
      (entry.productName.toLowerCase().includes(n) || n.includes(entry.productName.toLowerCase())) &&
      entry.type === type
    ) || null;
  }
};
