// =============================================================================
// Tests unitaires — AnalysisAgent
// =============================================================================
import { AnalysisAgent } from '../../agents/AnalysisAgent';
import { RAGResult, CoverageStatus } from '../../agents/types';
import { Policy, PolicyType } from '../../types';

jest.mock('../../services/geminiService');

import { getAiClient } from '../../services/geminiService';
const mockGetAiClient = getAiClient as jest.MockedFunction<typeof getAiClient>;

const EMPTY_RAG: RAGResult = {
  policyChunks: [],
  cgChunks: [],
  totalChunks: 0,
  fromCache: false,
};

const SAMPLE_POLICY: Policy = {
  id: '1',
  userId: '42',
  name: 'MAAF Auto Confort',
  provider: 'MAAF',
  type: PolicyType.AUTO,
  coverageDetail: 'Tous Risques',
  fileData: null,
  fileName: null,
  mimeType: 'application/pdf',
  addedAt: Date.now(),
};

describe('AnalysisAgent', () => {
  let agent: AnalysisAgent;

  beforeEach(() => {
    agent = new AnalysisAgent();
    jest.clearAllMocks();
  });

  it('retourne statut inconnu si client IA indisponible', async () => {
    mockGetAiClient.mockReturnValueOnce(null);

    const result = await agent.analyze({
      question: 'Suis-je couvert en cas de bris de glace ?',
      ragResult: EMPTY_RAG,
      policies: [SAMPLE_POLICY],
    });

    expect(result.status).toBe('inconnu');
    expect(result.lacunes).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(typeof result.summary).toBe('string');
  });

  it('retourne analyse structurée si LLM répond correctement', async () => {
    const mockModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'couvert',
            summary: 'Vous êtes couvert pour le bris de glace.',
            garantie: 'Bris de glace',
            montantMax: 'Valeur réelle',
            franchise: '50€',
            lacunes: [],
            sources: ['CG MAAF Auto - p.3'],
          }),
        },
      }),
    };
    mockGetAiClient.mockReturnValueOnce({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    } as any);

    const result = await agent.analyze({
      question: 'Mon bris de glace est-il couvert ?',
      ragResult: {
        policyChunks: [{ content: 'bris de glace couvert', source: 'CG MAAF p.3', similarity: 0.9 }],
        cgChunks: [],
        totalChunks: 1,
        fromCache: false,
      },
      policies: [SAMPLE_POLICY],
    });

    expect(result.status).toBe('couvert');
    expect(result.garantie).toBe('Bris de glace');
    expect(result.franchise).toBe('50€');
    expect(result.sources).toContain('CG MAAF Auto - p.3');
  });

  it('gère gracieusement un JSON malformé du LLM', async () => {
    const mockModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'réponse invalide non JSON' },
      }),
    };
    mockGetAiClient.mockReturnValueOnce({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    } as any);

    const result = await agent.analyze({
      question: 'test',
      ragResult: EMPTY_RAG,
      policies: [SAMPLE_POLICY],
    });

    expect(result.status).toBe('inconnu');
    expect(Array.isArray(result.lacunes)).toBe(true);
    expect(Array.isArray(result.sources)).toBe(true);
  });
});
