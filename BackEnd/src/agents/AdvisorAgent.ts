// =============================================================================
// AdvisorAgent — Conseiller personnalisé
// Responsabilité : produire des recommandations personnalisées en s'appuyant
// sur le résultat d'analyse et le profil complet de l'utilisateur.
// JAMAIS de conseil financier réglementé — toujours orienter vers un conseiller.
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { Policy } from '../types';
import { AdvisorInput, AdvisorResult, CoverageAnalysisResult } from './types';

const DISCLAIMER =
  'Ces informations sont données à titre indicatif. Pour toute décision contractuelle, consultez un conseiller en assurance agréé (ORIAS).';

export class AdvisorAgent {
  readonly name = 'AdvisorAgent';

  async advise(input: AdvisorInput): Promise<AdvisorResult> {
    const { analysis, policies, userProfile, question } = input;

    const ai = getAiClient();
    if (!ai) {
      return this.fallback();
    }

    const profileLines: string[] = [];
    if (userProfile) {
      if (userProfile.adultsCount !== undefined)
        profileLines.push(`- ${userProfile.adultsCount} adulte(s) dans le foyer`);
      if (userProfile.childrenCount !== undefined)
        profileLines.push(`- ${userProfile.childrenCount} enfant(s)`);
      if (userProfile.housingStatus) profileLines.push(`- Statut logement : ${userProfile.housingStatus}`);
      if (userProfile.vehiclesCount !== undefined)
        profileLines.push(`- ${userProfile.vehiclesCount} véhicule(s)`);
      if (userProfile.riskTolerance !== undefined)
        profileLines.push(`- Tolérance au risque : ${userProfile.riskTolerance}/10`);
    }

    const analysisContext = `
RÉSULTAT D'ANALYSE :
- Statut couverture : ${analysis.status}
- Résumé : ${analysis.summary}
${analysis.lacunes.length > 0 ? `- Lacunes détectées : ${analysis.lacunes.join(', ')}` : ''}
${analysis.sources.length > 0 ? `- Sources : ${analysis.sources.join(', ')}` : ''}`;

    const policyList = policies
      .map((p) => `- "${p.name}" chez ${p.provider} (${p.type}) — prime: ${p.annualPremium ? p.annualPremium + '€/an' : 'inconnue'}`)
      .join('\n');

    const prompt = `Tu es un conseiller en assurances bienveillant. Question initiale : "${question}"
${analysisContext}

PORTEFEUILLE DE L'UTILISATEUR :
${policyList}

PROFIL :
${profileLines.length > 0 ? profileLines.join('\n') : 'Non renseigné'}

Génère des recommandations concrètes et personnalisées. 
RÈGLES STRICTES :
- Ne mentionne jamais de montants de prime précis sauf ceux fournis
- Ne promets pas de résultat garanti
- Toujours distinguer "recommandation" (amélioration possible) et "optimisation" (doublon/économie)
- Urgence = high si lacune grave identifiée (ex: RC obligatoire manquante)

Réponds UNIQUEMENT en JSON :
{
  "recommendations": ["recommandation 1", "recommandation 2"],
  "optimisations": ["optimisation 1"],
  "urgencyLevel": "low" | "medium" | "high"
}`;

    try {
      const model = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
        'advisorAgent',
      );
      const result = await model.generateContent([prompt]);
      const parsed = JSON.parse(result.response.text());

      return {
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        optimisations: Array.isArray(parsed.optimisations) ? parsed.optimisations : [],
        urgencyLevel: parsed.urgencyLevel || 'low',
        disclaimer: DISCLAIMER,
      };
    } catch (e: any) {
      console.error('[AdvisorAgent] Erreur LLM:', e.message);
      return this.fallback();
    }
  }

  private fallback(): AdvisorResult {
    return {
      recommendations: [],
      optimisations: [],
      urgencyLevel: 'low',
      disclaimer: DISCLAIMER,
    };
  }
}

export const advisorAgent = new AdvisorAgent();
