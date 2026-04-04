// =============================================================================
// adminService.ts — Appels API d'administration / monitoring (FrontEnd web)
// Réservé aux utilisateurs isAdmin = true
// =============================================================================

import { API_URL } from './apiUrl';

const TOKEN_KEY = 'assurclair_token';

async function adminFetch<T = any>(endpoint: string): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}/api${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface DashboardStats {
  total_users: string;
  new_users_week: string;
  logins_today: string;
  failed_logins_today: string;
  logins_week: string;
  active_users_month: string;
}

export interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  is_partner: boolean;
  created_at: string;
  policy_count: number;
  last_login: string | null;
}

export interface ConnectionLog {
  id: number;
  action: 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_FAILED_LOGIN' | 'USER_REGISTER';
  user_id: number | null;
  user_email: string | null;
  ip_address: string | null;
  timestamp: string;
  details: any;
  first_name: string | null;
  last_name: string | null;
}

export const adminService = {
  getDashboardStats: (): Promise<DashboardStats> =>
    adminFetch('/admin/dashboard-stats'),

  getUsers: (): Promise<AdminUser[]> =>
    adminFetch('/admin/users'),

  getConnectionLogs: (limit = 100): Promise<ConnectionLog[]> =>
    adminFetch(`/admin/connection-logs?limit=${limit}`),
};
