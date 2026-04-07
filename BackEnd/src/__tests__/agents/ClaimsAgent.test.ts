// =============================================================================
// Tests unitaires — ClaimsAgent
// =============================================================================
import { ClaimsAgent } from '../../agents/ClaimsAgent';
import { Policy, PolicyType } from '../../types';

jest.mock('../../services/geminiService');
jest.mock('../../db');

import { getAiClient } from '../../services/geminiService';
import { query } from '../../db';
const mockGetAiClient = getAiClient as jest.MockedFunction<typeof getAiClient>;
const mockQuery = query as jest.MockedFunction<typeof query>;

const POLICIES: Policy[] = [
  {
    id: '1', userId: '1', name: 'MAAF Habitation', provider: 'MAAF',
    type: PolicyType.HOME, coverageDetail: 'Tous Risques',
    fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  },
  {
    id: '2', userId: '1', name: 'AXA Auto', provider: 'AXA',
    type: PolicyType.AUTO, coverageDetail: 'Tiers',
    fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  },
];

describe('ClaimsAgent', () => {
  let agent: ClaimsAgent;

  beforeEach(() => {
    agent = new ClaimsAgent();
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 99 }], rowCount: 1 } as any);
  });

  it('identifie les polices couvrant une inondation', async () => {
    mockGetAiClient.mockReturnValue(null); // Pas de LLM → procédure générique

    const result = await agent.guide({ sinisterType: 'inondation', policies: POLICIES, userId: 1 });

    expect(result.coveringPolicies).toContain('MAAF Habitation');
    expect(result.coveringPolicies).not.toContain('AXA Auto');
  });

  it('identifie les polices couvrant un accident auto', async () => {
    mockGetAiClient.mockReturnValue(null);

    const result = await agent.guide({ sinisterType: 'accident_auto', policies: POLICIES, userId: 1 });

    expect(result.coveringPolicies).toContain('AXA Auto');
  });

  it('retourne une procédure générique si LLM indisponible', async () => {
    mockGetAiClient.mockReturnValue(null);

    const result = await agent.guide({ sinisterType: 'vol', policies: POLICIES, userId: 1 });

    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].step).toBe(1);
    expect(typeof result.steps[0].title).toBe('string');
  });

  it('utilise la procédure LLM si disponible', async () => {
    const mockModel = {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            urgencyLevel: 'high',
            steps: [
              { step: 1, title: 'Appeler secours', description: 'Appeler le 18', deadline: 'Immédiat', contact: '18' },
              { step: 2, title: 'Déclarer', description: 'Déclarer à votre assureur', deadline: '5 jours', contact: null },
            ],
          }),
        },
      }),
    };
    mockGetAiClient.mockReturnValue({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    } as any);

    const result = await agent.guide({ sinisterType: 'incendie', policies: POLICIES, userId: 1 });

    expect(result.urgencyLevel).toBe('high');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].contact).toBe('18');
  });

  it('crée une session sinistre en DB', async () => {
    mockGetAiClient.mockReturnValue(null);

    await agent.guide({ sinisterType: 'vol', policies: POLICIES, userId: 1 });

    // Vérifie qu'un INSERT claim_sessions a été appelé
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO claim_sessions'),
      expect.arrayContaining([1, 'vol']),
    );
  });

  it('ré-utilise une session existante si sessionId fourni', async () => {
    mockGetAiClient.mockReturnValue(null);

    const result = await agent.guide({
      sinisterType: 'vol',
      policies: POLICIES,
      userId: 1,
      sessionId: '555',
    });

    // Ne doit PAS créer de nouvelle session (INSERT) si sessionId fourni
    const insertCalls = mockQuery.mock.calls.filter((call) =>
      (call[0] as string).includes('INSERT INTO claim_sessions') && !(call[0] as string).includes('messages'),
    );
    expect(insertCalls).toHaveLength(0);
    expect(result.sessionId).toBe('555');
  });
});
