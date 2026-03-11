// =============================================================================
// services/authService.ts — Authentification pour React Native
// Adapté depuis FrontEnd/services/authService.ts
// Utilise expo-secure-store au lieu de localStorage
// =============================================================================

import * as SecureStore from 'expo-secure-store';
import { apiFetch, getToken, setToken, removeToken } from './api';
import { User, UserProfileData } from '../types';
import { TOKEN_KEY, USER_KEY } from '../constants/Config';

export const authService = {
  /**
   * Connecte un utilisateur et stocke le JWT de façon sécurisée
   */
  login: async (email: string, password: string): Promise<User> => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    return data.user;
  },

  /**
   * Inscrit un nouvel utilisateur
   */
  register: async (email: string, password: string): Promise<User> => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    return data.user;
  },

  /**
   * Déconnexion : supprime le token et les données locales
   */
  logout: async (): Promise<void> => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    await removeToken();
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  /**
   * Retourne l'utilisateur actuellement connecté (depuis le cache SecureStore)
   */
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const raw = await SecureStore.getItemAsync(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  /**
   * Envoie un email de réinitialisation de mot de passe
   */
  forgotPassword: async (email: string): Promise<{ exists: boolean }> => {
    return apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Réinitialise le mot de passe avec le token reçu par email
   */
  resetPassword: async (token: string, password: string): Promise<void> => {
    await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  /**
   * Met à jour le profil utilisateur
   */
  updateUser: async (
    userId: string,
    updates: { firstName?: string; lastName?: string; password?: string; profile?: UserProfileData },
  ): Promise<User> => {
    const updatedUser = await apiFetch<User>(`/auth/user/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
    return updatedUser;
  },

  /**
   * Supprime le compte utilisateur
   */
  deleteAccount: async (userId: string): Promise<void> => {
    await apiFetch(`/auth/user/${userId}`, { method: 'DELETE' });
    await removeToken();
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};
