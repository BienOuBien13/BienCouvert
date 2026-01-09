// -----------------------------------------------------------------------------
// Types partagés du backend
// Ce fichier contient les interfaces et enums utilisées côté serveur et côté
// client (lorsque les types sont partagés). Les types servent à mieux
// documenter les structures (ex: `Policy`, `User`).
// -----------------------------------------------------------------------------

/**
 * Énumération des types de polices d'assurance supportés par l'application.
 * Chaque type correspond à une catégorie distincte d'assurance.
 */
export enum PolicyType {
  AUTO = 'Automobile',              // Assurance automobile (voiture, moto, etc.)
  HOME = 'Habitation',              // Assurance habitation (propriétaire/locataire)
  HEALTH = 'Santé/Mutuelle',        // Assurance santé et mutuelle complémentaire
  LEGAL = 'Protection Juridique',   // Protection juridique
  LIFE = 'Prévoyance/Décès',       // Assurance vie et prévoyance
  BANK_CARD = 'Carte Bancaire',    // Assurance carte bancaire
  LOAN = 'Emprunteur/Crédit',      // Assurance emprunteur et crédit
  MOBILE = 'Appareils Mobiles',    // Assurance pour téléphones et appareils mobiles
  OTHER = 'Autre'                   // Autres types d'assurance non catégorisés
}

/**
 * Type définissant les différentes vues/pages de l'application.
 * Utilisé pour la navigation et le contrôle d'accès.
 */
export type AppView = 'policies'   // Vue de gestion des polices d'assurance
  | 'chat'                          // Vue de chat avec l'assistant IA
  | 'analysis'                      // Vue d'analyse des polices
  | 'experts'                       // Vue de contact avec les experts
  | 'profile'                       // Vue du profil utilisateur
  | 'admin';                        // Vue d'administration (accès restreint)

/**
 * Interface représentant les données du profil détaillé d'un utilisateur.
 * Ces informations permettent à l'IA de fournir des recommandations personnalisées
 * et d'adapter les conseils en fonction de la situation de l'utilisateur.
 */
export interface UserProfileData {
  // --- Section Foyer ---
  // Informations sur la composition du foyer de l'utilisateur
  adultsCount?: number;                  // Nombre d'adultes dans le foyer
  childrenCount?: number;                // Nombre d'enfants
  householdMembersAges?: number[];      // Liste des âges de tous les membres du foyer
  hasPets?: boolean;                    // Présence d'animaux de compagnie
  petDetails?: string;                  // Détails sur les animaux (type, nombre, etc.)
  
  // --- Section Habitat ---
  // Informations sur le logement de l'utilisateur
  postalCode?: string;                                           // Code postal du domicile
  housingStatus?: 'owner' | 'tenant' | 'landlord';             // Statut : propriétaire, locataire ou bailleur
  housingType?: 'apartment' | 'house';                         // Type de logement : appartement ou maison
  residenceType?: 'principal' | 'secondary';                   // Résidence principale ou secondaire
  housingSurface?: number;                                     // Surface habitable en m²
  constructionYear?: number;                                   // Année de construction du logement
  hasPool?: boolean;                                           // Présence d'une piscine
  hasGarden?: boolean;                                         // Présence d'un jardin
  
  // --- Section Patrimoine & Finances ---
  // Informations sur les biens et la situation financière
  reconstructionValue?: number;          // Valeur de reconstruction à neuf du logement (€)
  highTechValue?: number;                // Valeur des équipements high-tech (€)
  jewelryValue?: number;                 // Valeur des bijoux et objets de valeur (€)
  vehiclesCount?: number;                // Nombre de véhicules possédés
  monthlyIncome?: number;                // Revenus mensuels du foyer (€)
  
  // --- Section Travail & Loisirs ---
  // Informations professionnelles et activités
  workStatus?: 'salarié' | 'indépendant' | 'fonctionnaire' | 'sans-emploi' | 'retraité';  // Statut professionnel
  profession?: string;                   // Intitulé de la profession
  teleworkDays?: number;                 // Nombre de jours de télétravail par semaine
  riskySports?: string[];                // Liste des sports à risque pratiqués
  
  // --- Section Santé ---
  // Informations sur les besoins en santé
  healthNeeds?: string[];                // Besoins spécifiques (optique, dentaire, hospitalisation, etc.)
  healthSpecifics?: string;              // Détails supplémentaires sur la santé
  
  // --- Section Historique ---
  // Historique et préférences d'assurance
  claimsLast5Years?: number;             // Nombre de sinistres déclarés sur les 5 dernières années
  riskTolerance?: number;                // Niveau de tolérance au risque (échelle de 1 à 10)
}

/**
 * Interface représentant un utilisateur de l'application.
 * Stocké dans le fichier `users.json` avec le mot de passe haché.
 * Note : Le mot de passe n'est pas inclus dans cette interface pour éviter
 * des fuites accidentelles lors de la sérialisation vers le client.
 */
export interface User {
  id: string;                    // Identifiant unique UUID
  email: string;                 // Adresse email (utilisée pour la connexion)
  name: string;                  // Nom d'affichage de l'utilisateur
  profile?: UserProfileData;     // Données du profil détaillé (optionnel)
  isAdmin?: boolean;             // Indicateur d'accès administrateur (défaut: false)
}

/**
 * Interface représentant une entrée dans le référentiel central des Conditions Générales (CG).
 * Ce référentiel permet de stocker et indexer les CG des différents assureurs
 * pour faciliter la recherche et la comparaison.
 */
export interface CentralCgEntry {
  id: string;                    // Identifiant unique de l'entrée
  provider: string;              // Nom de la compagnie d'assurance
  policyName: string;            // Nom commercial du produit d'assurance
  type: PolicyType;              // Catégorie d'assurance
  pdfUrl: string;                // URL ou chemin vers le PDF des conditions générales
  lastVerified: number;          // Timestamp de la dernière vérification/mise à jour
  indexedFormulas: string[];     // Liste des formules/garanties indexées (ex: "Tiers", "Tous Risques")
  indexedOptions: string[];      // Liste des options disponibles indexées
  semanticSummary: string;       // Résumé sémantique pour la recherche IA
}

/**
 * Interface représentant une police/contrat d'assurance souscrit par un utilisateur.
 * Chaque police peut être créée à partir d'un fichier uploadé, d'une recherche web,
 * ou directement depuis le référentiel central des CG.
 */
export interface Policy {
  id: string;                          // Identifiant unique de la police
  userId: string;                      // ID de l'utilisateur propriétaire de cette police
  name: string;                        // Nom commercial de la police (ex: "Assurance Auto Confort")
  provider: string;                    // Nom de la compagnie d'assurance
  type: PolicyType | string;           // Catégorie d'assurance (Automobile, Habitation, etc.)
  coverageDetail?: string;             // Détail de la formule souscrite (ex: "Tous Risques", "Tiers+")
  options?: string[];                  // Liste des options souscrites (ex: "Bris de glace", "Assistance 0km")
  fileData: string | null;             // Contenu du document en base64 (PDF, image, etc.)
  fileName: string | null;             // Nom du fichier d'origine (ex: "contrat_auto.pdf")
  sourceUrl?: string;                  // URL de la source si récupéré depuis le web
  mimeType: string;                    // Type MIME du document (ex: "application/pdf", "image/jpeg")
  summary?: string;                    // Résumé généré par l'IA à partir du document
  addedAt: number;                     // Timestamp d'ajout de la police (en millisecondes)
  annualPremium?: number;              // Montant de la prime annuelle en euros
  isInternalSource?: boolean;          // true si la police provient du référentiel central CG
}

/** Résultat d'une recherche web simulée / réelle pour un produit d'assurance. */
export interface WebSearchResult {
  summary: string;
  sourceUrl?: string;
  detectedFormulas: string[];
}

/** Message échangé avec l'assistant (chat). */
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isTyping?: boolean;
}

/** Structure utilisée pour rapporter des doublons potentiels entre polices. */
export interface DuplicateFinding {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  involvedPolicies: string[];
}

/** Requête envoyée à un expert humain depuis l'application. */
export interface ExpertRequest {
  id: string;
  policyIds: string[];
  message: string;
  status: 'pending' | 'contacted';
  createdAt: number;
}