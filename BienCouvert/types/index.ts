// =============================================================================
// TYPES PARTAGÉS — BienCouvert (React Native)
// Synchronisé depuis FrontEnd/types.ts via le script scripts/sync-mobile.js
// NE PAS MODIFIER MANUELLEMENT — utiliser sync-mobile.js
// Dernière sync : voir git log
// =============================================================================

export enum PolicyType {
  AUTO = 'Automobile',
  HOME = 'Habitation',
  HEALTH = 'Santé/Mutuelle',
  LEGAL = 'Protection Juridique',
  LIFE = 'Prévoyance/Décès',
  BANK_CARD = 'Carte Bancaire',
  LOAN = 'Emprunteur/Crédit',
  MOBILE = 'Appareils Mobiles',
  OTHER = 'Autre'
}

export type AppView = 'home' | 'add' | 'policies' | 'chat' | 'analysis' | 'experts' | 'profile' | 'admin' | 'sync' | 'contact' | 'partner' | 'sinistre';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profile?: UserProfileData;
  isAdmin?: boolean;
  isPartner?: boolean;
  geminiAiConsent?: boolean;
}

export interface CentralCgEntry {
  id: string;
  insurerCode: string;
  insuranceTypeCode: string;
  version?: string;
  type?: string;
  owner?: string;
  detail?: string;
  url?: string;
  targetFilename?: string;
  status?: string;
  contentText?: string;
  embedding?: any;
  metadata?: {
    indexedFormulas?: string[];
    indexedOptions?: Record<string, string[]>;
    description?: string;
    type?: string;
  };
  createdAt?: number;
  updatedAt?: number;
  vectorizedAt?: string | null;
  insurer?: string;
  insuranceTypeLabel?: string;
  productName?: string;
  provider?: string;
  pdfUrl?: string;
  semanticSummary?: string;
  indexedFormulas?: string[];
  indexedOptions?: string[];
}

export interface UserProfileData {
  adultsCount?: number;
  childrenCount?: number;
  householdMembersAges?: number[];
  hasPets?: boolean;
  petDetails?: string;
  postalCode?: string;
  housingStatus?: 'owner' | 'tenant' | 'landlord';
  housingType?: 'apartment' | 'house';
  residenceType?: 'principal' | 'secondary';
  housingSurface?: number;
  constructionYear?: number;
  hasPool?: boolean;
  hasGarden?: boolean;
  reconstructionValue?: number;
  highTechValue?: number;
  jewelryValue?: number;
  vehiclesCount?: number;
  monthlyIncome?: number;
  workStatus?: 'salarié' | 'indépendant' | 'fonctionnaire' | 'sans-emploi' | 'retraité';
  profession?: string;
  teleworkDays?: number;
  riskySports?: string[];
  healthNeeds?: string[];
  healthSpecifics?: string;
  claimsLast5Years?: number;
  riskTolerance?: number;
}

export interface Policy {
  id: string;
  userId: string;
  name: string;
  insurer: string;
  insurerCode?: string;
  type: PolicyType;
  typeCode?: string;
  coverage?: string;
  formula?: string;
  coverageDetail?: string;
  options?: string[];
  fileData: string | null;
  fileName: string | null;
  sourceUrl?: string;
  mimeType: string;
  summary?: string;
  addedAt: number;
  annualPremium?: number;
  isInternalSource?: boolean;
  centralCgId?: number;
  metadata?: any;
  subTypeCode?: string;
  subTypeLabel?: string;
}

export interface WebSearchResult {
  summary: string;
  sourceUrl?: string;
  detectedFormulas: string[];
  availableOptions?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isTyping?: boolean;
}

export interface OptimizationFinding {
  title: string;
  description: string;
  type: 'duplicate' | 'gap' | 'saving';
  severity: 'low' | 'medium' | 'high';
  involvedPolicies: string[];
  estimatedSaving?: number;
  recommendation: string;
  action?: 'remove_duplicate' | 'add_contract' | 'change_formula' | 'remove_option' | 'group_contracts' | 'info';
  comparisonDetails?: {
    policyA: string;
    policyB: string;
    overlap: string;
  };
}
