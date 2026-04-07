// =============================================================================
// Tests unitaires — RAGAgent
// =============================================================================
import { RAGAgent } from '../../agents/RAGAgent';

jest.mock('../../services/geminiService');
jest.mock('../../services/cacheService');
jest.mock('../../storage');

import { generateEmbedding } from '../../services/geminiService';
import { cacheGet, cacheSet } from '../../services/cacheService';
import { storage } from '../../storage';

const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;
const mockCacheGet = cacheGet as jest.MockedFunction<typeof cacheGet>;
const mockCacheSet = cacheSet as jest.MockedFunction<typeof cacheSet>;
const mockStorage = storage as jest.Mocked<typeof storage>;

const FAKE_EMBEDDING = new Array(768).fill(0.1);

describe('RAGAgent', () => {
  let agent: RAGAgent;

  beforeEach(() => {
    agent = new RAGAgent();
    jest.clearAllMocks();
  });

  it('retourne fromCache=true si Redis hit', async () => {
    const cachedResult = {
      policyChunks: [{ content: 'cached', source: 'test', similarity: 0.9, chunkType: 'tableau' }],
      cgChunks: [],
      totalChunks: 1,
      fromCache: false, // sera override à true
    };
    mockCacheGet.mockResolvedValueOnce(cachedResult);

    const result = await agent.search({ query: 'test', userId: 1 });

    expect(result.fromCache).toBe(true);
    expect(result.totalChunks).toBe(1);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it('retourne 0 chunks si embedding unavailable (null)', async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    mockGenerateEmbedding.mockResolvedValueOnce(null);

    const result = await agent.search({ query: 'test', userId: 1, policyIds: ['1'] });

    expect(result.policyChunks).toHaveLength(0);
    expect(result.cgChunks).toHaveLength(0);
    expect(result.fromCache).toBe(false);
  });

  it('filtre les chunks sous le seuil de similarité (0.5)', async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    mockGenerateEmbedding.mockResolvedValueOnce(FAKE_EMBEDDING);
    mockStorage.searchPolicyEmbeddings.mockResolvedValueOnce([
      { chunk_text: 'très pertinent', policy_id: 1, similarity: 0.85, chunk_type: 'garantie' },
      { chunk_text: 'peu pertinent', policy_id: 1, similarity: 0.3, chunk_type: 'autre' },
    ] as any);
    mockStorage.searchCentralCg.mockResolvedValueOnce([]);

    const result = await agent.search({ query: 'RC auto', userId: 1, policyIds: ['1'] });

    expect(result.policyChunks).toHaveLength(1);
    expect(result.policyChunks[0].content).toBe('très pertinent');
  });

  it('appelle cacheSet après une recherche réelle', async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    mockGenerateEmbedding.mockResolvedValueOnce(FAKE_EMBEDDING);
    mockStorage.searchPolicyEmbeddings.mockResolvedValueOnce([]);
    mockStorage.searchCentralCg.mockResolvedValueOnce([]);

    await agent.search({ query: 'test', userId: 1 });

    expect(mockCacheSet).toHaveBeenCalledTimes(1);
  });

  it('inclut les chunks CG admin dans le résultat', async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    mockGenerateEmbedding.mockResolvedValueOnce(FAKE_EMBEDDING);
    mockStorage.searchPolicyEmbeddings.mockResolvedValueOnce([]);
    mockStorage.searchCentralCg.mockResolvedValueOnce([
      {
        content_text: 'Garantie inondation MAAF',
        insurer_label: 'MAAF',
        insurer_code: 'MAAF',
        product_name: 'Assurance Habitation',
        page_number: 5,
        similarity: 0.78,
        chunk_type: 'tableau',
      },
    ] as any);

    const result = await agent.search({ query: 'inondation', userId: 1, insurers: ['MAAF'] });

    expect(result.cgChunks).toHaveLength(1);
    expect(result.cgChunks[0].source).toContain('MAAF');
    expect(result.totalChunks).toBe(1);
  });
});
