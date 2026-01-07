// -----------------------------------------------------------------------------
// Types partagés du backend
// Ce fichier contient les interfaces et enums utilisées côté serveur et côté
// client (lorsque les types sont partagés). Les types servent à mieux
// documenter les structures (ex: `Policy`, `User`).
// -----------------------------------------------------------------------------

export enum PolicyType {
  AUTO = 'Automobile',
  HOME = 'Habitation',
  HEALTH = 'Santé/Mutuelle',
  LEGAL = 'Protection Juridique',
  LIFE = 'Prévoyance/Décès',
  OTHER = 'Autre'
}

export type AppView = 'policies' | 'chat' | 'analysis' | 'experts' | 'profile';

/** Utilisateur stocké dans `users.json` (note : le mot de passe n'est pas
    inclus ici pour éviter des fuites accidentelles de structure). */
export interface User {
  id: string;
  email: string;
  name: string;
}

/** Représentation d'une police/contrat d'assurance. */
export interface Policy {
  id: string;
  userId: string;
  name: string; // nom commercial de la police
  provider: string; // compagnie d'assurance
  type: PolicyType | string; // catégorie (Automobile, Habitation, ...)
  coverageDetail?: string; // formule ou détail de couverture (ex: "Tous Risques")
  fileData: string | null; // contenu du fichier (base64) si fourni
  fileName: string | null; // nom du fichier joint
  sourceUrl?: string; // source web si fournie
  mimeType: string; // type MIME du document joint
  summary?: string; // résumé extrait / généré
  addedAt: number; // timestamp en ms
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