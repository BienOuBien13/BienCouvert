// types/masterData.ts
// Types et constantes pour les données de référence (master data)

/**
 * Type d'assurance normalisé (niveau 1 — ex: HABITATION, AUTO, SANTE…)
 */
export interface InsuranceType {
  code: string;           // Code unique (PRIMARY KEY)
  labelFr: string;        // Libellé français
  labelEn: string | null; // Libellé anglais
  description: string | null;
  icon: string | null;    // Icône Lucide React
  color: string | null;   // Classe Tailwind
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Sous-type d'assurance (niveau 2 — ex: HAB_PRINCIPALE, PNO, AUTO, MOTO…)
 * Rattaché à un InsuranceType parent via parentTypeCode.
 */
export interface InsuranceSubType {
  code: string;              // Code unique (PRIMARY KEY)
  parentTypeCode: string;    // FK → insurance_types.code
  labelFr: string;
  labelEn: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Type de document (ex: CG, NI, IPID, DIP, TABLEAU…)
 * Normalise le champ « type » précédemment libre dans central_cg / user_cg.
 */
export interface DocumentType {
  code: string;           // Code unique (PRIMARY KEY)
  labelFr: string;
  labelEn: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Assureur normalisé
 */
export interface Insurer {
  code: string;           // Code unique (PRIMARY KEY)
  label: string;          // Nom commercial court
  fullName: string | null; // Raison sociale complète
  description: string | null;
  logoUrl: string | null; // URL du logo
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
  color: string | null;   // Couleur de la marque
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Types pour les codes (simples alias de string)
 * Les valeurs réelles viennent de la base de données
 */
export type InsuranceTypeCode = string;
export type InsuranceSubTypeCode = string;
export type InsurerCode = string;
export type DocumentTypeCode = string;
