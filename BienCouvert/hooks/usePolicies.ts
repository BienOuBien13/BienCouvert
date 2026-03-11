// hooks/usePolicies.ts — Gestion du portefeuille de polices

import { useState, useCallback } from 'react';
import { Policy } from '../types';
import { storageService } from '../services/storageService';

export function usePolicies(userId: string | undefined) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await storageService.getPolicies(userId);
      setPolicies(data);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const add = useCallback(async (policy: Policy) => {
    await storageService.savePolicy(policy);
    setPolicies(prev => [policy, ...prev]);
  }, []);

  const update = useCallback(async (policy: Policy) => {
    await storageService.updatePolicy(policy);
    setPolicies(prev => prev.map(p => (p.id === policy.id ? policy : p)));
  }, []);

  const remove = useCallback(async (policyId: string) => {
    await storageService.deletePolicy(policyId);
    setPolicies(prev => prev.filter(p => p.id !== policyId));
  }, []);

  return { policies, isLoading, error, load, add, update, remove };
}
