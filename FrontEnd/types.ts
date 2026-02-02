
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

export type AppView = 'home' | 'add' | 'policies' | 'chat' | 'analysis' | 'experts' | 'profile' | 'admin' | 'sync' | 'contact';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profile?: UserProfileData;
  isAdmin?: boolean;
  geminiAiConsent?: boolean;  // Consentement pour traitement par Google Gemini AI
}

export interface CentralCgEntry {
  id: string;
  insurer: string;
  productName: string;
  type: PolicyType;
  pdfUrl: string;
  lastVerified: number;
  indexedFormulas: string[];
  indexedOptions: string[];
  semanticSummary: string;
  metadata?: any; // JSON avec type, formule, etc.
}

export interface UserProfileData {
  // Foyer
  adultsCount?: number;
  childrenCount?: number;
  householdMembersAges?: number[]; // Âges individuels
  hasPets?: boolean;
  petDetails?: string;
  
  // Habitat
  postalCode?: string;
  housingStatus?: 'owner' | 'tenant' | 'landlord';
  housingType?: 'apartment' | 'house';
  residenceType?: 'principal' | 'secondary';
  housingSurface?: number;
  constructionYear?: number;
  hasPool?: boolean;
  hasGarden?: boolean;
  
  // Patrimoine & Finances
  reconstructionValue?: number;
  highTechValue?: number;
  jewelryValue?: number;
  vehiclesCount?: number;
  monthlyIncome?: number;
  
  // Travail & Loisirs
  workStatus?: 'salarié' | 'indépendant' | 'fonctionnaire' | 'sans-emploi' | 'retraité';
  profession?: string;
  teleworkDays?: number;
  riskySports?: string[];
  
  // Santé
  healthNeeds?: string[];
  healthSpecifics?: string;
  
  // Historique
  claimsLast5Years?: number;
  riskTolerance?: number;
}

export interface Policy {
  id: string;
  userId: string;
  name: string;
  insurer: string;
  type: PolicyType;
  coverage?: string; // Formule d'assurance (ex: "Plénitude", "Tous Risques")
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
  metadata?: any; // JSON pour stocker formule, options, etc.
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
  comparisonDetails?: {
    policyA: string;
    policyB: string;
    overlap: string;
  };
}
