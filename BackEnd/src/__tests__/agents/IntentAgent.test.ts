// =============================================================================
// Tests unitaires — IntentAgent
// =============================================================================
import { IntentAgent } from '../../agents/IntentAgent';

// Mock du module geminiService — getAiClient retourne null (pas de LLM en test)
jest.mock('../../services/geminiService');

describe('IntentAgent', () => {
  let agent: IntentAgent;

  beforeEach(() => {
    agent = new IntentAgent();
    jest.clearAllMocks();
  });

  describe('detect() — fallback par mots-clés (sans LLM)', () => {
    it('détecte QUESTION_GARANTIE', async () => {
      const result = await agent.detect('Suis-je couvert en cas de bris de glace ?');
      expect(result.intent).toBe('QUESTION_GARANTIE');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('détecte SINISTRE', async () => {
      const result = await agent.detect("J'ai eu un accident de voiture hier soir");
      expect(result.intent).toBe('SINISTRE');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('détecte OPTIMISATION', async () => {
      const result = await agent.detect('Est-ce que je paye trop cher mes assurances ?');
      expect(result.intent).toBe('OPTIMISATION');
    });

    it('détecte CONSEIL', async () => {
      const result = await agent.detect("Que me conseilles-tu pour ma situation ?");
      expect(result.intent).toBe('CONSEIL');
    });

    it('détecte UPLOAD', async () => {
      const result = await agent.detect("Je veux ajouter un nouveau contrat PDF");
      expect(result.intent).toBe('UPLOAD');
    });

    it('retourne GENERAL pour un message hors-domaine', async () => {
      const result = await agent.detect("Bonjour, comment ça va ?");
      expect(result.intent).toBe('GENERAL');
    });

    it('retourne une confidence entre 0 et 1', async () => {
      const result = await agent.detect('sinistre inondation');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('retourne des entities (tableau même vide)', async () => {
      const result = await agent.detect('test');
      expect(Array.isArray(result.entities)).toBe(true);
    });
  });
});
