import { Capacitor } from '@capacitor/core';

/**
 * Returns the API base URL.
 * - Web (served by nginx): empty string → relative URLs proxied by nginx
 * - Capacitor native: full backend URL since there's no nginx proxy
 */
export const API_URL: string =
  Capacitor.isNativePlatform()
    ? 'https://biencouvert.fr'
    : (import.meta.env.VITE_API_URL ?? '');
