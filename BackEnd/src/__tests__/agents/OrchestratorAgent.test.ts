// =============================================================================
// Tests unitaires — OrchestratorAgent (intégration légère, sans LLM)
// =============================================================================
import { OrchestratorAgent } from '../../agents/OrchestratorAgent';
import { Policy, PolicyType } from '../../types';

// Mocks globaux
jest.mock('../../services/geminiService');
jest.mock('../../services/cacheService');
jest.mock('../../storage');
jest.mock('../../db');

import { getAiClient } from '../../services/geminiService';
import { cacheGet } from '../../services/cacheService';
import { storage } from '../../storage';
import { query } from '../../db';

const mockGetAiClient = getAiClient as jest.MockedFunction<typeof getAiClient>;
const mockCacheGet = cacheGet as jest.MockedFunction<typeof cacheGet>;
const mockStorage = storage as jest.Mocked<typeof storage>;
const mockQuery = query as jest.MockedFunction<typeof query>;

const POLICIES: Policy[] = [
  {
    id: '10', userId: '1', name: 'MAAF Auto', provider: 'MAAF',
    type: PolicyType.AUTO, coverageDetail: 'Tous Risques',
    fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAiClient.mockReturnValue(null);         // Pas de LLM
  mockCacheGet.mockResolvedValue(null);           // Pas de cache
  mockStorage.searchPolicyEmbeddings.mockResolvedValue([]);
  mockStorage.searchCentralCg.mockResolvedValue([]);
  mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 } as any);
});

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;

  beforeEach(() => {
    orchestrator = new OrchestratorAgent();
  });

  it('retourne un OrchestratorOutput valide', async () => {
    const output = await orchestrator.run({
      message: 'Suis-je couvert en cas de vol ?',
      userId: 1,
      policies: POLICIES,
      history: [],
    });

    expect(output).toHaveProperty('response');
    expect(output).toHaveProperty('intent');
    expect(output).toHaveProperty('agentsUsed');
    expect(output).toHaveProperty('processingMs');
    expect(Array.isArray(output.agentsUsed)).toBe(true);
    expect(typeof output.processingMs).toBe('number');
  });

  it('inclut IntentAgent dans agentsUsed', async () => {
    const output = await orchestrator.run({
      message: 'test question',
      userId: 1,
      policies: POLICIES,
      history: [],
    });

    expect(output.agentsUsed).toContain('IntentAgent');
  });

  it('route SINISTRE vers ClaimsAgent', async () => {
    const output = await orchestrator.run({
      message: "J'ai eu une inondation dans ma maison",
      userId: 1,
      policies: POLICIES,
      history: [],
    });

    expect(output.intent).toBe('SINISTRE');
    expect(output.agentsUsed).toContain('ClaimsAgent');
    expect(output.response).toContain('inondation');
  });

  it('route OPTIMISATION vers OptimizerAgent', async () => {
    const twoPolicies: Policy[] = [
      ...POLICIES,
      {
        id: '11', userId: '1', name: 'AXA Habitation', provider: 'AXA',
        type: PolicyType.HOME, coverageDetail: 'Confort',
        fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
      },
    ];

    const output = await orchestrator.run({
      message: 'Est-ce que je paye des doublons dans mes assurances ?',
      userId: 1,
      policies: twoPolicies,
      history: [],
    });

    expect(output.intent).toBe('OPTIMISATION');
    expect(output.agentsUsed).toContain('OptimizerAgent');
  });

  it('gère UPLOAD sans erreur', async () => {
    const output = await orchestrator.run({
      message: 'Je veux uploader un nouveau contrat PDF',
      userId: 1,
      policies: POLICIES,
      history: [],
    });

    expect(output.intent).toBe('UPLOAD');
    expect(typeof output.response).toBe('string');
    expect(output.response.length).toBeGreaterThan(0);
  });

  it('appelle onChunk callback pour le streaming', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);

    await orchestrator.runStream(
      {
        message: 'Je veux ajouter un contrat',
        userId: 1,
        policies: POLICIES,
        history: [],
      },
      onChunk,
    );

    // Au moins un chunk doit avoir été émis
    expect(chunks.length).toBeGreaterThan(0);
    // Le contenu reconstitué doit être non vide
    expect(chunks.join('')).toBeTruthy();
  });

  it('processingMs est raisonnable (< 10s en test)', async () => {
    const output = await orchestrator.run({
      message: 'test timing',
      userId: 1,
      policies: POLICIES,
      history: [],
    });

    expect(output.processingMs).toBeLessThan(10000);
  });
});
