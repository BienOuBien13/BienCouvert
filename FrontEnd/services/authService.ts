// =============================================================================
// SERVICE D'AUTHENTIFICATION (MODE BACKEND)
// Utilise des appels API vers le backend Express au lieu de localStorage.
// Gère l'authentification JWT avec le backend sur VITE_API_URL.
// =============================================================================

import { User, UserProfileData } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'assurclair_token';

/**
 * Interface de réponse pour les routes d'authentification
 */
interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Effectue une requête authentifiée vers le backend
 */
const authFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}/api/auth${endpoint}`, {
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
   * Connexion utilisateur via le backend
   */
  login: async (email: string, password: string): Promise<User> => {
    const data: AuthResponse = await authFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Stockage du token JWT
    localStorage.setItem(TOKEN_KEY, data.token);
    return data.user;
  },

  /**
   * Inscription utilisateur via le backend
   */
  register: async (email: string, password: string): Promise<User> => {
    const data: AuthResponse = await authFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Stockage du token JWT
    localStorage.setItem(TOKEN_KEY, data.token);
    return data.user;
  },

  /**
   * Réinitialisation du mot de passe
   */
  resetPassword: async (email: string, newPassword: string): Promise<void> => {
    await authFetch('/reset', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword }),
    });
  },

  /**
   * Mise à jour du profil utilisateur
   */
  updateUser: async (
    userId: string,
    data: { name: string; email: string; password?: string; profile?: UserProfileData }
  ): Promise<User> => {
    const updatedUser = await authFetch('/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    return updatedUser;
  },

  /**
   * Déconnexion (supprime le token local)
   */
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
  },

  /**
   * Récupération de l'utilisateur connecté depuis le backend
   */
  getCurrentUser: async (): Promise<User | null> => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
      const user = await authFetch('/me', { method: 'GET' });
      return user;
    } catch (error) {
      // Token invalide ou expiré
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  },

  /**
   * Vérifie si un token existe (pour vérification rapide)
   */
  hasToken: (): boolean => {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
