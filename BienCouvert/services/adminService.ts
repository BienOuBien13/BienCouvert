// =============================================================================
// services/adminService.ts — Endpoints d'administration / monitoring
// Réservé aux utilisateurs avec isAdmin = true
// =============================================================================

import { apiFetch } from './api';

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
    apiFetch('/admin/dashboard-stats'),

  getUsers: (): Promise<AdminUser[]> =>
    apiFetch('/admin/users'),

  getConnectionLogs: (limit = 100): Promise<ConnectionLog[]> =>
    apiFetch(`/admin/connection-logs?limit=${limit}`),
};
