// =============================================================================
// Index — Point d'export unique pour tous les agents BMAD
// =============================================================================

export { orchestratorAgent, OrchestratorAgent } from './OrchestratorAgent';
export { ragAgent, RAGAgent } from './RAGAgent';
export { analysisAgent, AnalysisAgent } from './AnalysisAgent';
export { advisorAgent, AdvisorAgent } from './AdvisorAgent';
export { claimsAgent, ClaimsAgent } from './ClaimsAgent';
export { optimizerAgent, OptimizerAgent } from './OptimizerAgent';
export { intentAgent, IntentAgent } from './IntentAgent';
export { ingestionAgent, IngestionAgent } from './IngestionAgent';

// Re-export des types
export type {
  AgentIntent,
  IntentResult,
  RAGInput,
  RAGResult,
  RAGChunk,
  AnalysisInput,
  CoverageAnalysisResult,
  CoverageStatus,
  AdvisorInput,
  AdvisorResult,
  ClaimsInput,
  ClaimsResult,
  ClaimsStep,
  OptimizerInput,
  OptimizerResult,
  CircuitOptimization,
  IngestionInput,
  IngestionResult,
  OrchestratorInput,
  OrchestratorOutput,
  ExecutionPlan,
} from './types';
