// =============================================================================
// Tests unitaires — OptimizerAgent
// =============================================================================
import { OptimizerAgent } from '../../agents/OptimizerAgent';
import { Policy, PolicyType } from '../../types';

jest.mock('../../services/geminiService');
import { getAiClient } from '../../services/geminiService';
const mockGetAiClient = getAiClient as jest.MockedFunction<typeof getAiClient>;

const AUTO_POLICY: Policy = {
  id: '1', userId: '1', name: 'MAAF Auto', provider: 'MAAF',
  type: PolicyType.AUTO, coverageDetail: 'Tous Risques',
  fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  annualPremium: 600,
};

const HOME_POLICY: Policy = {
  id: '2', userId: '1', name: 'AXA Habitation', provider: 'AXA',
  type: PolicyType.HOME, coverageDetail: 'Confort',
  fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  annualPremium: 350,
};

const LEGAL_POLICY: Policy = {
  id: '3', userId: '1', name: 'PJ Generali', provider: 'Generali',
  type: PolicyType.LEGAL, coverageDetail: 'Standard',
  fileData: null, fileName: null, mimeType: 'application/pdf', addedAt: Date.now(),
  annualPremium: 120,
};

describe('OptimizerAgent', () => {
  let agent: OptimizerAgent;

  beforeEach(() => {
    agent = new OptimizerAgent();
    jest.clearAllMocks();
  });

  // ── analyzeCircuit (toujours déterministe, pas de LLM) ───────────────────

  describe('analyzeCircuit()', () => {
    it('propose cache_hit si ragCacheHit=true', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: true,
        ragChunksFound: 5,
        policyCount: 3,
        hasUserProfile: true,
        intentConfidence: 0.9,
      });
      expect(opts.some((o) => o.type === 'cache_hit')).toBe(true);
    });

    it('propose shortcut si aucun chunk trouvé', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: false,
        ragChunksFound: 0,
        policyCount: 2,
        hasUserProfile: true,
        intentConfidence: 0.7,
      });
      expect(opts.some((o) => o.type === 'shortcut')).toBe(true);
    });

    it('propose skip AdvisorAgent si profil absent', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: false,
        ragChunksFound: 3,
        policyCount: 4,
        hasUserProfile: false,
        intentConfidence: 0.8,
      });
      const skip = opts.find((o) => o.type === 'skip' && o.agentAffected === 'AdvisorAgent');
      expect(skip).toBeDefined();
    });

    it('propose skip OptimizerAgent si moins de 2 polices', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: false,
        ragChunksFound: 2,
        policyCount: 1,
        hasUserProfile: true,
        intentConfidence: 0.8,
      });
      const skip = opts.find((o) => o.type === 'skip' && o.agentAffected === 'OptimizerAgent');
      expect(skip).toBeDefined();
    });

    it('propose parallel si confidence >= 0.85', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: false,
        ragChunksFound: 4,
        policyCount: 3,
        hasUserProfile: true,
        intentConfidence: 0.95,
      });
      expect(opts.some((o) => o.type === 'parallel')).toBe(true);
    });

    it('estimatedGainMs est toujours positif', () => {
      const opts = agent.analyzeCircuit({
        ragCacheHit: true,
        ragChunksFound: 0,
        policyCount: 1,
        hasUserProfile: false,
        intentConfidence: 0.95,
      });
      opts.forEach((o) => expect(o.estimatedGainMs).toBeGreaterThan(0));
    });
  });

  // ── optimize() avec moins de 2 polices ────────────────────────────────────

  describe('optimize() — moins de 2 polices', () => {
    it('retourne findings vide sans appeler le LLM', async () => {
      const result = await agent.optimize({ policies: [AUTO_POLICY] });
      expect(result.findings).toHaveLength(0);
      expect(result.totalEstimatedSaving).toBe(0);
      expect(mockGetAiClient).not.toHaveBeenCalled();
    });
  });

  // ── optimize() avec LLM disponible ────────────────────────────────────────

  describe('optimize() — avec portefeuille', () => {
    it('retourne les findings priorisés (top 3)', async () => {
      const mockModel = {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              findings: [
                { title: 'PJ dupliquée', description: 'desc', type: 'duplicate', severity: 'high', involvedPolicies: ['MAAF Auto', 'PJ Generali'], estimatedSaving: 120, recommendation: 'Supprimer PJ du contrat auto' },
                { title: 'Lacune prévoyance', description: 'desc', type: 'gap', severity: 'high', involvedPolicies: [], estimatedSaving: 0, recommendation: 'Souscrire prévoyance' },
                { title: 'Option optique inutile', description: 'desc', type: 'saving', severity: 'low', involvedPolicies: ['AXA Habitation'], estimatedSaving: 50, recommendation: 'Retirer option' },
                { title: 'Extra low', description: 'd', type: 'saving', severity: 'low', involvedPolicies: [], estimatedSaving: 20, recommendation: 'x' },
              ],
              totalEstimatedSaving: 190,
            }),
          },
        }),
      };
      mockGetAiClient.mockReturnValue({
        getGenerativeModel: jest.fn().mockReturnValue(mockModel),
      } as any);

      const result = await agent.optimize({
        policies: [AUTO_POLICY, HOME_POLICY, LEGAL_POLICY],
      });

      expect(result.findings).toHaveLength(4);
      expect(result.prioritized).toHaveLength(3);
      expect(result.totalEstimatedSaving).toBe(190);
      // Premier prioritized doit être severity=high
      expect(result.prioritized[0].severity).toBe('high');
    });

    it('retourne [] si le LLM plante', async () => {
      mockGetAiClient.mockReturnValue({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockRejectedValue(new Error('LLM error')),
        }),
      } as any);

      const result = await agent.optimize({
        policies: [AUTO_POLICY, HOME_POLICY],
      });

      expect(result.findings).toHaveLength(0);
    });
  });
});
