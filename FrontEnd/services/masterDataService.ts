// services/masterDataService.ts
// Service pour charger les données de référence (master data) depuis l'API

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
    const url = `${API_BASE}/api/masterdata/insurance-types`;
    
    const response = await fetch(url, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des types d\'assurance:', error);
    console.warn('⚠️ Utilisation des types par défaut (fallback)');
    // Fallback sur des types par défaut en cas d'erreur
    return [
      { code: 'AUTO', labelFr: 'Automobile', labelEn: 'Auto', description: null, icon: '🚗', color: 'text-blue-600', displayOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'HABITATION', labelFr: 'Habitation', labelEn: 'Home', description: null, icon: '🏠', color: 'text-green-600', displayOrder: 2, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'SANTE', labelFr: 'Santé', labelEn: 'Health', description: null, icon: '❤️', color: 'text-red-600', displayOrder: 3, isActive: true, createdAt: '', updatedAt: '' },
      { code: 'AUTRE', labelFr: 'Autre', labelEn: 'Other', description: null, icon: '📄', color: 'text-gray-600', displayOrder: 99, isActive: true, createdAt: '', updatedAt: '' },
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

// ─── Sous-types d'assurance ────────────────────────────────────────────────

export interface InsuranceSubType {
  code: string;
  parentTypeCode: string;
  labelFr: string;
  labelEn: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

// ─── Type de document ────────────────────────────────────────────────────────

export interface DocumentType {
  code: string;
  labelFr: string;
  labelEn: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

/**
 * Récupère les types de document (CG, CP, IPID, DIP, NOTIF, AN, TGARP, FIC)
 */
export async function getDocumentTypes(): Promise<DocumentType[]> {
  try {
    const response = await fetch(`${API_BASE}/api/masterdata/document-types`, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.map((d: any) => ({
      code: d.code,
      labelFr: d.label_fr ?? d.labelFr ?? d.code,
      labelEn: d.label_en ?? d.labelEn ?? null,
      description: d.description ?? null,
      displayOrder: d.display_order ?? d.displayOrder ?? 0,
      isActive: d.is_active ?? d.isActive ?? true,
    }));
  } catch (error) {
    console.error('❌ getDocumentTypes:', error);
    return [];
  }
}

/**
 * Récupère les sous-types pour un type parent (ex: 'HAB01' → HAB_PRINCIPALE, PNO…)
 */
export async function getInsuranceSubTypes(parentTypeCode?: string): Promise<InsuranceSubType[]> {
  try {
    const url = parentTypeCode
      ? `${API_BASE}/api/masterdata/insurance-sub-types?parentTypeCode=${encodeURIComponent(parentTypeCode)}`
      : `${API_BASE}/api/masterdata/insurance-sub-types`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('❌ getInsuranceSubTypes:', error);
    return [];
  }
}

// ─── Options disponibles sur une police ─────────────────────────────────────

export interface AvailableOption {
  guarantee_label: string;
  guarantee_key: string;
  formula_label: string;
  coverage_amount: string | null;
  coverage_notes: string | null;
  source_page: number | null;
  isSubscribed: boolean;
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
