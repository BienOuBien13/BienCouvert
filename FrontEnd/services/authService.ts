// =============================================================================
// SERVICE D'AUTHENTIFICATION (MODE BACKEND)
// Utilise des appels API vers le backend Express au lieu de localStorage.
// Gère l'authentification via JWT et bcrypt côté serveur.
// =============================================================================

import { User, UserProfileData } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'assurclair_token';
const USER_KEY = 'assurclair_current_user';

/**
 * Effectue une requête authentifiée vers le backend
 */
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export const authService = {
  /**
   * Connexion utilisateur
   */
  login: async (email: string, password: string): Promise<User> => {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    
    return response.user;
  },

  /**
   * Inscription utilisateur
   */
  register: async (email: string, password: string): Promise<User> => {
    const response = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    
    return response.user;
  },

  /**
   * Réinitialisation de mot de passe
   */
  resetPassword: async (email: string, newPassword: string): Promise<void> => {
    await apiFetch('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword }),
    });
  },

  /**
   * Mise à jour du profil utilisateur
   */
  updateUser: async (userId: string, data: { firstName: string; lastName: string; email: string; password?: string; profile?: UserProfileData }): Promise<User> => {
    const response = await apiFetch('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    
    return response.user;
  },

  /**   * Suppression du compte utilisateur (RGPD Art. 17 - Droit à l'effacement)
   */
  deleteAccount: async (): Promise<void> => {
    await apiFetch('/auth/account', {
      method: 'DELETE',
    });
    
    // Effacer les données locales après suppression
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /**   * Déconnexion
   */
  logout: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /**
   * Récupère l'utilisateur actuellement connecté
   */
  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  /**
   * Récupère le token JWT
   */
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },
};
