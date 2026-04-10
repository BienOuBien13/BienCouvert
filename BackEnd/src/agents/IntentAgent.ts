// =============================================================================
// IntentAgent — Détecteur d'intention (léger, rapide)
// Utilise un prompt minimal sur Gemini Flash pour classifier l'intention
// du message utilisateur. Coût : ~0,001$/requête.
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { AgentIntent, IntentResult } from './types';

const INTENT_EXAMPLES: Record<AgentIntent, string[]> = {
  QUESTION_GARANTIE: [
    'suis-je couvert', 'est-ce que mon assurance couvre', 'ma garantie',
    'couverture', 'remboursement', 'est couvert', 'garantit',
  ],
  SINISTRE: [
    'sinistre', 'accident', 'inondation', 'vol', 'incendie', 'dégâts',
    'que faire', 'déclarer', 'catastrophe', 'bris', 'collision',
  ],
  OPTIMISATION: [
    'doublon', 'trop cher', 'optimiser', 'économiser', 'améliorer',
    'réduire ma prime', 'comparer', 'redondance', 'superflu',
  ],
  CONSEIL: [
    'conseille', 'recommande', 'devrais-je', 'est-ce utile',
    'vaut-il la peine', 'ai-je besoin', 'faut-il',
  ],
  UPLOAD: [
    'ajouter', 'charger', 'uploader', 'importer', 'nouveau contrat',
    'pdf', 'document',
  ],
  GENERAL: ['pourquoi', 'comment se fait', 'tu m\'as dit', 'c\'est quoi', 'explique'],
};

/** Détection rapide par mots-clés (sans LLM) — fallback ou pré-filtrage */
function detectByKeywords(message: string): AgentIntent | null {
  const lower = message.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_EXAMPLES)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as AgentIntent;
    }
  }
  return null;
}

export class IntentAgent {
  readonly name = 'IntentAgent';

  /**
   * Classifie l'intention avec Gemini Flash si disponible,
   * sinon fallback sur détection par mots-clés.
   */
  async detect(message: string): Promise<IntentResult> {
    // Essai rapide par mots-clés d'abord
    const keywordIntent = detectByKeywords(message);

    const ai = getAiClient();
    if (!ai) {
      return {
        intent: keywordIntent || 'GENERAL',
        confidence: keywordIntent ? 0.65 : 0.3,
        entities: [],
      };
    }

    const prompt = `Classifie ce message utilisateur (assurance) en une seule intention.

MESSAGE : "${message}"

INTENTIONS DISPONIBLES :
- QUESTION_GARANTIE : question sur une couverture spécifique ("suis-je couvert", "est-ce que mon assurance couvre...")
- SINISTRE : déclaration ou procédure de sinistre concret ("j'ai eu un accident", "mon appartement a été cambriolé", "j'ai perdu mon téléphone / mes clés")
- OPTIMISATION : analyse des doublons/économies
- CONSEIL : demande explicite de recommandation personnalisée ("que me conseilles-tu", "devrais-je changer de formule")
- UPLOAD : ajout d'un document/contrat
- GENERAL : question générale, clarification ou explication ("pourquoi tu as dit", "c'est quoi", "comment ça fonctionne", "tu m'as dit que")

REGLES IMPORTANTES :
- Les questions de CLARIFICATION ou d'EXPLICATION (commencent par "pourquoi", "comment se fait-il", "tu m'as dit", "explique") → GENERAL
- CONSEIL uniquement si l'utilisateur demande EXPLICITEMENT une recommandation ou un avis
- QUESTION_GARANTIE si l'utilisateur demande si quelque chose est couvert, même implicitement

Réponds UNIQUEMENT en JSON :
{
  "intent": "QUESTION_GARANTIE",
  "subtype": "inondation",
  "confidence": 0.92,
  "entities": ["MAAF", "inondation", "habitation"]
}`;

    try {
      const model = ai.getGenerativeModel(
        {
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json' },
        },
        'intentAgent',
      );
      const result = await model.generateContent([prompt]);
      const parsed = JSON.parse(result.response.text());

      return {
        intent: (parsed.intent as AgentIntent) || keywordIntent || 'GENERAL',
        subtype: parsed.subtype || undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      };
    } catch (e: any) {
      console.warn('[IntentAgent] Fallback keywords:', e.message);
      return {
        intent: keywordIntent || 'GENERAL',
        confidence: keywordIntent ? 0.6 : 0.3,
        entities: [],
      };
    }
  }
}

export const intentAgent = new IntentAgent();
