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
 * Codes des types d'assurance
 */
export const INSURANCE_TYPE_CODES = {
  AUTO: 'AUTO',
  HABITATION: 'HABITATION',
  SANTE: 'SANTE',
  PREVOYANCE: 'PREVOYANCE',
  PRO: 'PRO',
  EMPRUNTEUR: 'EMPRUNTEUR',
  BANCAIRE: 'BANCAIRE',
  APPAREILS: 'APPAREILS',
  JURIDIQUE: 'JURIDIQUE',
  VOYAGE: 'VOYAGE',
  ANIMAUX: 'ANIMAUX',
  VIE: 'VIE',
  AUTRE: 'AUTRE',
} as const;

/**
 * Codes des assureurs
 */
export const INSURER_CODES = {
  CENTRAL_GENERALI: 'CENTRAL_GENERALI',
  GENERALI: 'GENERALI',
  AXA: 'AXA',
  ALLIANZ: 'ALLIANZ',
  GROUPAMA: 'GROUPAMA',
  CREDIT_AGRICOLE: 'CREDIT_AGRICOLE',
  MACIF: 'MACIF',
  MAIF: 'MAIF',
  MAAF: 'MAAF',
  GMF: 'GMF',
  MMA: 'MMA',
  MATMUT: 'MATMUT',
  AVIVA: 'AVIVA',
  SWISS_LIFE: 'SWISS_LIFE',
  CNP: 'CNP',
  AG2R: 'AG2R',
  MALAKOFF: 'MALAKOFF',
  HARMONIE: 'HARMONIE',
  MGEN: 'MGEN',
  APRIL: 'APRIL',
  DIRECT_ASSURANCE: 'DIRECT_ASSURANCE',
  AMAGUIZ: 'AMAGUIZ',
  LUKO: 'LUKO',
  FRIDAY: 'FRIDAY',
  ACHEEL: 'ACHEEL',
  AUTRE: 'AUTRE',
} as const;

export type InsuranceTypeCode = typeof INSURANCE_TYPE_CODES[keyof typeof INSURANCE_TYPE_CODES];
export type InsurerCode = typeof INSURER_CODES[keyof typeof INSURER_CODES];

/**
 * Normalise un type textuel vers un code
 */
export function normalizeInsuranceType(type: string): InsuranceTypeCode {
  const normalized = type.toLowerCase().trim();
  
  if (['auto', 'automobile', 'voiture', 'moto'].includes(normalized)) return INSURANCE_TYPE_CODES.AUTO;
  if (['habitation', 'logement', 'maison', 'appartement'].includes(normalized)) return INSURANCE_TYPE_CODES.HABITATION;
  if (['santé', 'sante', 'mutuelle', 'santé complémentaire'].includes(normalized)) return INSURANCE_TYPE_CODES.SANTE;
  if (['prévoyance', 'prevoyance'].includes(normalized)) return INSURANCE_TYPE_CODES.PREVOYANCE;
  if (['professionnelle', 'pro', 'rc pro', 'entreprise'].includes(normalized)) return INSURANCE_TYPE_CODES.PRO;
  if (['emprunteur', 'crédit', 'credit', 'prêt', 'pret'].includes(normalized)) return INSURANCE_TYPE_CODES.EMPRUNTEUR;
  if (['bancaire', 'banque', 'carte bancaire', 'cb'].includes(normalized)) return INSURANCE_TYPE_CODES.BANCAIRE;
  if (['appareils', 'électronique', 'electronique', 'mobile', 'smartphone'].includes(normalized)) return INSURANCE_TYPE_CODES.APPAREILS;
  if (['juridique', 'protection juridique'].includes(normalized)) return INSURANCE_TYPE_CODES.JURIDIQUE;
  if (['voyage', 'travel', 'vacances'].includes(normalized)) return INSURANCE_TYPE_CODES.VOYAGE;
  if (['animaux', 'animal', 'chien', 'chat'].includes(normalized)) return INSURANCE_TYPE_CODES.ANIMAUX;
  if (['vie', 'assurance vie', 'épargne', 'epargne'].includes(normalized)) return INSURANCE_TYPE_CODES.VIE;
  
  return INSURANCE_TYPE_CODES.AUTRE;
}

/**
 * Normalise un assureur textuel vers un code
 */
export function normalizeInsurer(insurer: string): InsurerCode {
  const normalized = insurer.toLowerCase().trim();
  
  // Générali (toutes variantes)
  if (['generali', 'générali', 'central generali', 'central générali', 'generali central', 'générali central'].includes(normalized)) {
    return INSURER_CODES.CENTRAL_GENERALI;
  }
  
  // AXA
  if (['axa', 'axa france', 'axa assurance', 'direct assurance'].includes(normalized)) {
    return INSURER_CODES.AXA;
  }
  
  // Allianz
  if (['allianz', 'allianz france'].includes(normalized)) {
    return INSURER_CODES.ALLIANZ;
  }
  
  // Groupama
  if (['groupama', 'amaguiz'].includes(normalized)) {
    return INSURER_CODES.GROUPAMA;
  }
  
  // Crédit Agricole
  if (['crédit agricole', 'credit agricole', 'ca assurances', 'predica', 'pacifica'].includes(normalized)) {
    return INSURER_CODES.CREDIT_AGRICOLE;
  }
  
  // Mutuelles
  if (normalized === 'macif') return INSURER_CODES.MACIF;
  if (normalized === 'maif') return INSURER_CODES.MAIF;
  if (['maaf', 'covéa', 'covea'].includes(normalized)) return INSURER_CODES.MAAF;
  if (normalized === 'gmf') return INSURER_CODES.GMF;
  if (['mma', 'mutuelles du mans', 'zero trace'].includes(normalized)) return INSURER_CODES.MMA;
  if (normalized === 'matmut') return INSURER_CODES.MATMUT;
  
  // Autres
  if (['aviva', 'aviva france'].includes(normalized)) return INSURER_CODES.AVIVA;
  if (['swiss life', 'swisslife'].includes(normalized)) return INSURER_CODES.SWISS_LIFE;
  if (['cnp', 'cnp assurances'].includes(normalized)) return INSURER_CODES.CNP;
  if (['ag2r', 'ag2r la mondiale'].includes(normalized)) return INSURER_CODES.AG2R;
  if (['malakoff', 'malakoff humanis', 'humanis'].includes(normalized)) return INSURER_CODES.MALAKOFF;
  if (['harmonie', 'harmonie mutuelle'].includes(normalized)) return INSURER_CODES.HARMONIE;
  if (normalized === 'mgen') return INSURER_CODES.MGEN;
  if (['april', 'april assurances'].includes(normalized)) return INSURER_CODES.APRIL;
  
  // Néo-assureurs
  if (normalized === 'luko') return INSURER_CODES.LUKO;
  if (normalized === 'friday') return INSURER_CODES.FRIDAY;
  if (normalized === 'acheel') return INSURER_CODES.ACHEEL;
  
  return INSURER_CODES.AUTRE;
}

/**
 * Vérifie si un code est valide
 */
export function isValidInsuranceTypeCode(code: string): code is InsuranceTypeCode {
  return Object.values(INSURANCE_TYPE_CODES).includes(code as InsuranceTypeCode);
}

/**
 * Vérifie si un code assureur est valide
 */
export function isValidInsurerCode(code: string): code is InsurerCode {
  return Object.values(INSURER_CODES).includes(code as InsurerCode);
}
