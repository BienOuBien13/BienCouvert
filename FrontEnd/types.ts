
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

export type AppView = 'policies' | 'chat' | 'analysis' | 'experts' | 'profile';

export interface User {
  id: string;
  email: string;
  name: string;
  profile?: UserProfileData;
}

export interface UserProfileData {
  // Logement & Famille
  hasPool?: boolean;
  hasGarden?: boolean;
  childrenCount?: number;
  
  // Travail & Statut
  profession?: string;
  workStatus?: 'salarié' | 'indépendant' | 'fonctionnaire' | 'sans-emploi' | 'retraité';
  isTeleworking?: boolean;

  // Santé & Risques
  healthNeeds?: string[];
  healthSpecifics?: string; // Champ libre antécédents/risques
  
  // Loisirs & Lifestyle
  expensiveEquipment?: string[];
  riskySports?: string[]; // Parapente, plongée, ski, etc.
  travelFrequency?: 'rare' | 'occasionnel' | 'fréquent';
  
  // Projets & Expression libre
  lifeProjects?: string; // Champ libre : "Je vais acheter une maison", "Je pars au Japon"
}

export interface Policy {
  id: string;
  userId: string;
  name: string;
  provider: string;
  type: PolicyType;
  coverageDetail?: string; // Formula name
  options?: string[]; // Specific add-ons like "Jardin+", "Vol 24h/24"
  fileData: string | null;
  fileName: string | null;
  sourceUrl?: string;
  mimeType: string;
  summary?: string;
  addedAt: number;
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
}

export interface ExpertRequest {
  id: string;
  policyIds: string[];
  message: string;
  status: 'pending' | 'contacted';
  createdAt: number;
}
