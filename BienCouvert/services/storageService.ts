// =============================================================================
// services/storageService.ts — Gestion des polices pour React Native
// Adapté depuis FrontEnd/services/storageService.ts
// =============================================================================

import { apiFetch } from './api';
import { Policy, CentralCgEntry } from '../types';

export const storageService = {
  /**
   * Récupère toutes les polices d'un utilisateur
   */
  getPolicies: async (userId: string): Promise<Policy[]> => {
    return apiFetch(`/policies?userId=${userId}`, { method: 'GET' });
  },

  /**
   * Sauvegarde une nouvelle police
   */
  savePolicy: async (policy: Policy): Promise<void> => {
    await apiFetch('/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
  },

  /**
   * Met à jour une police existante
   */
  updatePolicy: async (updatedPolicy: Policy): Promise<void> => {
    await apiFetch(`/policies/${updatedPolicy.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedPolicy),
    });
  },

  /**
   * Supprime une police
   */
  deletePolicy: async (policyId: string): Promise<void> => {
    await apiFetch(`/policies/${policyId}`, { method: 'DELETE' });
  },

  /**
   * Récupère les options disponibles pour une police
   */
  getAvailableOptions: async (policyId: string): Promise<{
    availableOptions: Array<{
      guarantee_label: string;
      guarantee_key: string;
      isSubscribed: boolean;
      coverage_amount: string | null;
      coverage_notes: string | null;
    }>;
  } | null> => {
    try {
      return apiFetch(`/policies/${policyId}/options`, { method: 'GET' });
    } catch {
      return null;
    }
  },

  /**
   * Récupère les Conditions Générales centralisées
   */
  getCentralCg: async (params: {
    insuranceTypeCode?: string;
    insurerCode?: string;
    limit?: number;
  }): Promise<CentralCgEntry[]> => {
    const qs = new URLSearchParams();
    if (params.insuranceTypeCode) qs.set('insurance_type_code', params.insuranceTypeCode);
    if (params.insurerCode) qs.set('insurer_code', params.insurerCode);
    if (params.limit) qs.set('limit', String(params.limit));
    return apiFetch(`/cg/central?${qs.toString()}`, { method: 'GET' });
  },
};
