// =============================================================================
// Types partagés entre tous les agents BMAD
// =============================================================================

import { Policy, UserProfileData, OptimizationFinding, Message } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detection
// ─────────────────────────────────────────────────────────────────────────────

export type AgentIntent =
  | 'QUESTION_GARANTIE'   // "Suis-je couvert pour X ?"
  | 'SINISTRE'            // "J'ai eu un sinistre", "Que faire ?"
  | 'OPTIMISATION'        // "Est-ce que je paye trop ?", "Ai-je des doublons ?"
  | 'CONSEIL'             // "Que me conseilles-tu ?"
  | 'UPLOAD'              // Indexation d'un document
  | 'GENERAL';            // Question générale / hors domaine

export interface IntentResult {
  intent: AgentIntent;
  subtype?: string;          // ex: "inondation", "bris_glace", "vol"
  confidence: number;        // 0–1
  entities: string[];        // mots-clés extraits (noms d'assureur, types, etc.)
}

// ─────────────────────────────────────────────────────────────────────────────
// RAGAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface RAGInput {
  query: string;
  userId: number;
  policyIds?: string[];
  insurers?: string[];
  limit?: number;
}

export interface RAGChunk {
  content: string;
  source: string;        // ex: "MAAF Auto - CG p.12"
  similarity: number;    // 0–1
  chunkType?: string;    // "tableau" | "exclusion" | "definition" | ...
  pageNumber?: number;
  formulaKey?: string;
}

export interface RAGResult {
  policyChunks: RAGChunk[];
  cgChunks: RAGChunk[];
  totalChunks: number;
  fromCache: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalysisAgent
// ─────────────────────────────────────────────────────────────────────────────

export type CoverageStatus = 'couvert' | 'partiel' | 'non_couvert' | 'inconnu';

export interface AnalysisInput {
  question: string;
  ragResult: RAGResult;
  policies: Policy[];
  userProfile?: UserProfileData;
  /** Faits structurés garantie×formule depuis coverage_facts (source primaire) */
  coverageFacts?: CoverageFact[];
  /** Historique récent de la conversation (pour résoudre les questions de suivi) */
  history?: Message[];
}

/** Fait structuré issu de coverage_facts ou user_coverage_facts */
export interface CoverageFact {
  guarantee_label:  string;
  guarantee_key:    string;
  formula_label:    string;
  formula_key:      string;
  coverage_status:  string;   // 'included' | 'excluded' | 'optional' | 'not_applicable'
  coverage_amount:  string | null;
  franchise:        string | null;
  coverage_notes:   string | null;
  source_page_number?: number;
  insurer_label?:   string;
  pdf_url?:         string;
}

export interface CoverageAnalysisResult {
  status: CoverageStatus;
  summary: string;             // Réponse concise en langage naturel
  garantie?: string;           // Nom de la garantie concernée
  montantMax?: string;         // Plafond de couverture
  franchise?: string;          // Franchise applicable
  lacunes: string[];           // Points non couverts identifiés
  sources: string[];           // Références CG citées
  cgUrl?: string;              // URL du PDF des conditions générales source
  rawAnswer?: string;          // Réponse complète LLM
}

// ─────────────────────────────────────────────────────────────────────────────
// AdvisorAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvisorInput {
  analysis: CoverageAnalysisResult;
  policies: Policy[];
  userProfile?: UserProfileData;
  question: string;
}

export interface AdvisorResult {
  recommendations: string[];
  optimisations: string[];
  disclaimer: string;          // Toujours présent : "consultez un conseiller agréé"
  urgencyLevel: 'low' | 'medium' | 'high';
}

// ─────────────────────────────────────────────────────────────────────────────
// ClaimsAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimsInput {
  sinisterType: string;        // "inondation", "vol", "accident", ...
  policies: Policy[];
  userId: number;
  sessionId?: string;
  targetPolicyId?: string;     // Précisé lors d'une clarification (quel véhicule/contrat ?)
}

export interface ClaimsStep {
  step: number;
  title: string;
  description: string;
  deadline?: string;           // Délai légal ou contractuel
  contact?: string;            // Numéro / email assureur
}

export interface ClaimsResult {
  sinisterType: string;
  coveringPolicies: string[];  // Noms des polices qui couvrent ce sinistre
  steps: ClaimsStep[];
  urgencyLevel: 'low' | 'medium' | 'high';
  sessionId?: string;
  cgUrls?: Array<{ policyName: string; url: string }>;  // Liens vers les CG
  needsClarification?: string;  // Question posée à l'utilisateur si ambiguïté
}

// ─────────────────────────────────────────────────────────────────────────────
// OptimizerAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizerInput {
  policies: Policy[];
  userProfile?: UserProfileData;
  ragResult?: RAGResult;       // Chunks de CG pour affiner l'analyse
}

export interface CircuitOptimization {
  type: 'shortcut' | 'parallel' | 'cache_hit' | 'skip';
  agentAffected: string;
  description: string;
  estimatedGainMs: number;
}

export interface OptimizerResult {
  findings: OptimizationFinding[];
  totalEstimatedSaving: number;   // €/an
  circuitOptimizations: CircuitOptimization[];  // Optimisations du pipeline IA
  prioritized: OptimizationFinding[];           // Top 3 par impact
}

// ─────────────────────────────────────────────────────────────────────────────
// IngestionAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestionInput {
  pdfBase64?: string;
  pdfUrl?: string;
  mimeType: string;
  insurerCode?: string;
  insuranceTypeCode?: string;
  centralCgId?: number;
  policyId?: number;
}

export interface IngestionResult {
  success: boolean;
  pagesProcessed: number;
  chunksVectorized: number;
  tablesExtracted: number;
  tokensCost?: number;           // Coût estimé Gemini en USD
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  message: string;
  userId: number;
  policies: Policy[];
  history: Message[];
  userProfile?: UserProfileData;
}

export interface OrchestratorOutput {
  response: string;           // Réponse finale à streamer au client
  intent: AgentIntent;
  agentsUsed: string[];       // Pour observabilité/debug
  processingMs: number;
  optimizations?: CircuitOptimization[];
}

// Plan d'exécution interne de l'orchestrateur
export interface ExecutionPlan {
  intent: IntentResult;
  steps: Array<{
    agent: string;
    parallel?: boolean;       // Peut être lancé en parallèle avec d'autres
    optional?: boolean;       // Ne bloque pas si échec
  }>;
}
