// -----------------------------------------------------------------------------
// Types partagÃ©s du backend
// Ce fichier contient les interfaces et enums utilisÃ©es cÃ´tÃ© serveur et cÃ´tÃ©
// client (lorsque les types sont partagÃ©s). Les types servent Ã  mieux
// documenter les structures (ex: `Policy`, `User`).
// -----------------------------------------------------------------------------

/**
 * Ã‰numÃ©ration des types de polices d'assurance supportÃ©s par l'application.
 * Chaque type correspond Ã  une catÃ©gorie distincte d'assurance.
 */
export enum PolicyType {
  AUTO = 'Automobile',              // Assurance automobile (voiture, moto, etc.)
  HOME = 'Habitation',              // Assurance habitation (propriÃ©taire/locataire)
  HEALTH = 'SantÃ©/Mutuelle',        // Assurance santÃ© et mutuelle complÃ©mentaire
  LEGAL = 'Protection Juridique',   // Protection juridique
  LIFE = 'PrÃ©voyance/DÃ©cÃ¨s',       // Assurance vie et prÃ©voyance
  BANK_CARD = 'Carte Bancaire',    // Assurance carte bancaire
  LOAN = 'Emprunteur/CrÃ©dit',      // Assurance emprunteur et crÃ©dit
  MOBILE = 'Appareils Mobiles',    // Assurance pour tÃ©lÃ©phones et appareils mobiles
  OTHER = 'Autre'                   // Autres types d'assurance non catÃ©gorisÃ©s
}

/**
 * Type dÃ©finissant les diffÃ©rentes vues/pages de l'application.
 * UtilisÃ© pour la navigation et le contrÃ´le d'accÃ¨s.
 */
export type AppView = 'policies'   // Vue de gestion des polices d'assurance
  | 'chat'                          // Vue de chat avec l'assistant IA
  | 'analysis'                      // Vue d'analyse des polices
  | 'experts'                       // Vue de contact avec les experts
  | 'profile'                       // Vue du profil utilisateur
  | 'admin';                        // Vue d'administration (accÃ¨s restreint)

/**
 * Interface reprÃ©sentant les donnÃ©es du profil dÃ©taillÃ© d'un utilisateur.
 * Ces informations permettent Ã  l'IA de fournir des recommandations personnalisÃ©es
 * et d'adapter les conseils en fonction de la situation de l'utilisateur.
 */
export interface UserProfileData {
  // --- Section Foyer ---
  // Informations sur la composition du foyer de l'utilisateur
  adultsCount?: number;                  // Nombre d'adultes dans le foyer
  childrenCount?: number;                // Nombre d'enfants
  householdMembersAges?: number[];      // Liste des Ã¢ges de tous les membres du foyer
  hasPets?: boolean;                    // PrÃ©sence d'animaux de compagnie
  petDetails?: string;                  // DÃ©tails sur les animaux (type, nombre, etc.)
  
  // --- Section Habitat ---
  // Informations sur le logement de l'utilisateur
  postalCode?: string;                                           // Code postal du domicile
  housingStatus?: 'owner' | 'tenant' | 'landlord';             // Statut : propriÃ©taire, locataire ou bailleur
  housingType?: 'apartment' | 'house';                         // Type de logement : appartement ou maison
  residenceType?: 'principal' | 'secondary';                   // RÃ©sidence principale ou secondaire
  housingSurface?: number;                                     // Surface habitable en mÂ²
  constructionYear?: number;                                   // AnnÃ©e de construction du logement
  hasPool?: boolean;                                           // PrÃ©sence d'une piscine
  hasGarden?: boolean;                                         // PrÃ©sence d'un jardin
  
  // --- Section Patrimoine & Finances ---
  // Informations sur les biens et la situation financiÃ¨re
  reconstructionValue?: number;          // Valeur de reconstruction Ã  neuf du logement (â‚¬)
  highTechValue?: number;                // Valeur des Ã©quipements high-tech (â‚¬)
  jewelryValue?: number;                 // Valeur des bijoux et objets de valeur (â‚¬)
  vehiclesCount?: number;                // Nombre de vÃ©hicules possÃ©dÃ©s
  monthlyIncome?: number;                // Revenus mensuels du foyer (â‚¬)
  
  // --- Section Travail & Loisirs ---
  // Informations professionnelles et activitÃ©s
  workStatus?: 'salariÃ©' | 'indÃ©pendant' | 'fonctionnaire' | 'sans-emploi' | 'retraitÃ©';  // Statut professionnel
  profession?: string;                   // IntitulÃ© de la profession
  teleworkDays?: number;                 // Nombre de jours de tÃ©lÃ©travail par semaine
  riskySports?: string[];                // Liste des sports Ã  risque pratiquÃ©s
  
  // --- Section SantÃ© ---
  // Informations sur les besoins en santÃ©
  healthNeeds?: string[];                // Besoins spÃ©cifiques (optique, dentaire, hospitalisation, etc.)
  healthSpecifics?: string;              // DÃ©tails supplÃ©mentaires sur la santÃ©
  
  // --- Section Historique ---
  // Historique et prÃ©fÃ©rences d'assurance
  claimsLast5Years?: number;             // Nombre de sinistres dÃ©clarÃ©s sur les 5 derniÃ¨res annÃ©es
  riskTolerance?: number;                // Niveau de tolÃ©rance au risque (Ã©chelle de 1 Ã  10)
}

/**
 * Interface reprÃ©sentant un utilisateur de l'application.
 * StockÃ© dans le fichier `users.json` avec le mot de passe hachÃ©.
 * Note : Le mot de passe n'est pas inclus dans cette interface pour Ã©viter
 * des fuites accidentelles lors de la sÃ©rialisation vers le client.
 */
export interface User {
  id: string;                    // Identifiant unique UUID
  email: string;                 // Adresse email (utilisÃ©e pour la connexion)
  firstName: string;             // PrÃ©nom de l'utilisateur
  lastName: string;              // Nom de famille de l'utilisateur
  profile?: UserProfileData;     // DonnÃ©es du profil dÃ©taillÃ© (optionnel)
  isAdmin?: boolean;             // Indicateur d'accÃ¨s administrateur (dÃ©faut: false)
}

/**
 * Interface reprÃ©sentant une entrÃ©e dans le rÃ©fÃ©rentiel central des Conditions GÃ©nÃ©rales (CG).
 * Ce rÃ©fÃ©rentiel permet de stocker et indexer les CG des diffÃ©rents assureurs
 * pour faciliter la recherche et la comparaison.
 */
export interface CentralCgEntry {
  id: string;                    // Identifiant unique de l'entrÃ©e
  provider: string;              // Nom de la compagnie d'assurance
  policyName: string;            // Nom commercial du produit d'assurance
  type: PolicyType;              // CatÃ©gorie d'assurance
  pdfUrl: string;                // URL ou chemin vers le PDF des conditions gÃ©nÃ©rales
  lastVerified: number;          // Timestamp de la derniÃ¨re vÃ©rification/mise Ã  jour
  indexedFormulas: string[];     // Liste des formules/garanties indexÃ©es (ex: "Tiers", "Tous Risques")
  indexedOptions: string[];      // Liste des options disponibles indexÃ©es
  semanticSummary: string;       // RÃ©sumÃ© sÃ©mantique pour la recherche IA
}

/**
 * Interface reprÃ©sentant une police/contrat d'assurance souscrit par un utilisateur.
 * Chaque police peut Ãªtre crÃ©Ã©e Ã  partir d'un fichier uploadÃ©, d'une recherche web,
 * ou directement depuis le rÃ©fÃ©rentiel central des CG.
 */
export interface Policy {
  id: string;                          // Identifiant unique de la police
  userId: string;                      // ID de l'utilisateur propriÃ©taire de cette police
  name: string;                        // Nom commercial de la police (ex: "Assurance Auto Confort")
  provider: string;                    // Nom de la compagnie d'assurance
  type: PolicyType | string;           // CatÃ©gorie d'assurance (Automobile, Habitation, etc.)
  coverageDetail?: string;             // DÃ©tail de la formule souscrite (ex: "Tous Risques", "Tiers+")
  options?: string[];                  // Liste des options souscrites (ex: "Bris de glace", "Assistance 0km")
  fileData: string | null;             // Contenu du document en base64 (PDF, image, etc.)
  fileName: string | null;             // Nom du fichier d'origine (ex: "contrat_auto.pdf")
  sourceUrl?: string;                  // URL de la source si rÃ©cupÃ©rÃ© depuis le web
  mimeType: string;                    // Type MIME du document (ex: "application/pdf", "image/jpeg")
  summary?: string;                    // RÃ©sumÃ© gÃ©nÃ©rÃ© par l'IA Ã  partir du document
  addedAt: number;                     // Timestamp d'ajout de la police (en millisecondes)
  annualPremium?: number;              // Montant de la prime annuelle en euros
  isInternalSource?: boolean;          // true si la police provient du rÃ©fÃ©rentiel central CG
}

/** RÃ©sultat d'une recherche web simulÃ©e / rÃ©elle pour un produit d'assurance. */
export interface WebSearchResult {
  summary: string;
  sourceUrl?: string;
  detectedFormulas: string[];  availableOptions?: string[];}

/** Message Ã©changÃ© avec l'assistant (chat). */
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isTyping?: boolean;
}

/** Structure utilisÃ©e pour rapporter des doublons potentiels entre polices. */
export interface DuplicateFinding {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  involvedPolicies: string[];
}
/** Structure étendue pour les analyses d'optimisation (inclut doublons, gaps, économies) */
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
/** RequÃªte envoyÃ©e Ã  un expert humain depuis l'application. */
export interface ExpertRequest {
  id: string;
  policyIds: string[];
  message: string;
  status: 'pending' | 'contacted';
  createdAt: number;
}

/** Résultat de l'extraction intelligente de contrats depuis du texte */
export interface SmartExtractionResult {
  policies: Array<Partial<Policy & { 
    isComplete: boolean; 
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
    summary?: string;
  }>>;
  clarificationQuestions: string[] | null;
}
