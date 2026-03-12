// =============================================================================
// services/api.ts — Helper de fetch authentifié pour React Native
// Stockage token : expo-secure-store avec fallback AsyncStorage (Expo Go dev)
// CSRF non requis en mobile (pas de cookies cross-origin)
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, TOKEN_KEY } from '../constants/Config';

// Wrapper sécurisé : utilise SecureStore en production, AsyncStorage en fallback
export async function storageGet(key: string): Promise<string | null> {
  try {
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

export async function getToken(): Promise<string | null> {
  return storageGet(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await storageSet(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await storageRemove(TOKEN_KEY);
}

// Callback global déclenchée en cas de session expirée (401 non récupérable)
let sessionExpiredCallback: (() => void) | null = null;
export function onSessionExpired(cb: () => void) {
  sessionExpiredCallback = cb;
}

/**
 * Effectue un appel API authentifié.
 * - Ajoute automatiquement le Bearer token si disponible
 * - Tente un renouvellement JWT automatique en cas de 401
 * - Déclenche onSessionExpired si le renouvellement échoue
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !isRetry && token) {
    try {
      const renewRes = await fetch(`${API_URL}/api/auth/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (renewRes.ok) {
        const { token: newToken } = await renewRes.json();
        await setToken(newToken);
        return apiFetch<T>(endpoint, options, true);
      }
    } catch {}
    await removeToken();
    sessionExpiredCallback?.();
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json();
}
