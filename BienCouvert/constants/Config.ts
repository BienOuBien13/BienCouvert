// constants/Config.ts — Configuration et variables d'environnement

/**
 * URL de l'API backend.
 * Sur Android émulateur : 10.0.2.2 = localhost de la machine hôte.
 * En production : récupéré depuis EXPO_PUBLIC_API_URL
 */
export const API_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string) || 'https://api.assurclair.fr';

console.log('[Config] API_URL =', API_URL);

export const APP_VERSION = '1.0.0';

export const TOKEN_KEY = 'assurclair_token';
export const USER_KEY = 'assurclair_current_user';

export const IS_DEBUG = process.env.EXPO_PUBLIC_DEBUG === 'true';
