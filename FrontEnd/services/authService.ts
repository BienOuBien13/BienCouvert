// =============================================================================
// SERVICE D'AUTHENTIFICATION (MODE BACKEND)
// Utilise des appels API vers le backend Express au lieu de localStorage.
// Gère l'authentification via JWT et bcrypt côté serveur.
// =============================================================================

import { User, UserProfileData } from '../types';
import { API_URL } from './apiUrl';
const TOKEN_KEY = 'assurclair_token';
const USER_KEY = 'assurclair_current_user';

// CSRF token (in-memory, not persisted)
let csrfToken: string | null = null;

// Fetch CSRF token from backend and store in memory
export const fetchCsrfToken = async () => {
  try {
    const res = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (e) {
    console.error('Erreur lors de la récupération du CSRF token:', e);
    csrfToken = null;
    return null;
  }
};

// Helpers to emit/listen session-expired event (for App.tsx to react)
export const onSessionExpired = (handler: () => void) => {
  window.addEventListener('auth:session-expired', handler, { once: true });
};
const emitSessionExpired = () => {
  window.dispatchEvent(new Event('auth:session-expired'));
};

/**
 * Effectue une requête authentifiée vers le backend.
 * - Rafraîchit toujours le CSRF token avant les requêtes mutantes
 * - En cas de 401, tente un renouvellement JWT automatique (une seule fois)
 * - En cas d'échec du renouvellement, nettoie la session et émet 'auth:session-expired'
 */
const apiFetch = async <T = any>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> => {
  const token = localStorage.getItem(TOKEN_KEY);
  const isMutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase());

  // Toujours rafraîchir le CSRF pour les requêtes mutantes (cookie + header en sync)
  if (isMutating) {
    await fetchCsrfToken();
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
    credentials: 'include',
  });

  if (response.status === 401 && !isRetry) {
    // Tentative de renouvellement automatique du JWT
    try {
      const renewHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      };
      // CSRF frais pour le POST /renew
      await fetchCsrfToken();
      if (csrfToken) (renewHeaders as any)['X-CSRF-Token'] = csrfToken;

      const renewRes = await fetch(`${API_URL}/api/auth/renew`, {
        method: 'POST',
        headers: renewHeaders,
        credentials: 'include',
      });

      if (renewRes.ok) {
        const renewData = await renewRes.json();
        localStorage.setItem(TOKEN_KEY, renewData.token);
        if (renewData.user) localStorage.setItem(USER_KEY, JSON.stringify(renewData.user));
        // Réessayer la requête originale avec le nouveau token
        return apiFetch(endpoint, options, true);
      }
    } catch {
      // ignore
    }

    // Renouvellement échoué → session expirée
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    emitSessionExpired();
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

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
   * Vérification de l'email pour la réinitialisation du mot de passe.
   * Retourne true si le compte existe, false sinon.
   * Le backend ne révèle pas explicitement si l'email existe (sécurité anti-énumération).
   */
  forgotPassword: async (email: string): Promise<{ exists: boolean }> => {
    const response = await apiFetch<{ ok: boolean; exists: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { exists: response.exists };
  },

  /**
   * Réinitialisation de mot de passe via token opaque UUID (reçu par email)
   */
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await apiFetch('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  /**
   * Mise à jour du profil utilisateur
   */
  updateUser: async (userId: string, data: { firstName: string; lastName: string; email?: string; password?: string; profile?: UserProfileData; geminiAiConsent?: boolean }): Promise<User> => {
    const response = await apiFetch('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    
    return response.user;
  },

  /**
   * Récupère le profil d'analyse détaillé de l'utilisateur courant (questionnaire AnalysisView)
   */
  getAnalysisProfile: async (): Promise<UserProfileData> => {
    const response = await apiFetch('/auth/me/analysis-profile', { method: 'GET' });
    return response.profile || {};
  },

  /**
   * Met à jour le profil d'analyse détaillé de l'utilisateur courant
   */
  updateAnalysisProfile: async (data: UserProfileData): Promise<UserProfileData> => {
    const response = await apiFetch('/auth/me/analysis-profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.profile || data;
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

  /**
   * Renouvelle le JWT auprès du backend (token expiré mais utilisateur connu)
   * Retourne l'utilisateur mis à jour ou null si renouvellement impossible
   */
  renewToken: async (): Promise<User | null> => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return null;

      await fetchCsrfToken();
      const res = await fetch(`${API_URL}/api/auth/renew`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.token && data.user) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Prise de rendez-vous avec un expert (envoie une notification email)
   */
  submitRdv: async (data: { phone: string; day: string; slot: string; policies: string[]; userEmail?: string }): Promise<void> => {
    await apiFetch('/contact/rdv', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Vérifie l'adresse email via token envoyé à l'inscription
   */
  verifyEmail: async (token: string): Promise<{ ok: boolean; email: string }> => {
    const res = await fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Lien de vérification invalide ou expiré');
    return res.json();
  },

  /**
   * Valide la session courante : tente GET /me, si 401 tente un renouvellement.
   * Retourne true si la session est valide (ou réparée), false si l'utilisateur doit se reconnecter.
   */
  validateSession: async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return false;

      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return true;
      }

      if (res.status === 401) {
        const renewed = await authService.renewToken();
        return renewed !== null;
      }

      return false;
    } catch {
      return false;
    }
  },
};
