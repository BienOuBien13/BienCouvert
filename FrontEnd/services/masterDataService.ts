// services/masterDataService.ts
// Service pour charger les données de référence (master data) depuis l'API

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

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

/**
 * Récupère tous les types d'assurance depuis l'API
 */
export async function getInsuranceTypes(): Promise<InsuranceType[]> {
  try {
    const response = await fetch(`${API_BASE}/api/masterdata/insurance-types`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des types d\'assurance:', error);
    // Fallback sur des types par défaut en cas d'erreur
    return [
      { code: 'AUTO', labelFr: 'Automobile', labelEn: 'Auto', description: null, icon: 'Car', color: 'text-blue-600', displayOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'HABITATION', labelFr: 'Habitation', labelEn: 'Home', description: null, icon: 'Home', color: 'text-green-600', displayOrder: 2, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'SANTE', labelFr: 'Santé', labelEn: 'Health', description: null, icon: 'Heart', color: 'text-red-600', displayOrder: 3, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'AUTRE', labelFr: 'Autre', labelEn: 'Other', description: null, icon: 'FileText', color: 'text-gray-600', displayOrder: 99, isActive: true, createdAt: '', updatedAt: '' },
    ];
  }
}

/**
 * Récupère tous les assureurs depuis l'API
 */
export async function getInsurers(): Promise<Insurer[]> {
  try {
    const response = await fetch(`${API_BASE}/api/masterdata/insurers`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des assureurs:', error);
    // Fallback sur des assureurs par défaut en cas d'erreur
    return [
      { code: 'CENTRAL_GENERALI', label: 'Générali Central', fullName: 'Générali France - Central Générali', description: null, logoUrl: null, websiteUrl: null, phone: null, email: null, color: null, displayOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'AXA', label: 'AXA', fullName: 'AXA France', description: null, logoUrl: null, websiteUrl: null, phone: null, email: null, color: null, displayOrder: 2, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'ALLIANZ', label: 'Allianz', fullName: 'Allianz France', description: null, logoUrl: null, websiteUrl: null, phone: null, email: null, color: null, displayOrder: 3, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'AUTRE', label: 'Autre', fullName: 'Autre assureur', description: null, logoUrl: null, websiteUrl: null, phone: null, email: null, color: null, displayOrder: 999, isActive: true, createdAt: '', updatedAt: '' },
    ];
  }
}

/**
 * Récupère un type d'assurance par son code
 */
export async function getInsuranceTypeByCode(code: string): Promise<InsuranceType | null> {
  try {
    const response = await fetch(`${API_BASE}/api/masterdata/insurance-types/${code}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération du type ${code}:`, error);
    return null;
  }
}

/**
 * Récupère un assureur par son code
 */
export async function getInsurerByCode(code: string): Promise<Insurer | null> {
  try {
    const response = await fetch(`${API_BASE}/api/masterdata/insurers/${code}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération de l'assureur ${code}:`, error);
    return null;
  }
}
