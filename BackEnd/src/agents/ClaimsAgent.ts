// =============================================================================
// ClaimsAgent — Guide sinistre
// Responsabilité : fournir la procédure étape par étape pour déclarer un
// sinistre, personnalisée avec les contrats actifs de l'utilisateur.
// Stateful : maintient l'état de la procédure en cours via claim_sessions.
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { query as dbQuery } from '../db';
import { Policy } from '../types';
import { ClaimsInput, ClaimsResult, ClaimsStep } from './types';

export class ClaimsAgent {
  readonly name = 'ClaimsAgent';

  /** Identifie les polices qui couvrent un type de sinistre donné */
  private identifyCoveringPolicies(sinisterType: string, policies: Policy[]): Policy[] {
    // Normalise : minuscules, accents supprimés, underscores → espaces
    const normalize = (s: string) =>
      s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/_/g, ' ');

    const sinisterNorm = normalize(sinisterType);

    // Chaque entrée = tableau de mots-clés déclencheurs → types de polices couvrants
    const TYPE_MAP: Array<{ triggers: string[]; policyTypes: string[] }> = [
      { triggers: ['bris de glace', 'bris glace', 'bris'],         policyTypes: ['automobile', 'auto'] },
      { triggers: ['accident auto', 'accident voiture', 'collision', 'accrochage'], policyTypes: ['automobile', 'auto'] },
      { triggers: ['inondation', 'dégât des eaux', 'degat des eaux', 'dégâts des eaux'], policyTypes: ['habitation', 'mrh'] },
      { triggers: ['incendie', 'feu', 'brûlure'],                  policyTypes: ['habitation', 'mrh'] },
      { triggers: ['vol voiture', 'vol auto', 'vol du véhicule'],  policyTypes: ['automobile', 'auto'] },
      { triggers: ['vol', 'cambriolage', 'effraction'],            policyTypes: ['habitation', 'automobile', 'mrh', 'auto'] },
      { triggers: ['sante', 'maladie', 'hospitalisation', 'chirurgie', 'médecin', 'medecin'], policyTypes: ['sante', 'mutuelle', 'prevoyance'] },
      { triggers: ['deces', 'décès', 'invalide', 'invalidite'],    policyTypes: ['prevoyance', 'vie', 'deces'] },
      { triggers: ['litige', 'juridique', 'judiciaire', 'avocat'], policyTypes: ['protection juridique', 'juridique'] },
      { triggers: ['cle perdue', 'clé perdue', 'serrure', 'serrurier'], policyTypes: ['habitation', 'mrh'] },
      { triggers: ['telephone', 'smartphone', 'portable', 'mobile', 'écran cassé', 'ecran casse'], policyTypes: ['habitation', 'mrh', 'appareils mobiles'] },
      { triggers: ['perte', 'perdu'],                              policyTypes: ['habitation', 'mrh'] },
    ];

    const match = TYPE_MAP.find(entry =>
      entry.triggers.some(trigger => sinisterNorm.includes(normalize(trigger))),
    );
    const relevantTypes = match?.policyTypes || [];

    // Si aucun type reconnu, tenter un match large sur le nom/type de la police
    if (relevantTypes.length === 0) return [];

    return policies.filter((p) =>
      relevantTypes.some((t) =>
        normalize(p.type || '').includes(normalize(t)) ||
        normalize(p.name || '').includes(normalize(t)) ||
        normalize(p.insurer || '').includes(normalize(t)),
      ),
    );
  }

  /** Retourne une procédure générique si l'IA est indisponible */
  private genericSteps(sinisterType: string): ClaimsStep[] {
    return [
      {
        step: 1,
        title: 'Sécuriser les personnes',
        description: 'Assurer la sécurité de toutes les personnes présentes. Appeler le 15/17/18 si urgence.',
        deadline: 'Immédiat',
      },
      {
        step: 2,
        title: 'Conserver les preuves',
        description: 'Photographier les dommages, conserver les factures d\'achat et tout document utile.',
        deadline: 'Dans les 24h',
      },
      {
        step: 3,
        title: 'Déclarer à votre assureur',
        description: `Contacter votre assureur pour déclarer le sinistre "${sinisterType}". La déclaration doit être faite par lettre recommandée ou via l'espace client en ligne.`,
        deadline: '5 jours ouvrés (2 jours pour un vol)',
      },
      {
        step: 4,
        title: 'Remplir la déclaration',
        description: 'Décrire les circonstances, la date, les dommages estimés et joindre les justificatifs.',
        deadline: 'Dans les délais indiqués par votre assureur',
      },
      {
        step: 5,
        title: 'Attendre l\'expertise',
        description: 'Un expert peut être mandaté par votre assureur pour évaluer les dommages.',
        deadline: 'Variable selon l\'assureur',
      },
    ];
  }

  /**
   * Cherche dans coverage_facts les lignes pertinentes pour un type de sinistre
   * donné et les policies couvrantes (via centralCgId).
   * Retourne un bloc texte prêt à être injecté dans le prompt Gemini.
   */
  private async fetchGuaranteeFacts(
    sinisterType: string,
    coveringPolicies: Policy[],
  ): Promise<string> {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
    const sin = normalize(sinisterType);

    // Mots-clés SQL à chercher dans guarantee_key / guarantee_label
    const KEYWORD_MAP: Array<{ triggers: string[]; keywords: string[] }> = [
      { triggers: ['bris de glace', 'bris glace', 'bris', 'vitrage', 'pare-brise'],
        keywords: ['bris', 'glace', 'vitrage', 'pare_brise', 'vitre'] },
      { triggers: ['accident', 'collision', 'accrochage'],
        keywords: ['responsabilite', 'dommages', 'collision', 'accident'] },
      { triggers: ['vol voiture', 'vol auto', 'vehicule vole'],
        keywords: ['vol', 'vehicule', 'accessoires'] },
      { triggers: ['inondation', 'degat des eaux', 'dégât des eaux'],
        keywords: ['inondation', 'dégâts des eaux', 'eau', 'catastrophe'] },
      { triggers: ['incendie', 'feu'],
        keywords: ['incendie', 'feu', 'explosion', 'catastrophe'] },
      { triggers: ['vol', 'cambriolage', 'effraction'],
        keywords: ['vol', 'effraction', 'cambriolage', 'vandalisme'] },
      { triggers: ['telephone', 'smartphone', 'mobile', 'portable', 'écran'],
        keywords: ['mobile', 'telephone', 'appareil', 'ecran', 'casse'] },
    ];

    const match = KEYWORD_MAP.find(e =>
      e.triggers.some(t => sin.includes(normalize(t))),
    );
    const kws = match?.keywords ?? [];
    if (kws.length === 0) return '';

    // Pour chaque policy couvrant avec centralCgId, chercher les faits
    const lines: string[] = [];
    for (const p of coveringPolicies) {
      const cgId = (p as any).centralCgId;
      if (!cgId) continue;

      const formulaRaw = (p.coverageDetail || '').trim();
      const formulaKey = formulaRaw
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');

      // Filtre sur les keywords + la formule (si connue)
      const kwConditions = kws.map((_, i) => `(guarantee_key ILIKE $${i + 3} OR guarantee_label ILIKE $${i + 3})`).join(' OR ');
      const params: any[] = [cgId, formulaKey || '%', ...kws.map(k => `%${k}%`)];

      const res = await dbQuery(
        `SELECT guarantee_label, formula_label, coverage_status, coverage_amount, franchise, coverage_notes
         FROM coverage_facts
         WHERE central_cg_id = $1
           AND (formula_key ILIKE $2 OR formula_key IS NULL OR $2 = '%')
           AND (${kwConditions})
         ORDER BY coverage_status, guarantee_label
         LIMIT 10`,
        params,
      ).catch(() => ({ rows: [] as any[] }));

      if (res.rows.length === 0) continue;

      lines.push(`\n  Contrat : ${p.name} (${p.provider}) — Formule : ${formulaRaw || 'N/A'}`);
      for (const r of res.rows) {
        const status = r.coverage_status === 'included' ? '✅' :
                       r.coverage_status === 'optional'  ? '⚡' :
                       r.coverage_status === 'excluded'  ? '❌' : '❓';
        let detail = `${status} ${r.guarantee_label}`;
        if (r.coverage_amount) detail += ` — Plafond : ${r.coverage_amount}`;
        if (r.franchise)        detail += ` — Franchise : ${r.franchise}`;
        if (r.coverage_notes)   detail += ` (${r.coverage_notes})`;
        lines.push(`    ${detail}`);
      }
    }

    return lines.length > 0
      ? `\nDÉTAILS DE GARANTIES EXTRAITS DES CONTRATS :\n${lines.join('\n')}\n`
      : '';
  }

  async guide(input: ClaimsInput): Promise<ClaimsResult> {
    const { sinisterType, policies, userId, sessionId } = input;

    const coveringPolicies = this.identifyCoveringPolicies(sinisterType, policies);

    // ── Résolution des faits de garanties (franchise, plafond) ──────────────
    const guaranteeFacts = await this.fetchGuaranteeFacts(sinisterType, coveringPolicies);

    const ai = getAiClient();
    let steps: ClaimsStep[] = this.genericSteps(sinisterType);
    let urgencyLevel: 'low' | 'medium' | 'high' = 'medium';

    if (ai) {
      const hasCoverage = coveringPolicies.length > 0;
      const policyContext = hasCoverage
        ? coveringPolicies.map((p) => `- ${p.name} chez ${p.provider} (formule: ${p.coverageDetail || '?'})`).join('\n')
        : '';

      // Prompt court et pratique quand aucun contrat ne couvre le sinistre
      const prompt = hasCoverage
        ? `Tu es un expert sinistres. L'utilisateur a subi un sinistre de type : "${sinisterType}".

CONTRATS COUVRANT CE SINISTRE :
${policyContext}
${guaranteeFacts}
Génère une procédure de déclaration étape par étape, précise et TRÈS personnalisée.
Si des détails de garanties sont fournis ci-dessus (franchise, plafond, statut), mentionne-les EXPLICITEMENT dans les étapes concernées — notamment dans l'étape de déclaration et l'étape de réparation/indemnisation.
Inclus les délais légaux français (code des assurances).
Urgence = high si risque pour personnes, medium si dommages matériels importants, low sinon.

Réponds UNIQUEMENT en JSON :
{
  "urgencyLevel": "low" | "medium" | "high",
  "steps": [
    {
      "step": 1,
      "title": "Titre",
      "description": "Description détaillée",
      "deadline": "Délai ou null",
      "contact": "Numéro ou email si connu ou null"
    }
  ]
}`
        : `Tu es un expert sinistres. Sinistre signalé : "${sinisterType}". Aucun contrat ne couvre ce sinistre.

Génère EXACTEMENT 2 étapes courtes et pratiques :
1. Actions immédiates concrètes à faire maintenant (ex: bloquer la SIM, changer les serrures, signaler la perte...)
2. Vérifier les contrats potentiellement pertinents non encore identifiés (assurance habitation, carte bancaire, assurance voyage)

Sois court et direct. Pas de généralités. Pas de références légales détaillées.
Urgence = low.

Réponds UNIQUEMENT en JSON :
{
  "urgencyLevel": "low",
  "steps": [
    {
      "step": 1,
      "title": "Titre court",
      "description": "Description courte et pratique (2 phrases max)",
      "deadline": null,
      "contact": null
    }
  ]
}`;

      try {
        const model = ai.getGenerativeModel(
          { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
          'claimsAgent',
        );
        const result = await model.generateContent([prompt]);
        const parsed = JSON.parse(result.response.text());
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          // Nettoyer les valeurs "null" (string) retournées par Gemini
          steps = parsed.steps.map((s: any) => ({
            ...s,
            deadline: (s.deadline && s.deadline !== 'null') ? s.deadline : undefined,
            contact:  (s.contact  && s.contact  !== 'null') ? s.contact  : undefined,
          }));
        }
        urgencyLevel = parsed.urgencyLevel || 'medium';
      } catch (e: any) {
        console.warn('[ClaimsAgent] Fallback sur procédure générique:', e.message);
      }
    }

    // ── Persister la session sinistre (claim_sessions) ───────────────────────
    let resolvedSessionId = sessionId;
    try {
      if (!resolvedSessionId) {
        const res = await dbQuery(
          `INSERT INTO claim_sessions (user_id, claim_type, status, created_at, updated_at)
           VALUES ($1, $2, 'open', NOW(), NOW()) RETURNING id`,
          [userId, sinisterType],
        );
        resolvedSessionId = String(res.rows[0]?.id);
      }

      await dbQuery(
        `INSERT INTO claim_sessions_messages (session_id, role, content, created_at)
         VALUES ($1, 'assistant', $2, NOW())`,
        [resolvedSessionId, JSON.stringify({ steps, urgencyLevel })],
      );
    } catch (e: any) {
      console.warn('[ClaimsAgent] Impossible de persister la session:', e.message);
    }

    return {
      sinisterType,
      coveringPolicies: coveringPolicies.map((p) => p.name),
      steps,
      urgencyLevel,
      sessionId: resolvedSessionId,
    };
  }
}

export const claimsAgent = new ClaimsAgent();
