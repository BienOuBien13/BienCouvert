// =============================================================================
// SERVICE DE STOCKAGE LOCAL
// Gère la persistance des polices d'assurance et du référentiel central des CG
// en utilisant localStorage. Fournit une interface simple pour les opérations
// CRUD (Create, Read, Update, Delete).
// 
// IMPORTANT : Utilise localStorage pour la démo. En production, remplacer par
// des appels API vers le backend.
// =============================================================================

import { Policy, CentralCgEntry, PolicyType } from '../types';

// Clés localStorage pour la persistance
const POLICIES_KEY = 'assurclair_policies';          // Polices des utilisateurs
const CENTRAL_CG_KEY = 'assurclair_central_cg';      // Référentiel central des CG

/**
 * Service de stockage exposant toutes les opérations sur les polices et le référentiel CG.
 */
export const storageService = {
  /**
   * Récupère toutes les polices d'un utilisateur.
   * Filtre les polices par userId dans le tableau global.
   * 
   * @param userId - Identifiant de l'utilisateur
   * @returns Tableau des polices appartenant à cet utilisateur
   */
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

  // --- Central CG Repository Functions ---
  
  getCentralCgRepo: (): CentralCgEntry[] => {
    const repoStr = localStorage.getItem(CENTRAL_CG_KEY);
    return repoStr ? JSON.parse(repoStr) : [];
  },

  saveCgEntry: (entry: Omit<CentralCgEntry, 'id' | 'lastVerified'>): void => {
    const repo = storageService.getCentralCgRepo();
    const newEntry: CentralCgEntry = {
      ...entry,
      id: crypto.randomUUID(),
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
      entry.provider.toLowerCase().includes(p) && 
      (entry.policyName.toLowerCase().includes(n) || n.includes(entry.policyName.toLowerCase())) &&
      entry.type === type
    ) || null;
  }
};
