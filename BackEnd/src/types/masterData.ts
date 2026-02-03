// types/masterData.ts
// Types et constantes pour les données de référence (master data)

/**
 * Type d'assurance normalisé
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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Types pour les codes (simples alias de string)
 * Les valeurs réelles viennent de la base de données
 */
export type InsuranceTypeCode = string;
export type InsurerCode = string;
