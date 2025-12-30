
export enum PolicyType {
  AUTO = 'Automobile',
  HOME = 'Habitation',
  HEALTH = 'Santé/Mutuelle',
  LEGAL = 'Protection Juridique',
  LIFE = 'Prévoyance/Décès',
  OTHER = 'Autre'
}

export type AppView = 'policies' | 'chat' | 'analysis' | 'experts' | 'profile';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Policy {
  id: string;
  userId: string;
  name: string;
  provider: string;
  type: PolicyType;
  coverageDetail?: string;
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
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isTyping?: boolean;
}

export interface DuplicateFinding {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  involvedPolicies: string[];
}

export interface ExpertRequest {
  id: string;
  policyIds: string[];
  message: string;
  status: 'pending' | 'contacted';
  createdAt: number;
}
