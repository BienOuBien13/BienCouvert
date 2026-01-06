
import { User } from '../types';

const SESSION_KEY = 'assurclair_session';
const TOKEN_KEY = 'assurclair_token';
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

export const authService = {
  login: async (email: string, password: string): Promise<User> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Login failed');
      localStorage.setItem(TOKEN_KEY, body.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(body.user));
      return body.user as User;
    } catch (err: any) {
      // Network errors or CORS issues surface here as TypeError / 'Failed to fetch'
      if (err instanceof TypeError) throw new Error('Network error: unable to reach backend. Is the backend running and CORS configured?');
      throw err;
    }
  },

  register: async (email: string, password: string): Promise<User> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Register failed');
      localStorage.setItem(TOKEN_KEY, body.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(body.user));
      return body.user as User;
    } catch (err: any) {
      if (err instanceof TypeError) throw new Error('Network error: unable to reach backend. Is the backend running and CORS configured?');
      throw err;
    }
  },

  resetPassword: async (email: string, newPassword: string): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, newPassword }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Reset failed');
      }
    } catch (err: any) {
      if (err instanceof TypeError) throw new Error('Network error: unable to reach backend. Is the backend running and CORS configured?');
      throw err;
    }
  },

  updateUser: async (userId: string, data: { name: string; email: string; password?: string }): Promise<User> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/api/auth/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Update failed');
    localStorage.setItem(SESSION_KEY, JSON.stringify(body));
    return body as User;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  },

  getCurrentUser: (): User | null => {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    return sessionStr ? JSON.parse(sessionStr) as User : null;
  },

  getToken: (): string | null => localStorage.getItem(TOKEN_KEY)
};
