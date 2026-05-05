
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

export type AppView = 'home' | 'add' | 'smart-add' | 'policies' | 'chat' | 'analysis' | 'coverage' | 'experts' | 'profile' | 'admin' | 'monitoring' | 'sync' | 'contact' | 'partner' | 'sinistre' | 'my-cg';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profile?: UserProfileData;
  isAdmin?: boolean;
  isPartner?: boolean;           // Accès à la vue partenaire (courtier)
  geminiAiConsent?: boolean;  // Consentement pour traitement par Google Gemini AI
}

export interface CentralCgEntry {
  id: string;
  insurerCode: string;              // Code de l'assureur
  insuranceTypeCode: string;        // Code du type d'assurance
  version?: string;                 // Version du document
  type?: string;                    // Type de document
  owner?: string;                   // Propriétaire (user actif)
  detail?: string;                  // Détail
  url?: string;                     // URL additionnelle
  targetFilename?: string;          // Nom du fichier PDF
  status?: string;                  // Statut (active, inactive, etc.)
  contentText?: string;             // Texte extrait
  embedding?: any;                  // Vecteur d'embedding
  metadata?: {                      // Métadonnées structurées
    indexedFormulas?: string[];     // Formules indexées
    indexedOptions?: Record<string, string[]>;  // Options par formule
    description?: string;           // Description en quelques lignes
    type?: string;                  // Type de formule/couverture
  };
  createdAt?: number;
  updatedAt?: number;
  vectorizedAt?: string | null;     // Date de vectorisation
  // Champs de compatibilité et affichage
  insurer?: string;                 // Label assureur (pour affichage)
  insuranceTypeLabel?: string;      // Label type d'assurance (pour affichage)
  productName?: string;             // Nom du produit (pour affichage)
  provider?: string;                // Alias insurer pour compatibilité geminiService
  pdfUrl?: string;                  // URL directe vers le PDF
  documentUrl?: string;             // URL du document (alias pdfUrl)
  semanticSummary?: string;         // Résumé sémantique généré par l'IA
  indexedFormulas?: string[];       // Pour compatibilité
  indexedOptions?: string[];        // Pour compatibilité
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
  insurerCode?: string;
  type: PolicyType;
  typeCode?: string;
  coverage?: string; // Formule d'assurance (ex: "Plénitude", "Tous Risques")
  formula?: string; // Alias formule pour compatibilité inline edit
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
  subTypeCode?: string;   // Code du sous-type d'assurance (ex: HAB_PRINCIPALE, PNO, AUTO, MOTO…)
  subTypeLabel?: string;  // Label lisible du sous-type
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
