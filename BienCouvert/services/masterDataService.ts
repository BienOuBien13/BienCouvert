// =============================================================================
// services/masterDataService.ts — Données de référence pour React Native
// Adapté depuis FrontEnd/services/masterDataService.ts
// =============================================================================

import { apiFetch } from './api';

export interface InsuranceType {
  code: string;
  labelFr: string;
  labelEn: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Insurer {
  code: string;
  label: string;
  fullName: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceSubType {
  code: string;
  label: string;
  parentTypeCode: string;
}

const FALLBACK_TYPES: InsuranceType[] = [
  { code: 'AUTO', labelFr: 'Automobile', labelEn: 'Auto', description: null, icon: '🚗', color: '#3b82f6', displayOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
  { code: 'HABITATION', labelFr: 'Habitation', labelEn: 'Home', description: null, icon: '🏠', color: '#22c55e', displayOrder: 2, isActive: true, createdAt: '', updatedAt: '' },
  { code: 'SANTE', labelFr: 'Santé', labelEn: 'Health', description: null, icon: '❤️', color: '#ef4444', displayOrder: 3, isActive: true, createdAt: '', updatedAt: '' },
  { code: 'AUTRE', labelFr: 'Autre', labelEn: 'Other', description: null, icon: '📄', color: '#6b7280', displayOrder: 99, isActive: true, createdAt: '', updatedAt: '' },
];

export async function getInsuranceTypes(): Promise<InsuranceType[]> {
  try {
    return await apiFetch<InsuranceType[]>('/masterdata/insurance-types', { method: 'GET' });
  } catch {
    return FALLBACK_TYPES;
  }
}

export async function getInsurers(): Promise<Insurer[]> {
  try {
    return await apiFetch<Insurer[]>('/masterdata/insurers', { method: 'GET' });
  } catch {
    return [];
  }
}

export async function getInsuranceSubTypes(typeCode: string): Promise<InsuranceSubType[]> {
  try {
    return await apiFetch<InsuranceSubType[]>(
      `/masterdata/insurance-subtypes?typeCode=${encodeURIComponent(typeCode)}`,
      { method: 'GET' },
    );
  } catch {
    return [];
  }
}
