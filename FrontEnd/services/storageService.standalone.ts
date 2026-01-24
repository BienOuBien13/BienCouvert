// =============================================================================
// SERVICE DE STOCKAGE (MODE STANDALONE)
// Version locale utilisant localStorage uniquement, sans backend.
// À utiliser uniquement pour des démonstrations ou tests locaux.
// =============================================================================

import { Policy, CentralCgEntry, PolicyType } from '../types';
import { uuid } from '../utils/uuid';

const POLICIES_KEY = 'assurclair_policies';
const CENTRAL_CG_KEY = 'assurclair_central_cg';

export const storageService = {
  getPolicies: (userId: string): Policy[] => {
    const allPoliciesStr = localStorage.getItem(POLICIES_KEY);
    if (!allPoliciesStr) return [];
    
    const allPolicies: Policy[] = JSON.parse(allPoliciesStr);
    return allPolicies.filter(p => p.userId === userId);
  },

  savePolicy: (policy: Policy): void => {
    const allPoliciesStr = localStorage.getItem(POLICIES_KEY);
    const allPolicies: Policy[] = allPoliciesStr ? JSON.parse(allPoliciesStr) : [];
    
    allPolicies.unshift(policy);
    localStorage.setItem(POLICIES_KEY, JSON.stringify(allPolicies));
  },

  updatePolicy: (updatedPolicy: Policy): void => {
    const allPoliciesStr = localStorage.getItem(POLICIES_KEY);
    if (!allPoliciesStr) return;

    const allPolicies: Policy[] = JSON.parse(allPoliciesStr);
    const index = allPolicies.findIndex(p => p.id === updatedPolicy.id);
    
    if (index !== -1) {
      allPolicies[index] = updatedPolicy;
      localStorage.setItem(POLICIES_KEY, JSON.stringify(allPolicies));
    }
  },

  deletePolicy: (policyId: string): void => {
    const allPoliciesStr = localStorage.getItem(POLICIES_KEY);
    if (!allPoliciesStr) return;

    const allPolicies: Policy[] = JSON.parse(allPoliciesStr);
    const newPolicies = allPolicies.filter(p => p.id !== policyId);
    localStorage.setItem(POLICIES_KEY, JSON.stringify(newPolicies));
  },

  getCentralCgRepo: (): CentralCgEntry[] => {
    const repoStr = localStorage.getItem(CENTRAL_CG_KEY);
    return repoStr ? JSON.parse(repoStr) : [];
  },

  saveCgEntry: (entry: Omit<CentralCgEntry, 'id' | 'lastVerified'>): void => {
    const repo = storageService.getCentralCgRepo();
    const newEntry: CentralCgEntry = {
      ...entry,
      id: uuid(),
      lastVerified: Date.now()
    };
    repo.push(newEntry);
    localStorage.setItem(CENTRAL_CG_KEY, JSON.stringify(repo));
  },

  deleteCgEntry: (id: string): void => {
    const repo = storageService.getCentralCgRepo();
    const filtered = repo.filter(e => e.id !== id);
    localStorage.setItem(CENTRAL_CG_KEY, JSON.stringify(filtered));
  },

  findCgInRepo: (provider: string, name: string, type: PolicyType): CentralCgEntry | null => {
    const repo = storageService.getCentralCgRepo();
    const p = provider.toLowerCase().trim();
    const n = name.toLowerCase().trim();
    
    return repo.find(entry => 
      entry.insurer.toLowerCase().includes(p) && 
      (entry.productName.toLowerCase().includes(n) || n.includes(entry.productName.toLowerCase())) &&
      entry.type === type
    ) || null;
  }
};
