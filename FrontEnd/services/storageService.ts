import { Policy } from '../types';

const POLICIES_KEY = 'assurclair_policies';

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
  }
};