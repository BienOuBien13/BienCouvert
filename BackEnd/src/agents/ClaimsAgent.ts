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
      // Perte de clés : peut concerner l'habitation OU le véhicule
      { triggers: ['cle perdue', 'clé perdue', 'serrure', 'serrurier', 'perte cle', 'perte de cle'], policyTypes: ['habitation', 'mrh', 'automobile', 'auto'] },
      { triggers: ['telephone', 'smartphone', 'portable', 'mobile', 'écran cassé', 'ecran casse'], policyTypes: ['habitation', 'mrh', 'appareils mobiles'] },
      { triggers: ['perte', 'perdu'],                              policyTypes: ['habitation', 'mrh', 'automobile', 'auto'] },
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
  /**
   * Construit des étapes sinistre directement depuis les coverage_facts (zéro LLM).
   * Retourne null si les faits sont insuffisants pour une réponse exploitable.
   */
  private buildStepsFromFacts(
    sinisterType: string,
    coveringPolicies: Policy[],
    factsRows: Array<{ policyName: string; provider: string; guarantee_label: string; coverage_status: string; coverage_amount: string | null; franchise: string | null; coverage_notes: string | null }>,
  ): ClaimsStep[] | null {
    if (factsRows.length === 0) return null;

    // Résoudre le délai légal selon le type
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
    const sin = normalize(sinisterType);
    const legalDelay =
      sin.includes('vol')      ? '2 jours ouvrés (vol)' :
      sin.includes('bris')     ? '5 jours ouvrés' :
      sin.includes('accident') ? '5 jours ouvrés' :
      sin.includes('inondation') || sin.includes('catnat') ? '10 jours après arrêté de catastrophe naturelle' :
      '5 jours ouvrés';

    const isLow = sin.includes('bris') || sin.includes('vitrage');

    // Déduplication des garanties : supprime les libellés quasi-identiques
    // (ex: "Bris d'élément vitré" / "Le bris d'élément vitré" / "• bris d'éléments vitrés")
    const normLabel = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
       .replace(/^[•\-*\s]+/, '')   // bullet de tête
       .trim();
    const stem = (w: string) =>
      w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w;
    const keywordsOf = (s: string): Set<string> =>
      new Set(normLabel(s).split(/[\s'',._-]+/).filter(w => w.length > 3).map(stem));
    const isSemDuplicate = (a: string, b: string): boolean => {
      const ka = keywordsOf(a); const kb = keywordsOf(b);
      const smaller = ka.size <= kb.size ? ka : kb;
      const larger  = ka.size <= kb.size ? kb : ka;
      if (smaller.size === 0) return false;
      const overlap = [...smaller].filter(w => larger.has(w)).length;
      return overlap / smaller.size >= 0.6;
    };

    const allGuaranteed = factsRows.filter(r => r.coverage_status === 'included' || r.coverage_status === 'optional');
    const excluded       = factsRows.filter(r => r.coverage_status === 'excluded');

    // Conserver la ligne la plus informative parmi les doublons sémantiques
    const guaranteed: typeof allGuaranteed = [];
    for (const r of allGuaranteed) {
      const dupIdx = guaranteed.findIndex(e => isSemDuplicate(e.guarantee_label, r.guarantee_label));
      if (dupIdx === -1) {
        guaranteed.push(r);
      } else {
        // Remplacer si la nouvelle ligne contient plus d'informations
        const existing = guaranteed[dupIdx];
        const newScore = (r.coverage_amount ? 2 : 0) + (r.franchise ? 1 : 0) + (r.coverage_notes ? 1 : 0);
        const oldScore = (existing.coverage_amount ? 2 : 0) + (existing.franchise ? 1 : 0) + (existing.coverage_notes ? 1 : 0);
        if (newScore > oldScore) guaranteed[dupIdx] = r;
      }
    }

    const factsSummary = guaranteed.map(r => {
      let line = `${r.policyName} → ${r.guarantee_label}`;
      if (r.coverage_amount) line += ` — plafond : ${r.coverage_amount}`;
      if (r.franchise)        line += `\n   Franchise : ${r.franchise}`;
      if (r.coverage_notes)   line += `\n   ${r.coverage_notes}`;
      return line;
    }).join('\n');

    const exclusionsSummary = excluded.length > 0
      ? excluded.map(r => `${r.policyName} : ${r.guarantee_label} non couvert`).join(', ')
      : '';

    const insurerNames = [...new Set(coveringPolicies.map(p => p.provider))].join(', ');
    // Afficher uniquement le nom du contrat (sans la formule en parenthèses)
    const policyNames  = coveringPolicies.map(p => p.name).join(', ');
    const contactLine  = `Votre espace client ${insurerNames}, par téléphone ou via l'application mobile`;

    // Résumé des conditions financières pour l'étape 3
    const bestFact = guaranteed.find(r => r.coverage_amount || r.franchise);
    const noFranchise = guaranteed.some(
      r => r.franchise === '0' || r.franchise?.includes('0 €') ||
           r.franchise?.toLowerCase().includes('sans franchise') ||
           r.coverage_notes?.toLowerCase().includes('sans franchise') ||
           r.coverage_notes?.toLowerCase().includes('pas de franchise'),
    );
    let step3Extra = '';
    if (noFranchise) step3Extra = 'Aucune franchise n\'est appliquée en cas de réparation sans remplacement.';
    else if (bestFact?.franchise) step3Extra = `Franchise applicable : ${bestFact.franchise}.`;

    const steps: ClaimsStep[] = [
      {
        step: 1,
        title: 'Documenter le sinistre',
        description: `Prenez des photos claires des dommages sous plusieurs angles. Notez la date, l'heure et les circonstances exactes. ${isLow ? 'Si le vitrage est cassé, protégez temporairement l\'ouverture (adhésif résistant, bâche).' : 'Assurez-vous que personne n\'est en danger et appelez les secours si nécessaire.'}`,
        deadline: 'Immédiat',
      },
      {
        step: 2,
        title: `Déclarer à ${insurerNames}`,
        description: `Déclarez le sinistre auprès de ${insurerNames} dans les délais légaux. Contrat concerné : ${policyNames}.${exclusionsSummary ? `\n\n❌ Exclusions : ${exclusionsSummary}` : ''}`,
        deadline: legalDelay,
        contact: contactLine,
      },
      {
        step: 3,
        title: 'Réparation et indemnisation',
        description: `Après déclaration, ${insurerNames} vous orientera vers un réparateur agréé ou un prestataire de son réseau.${step3Extra ? ` ${step3Extra}` : ''}`,
        deadline: 'Selon délais assureur',
        contact: contactLine,
      },
    ];

    return steps;
  }

  /**
   * Récupère les facts structurées ET les URLs des CG pour les contrats couvrants.
   */
  private async fetchGuaranteeFactsStructured(
    sinisterType: string,
    coveringPolicies: Policy[],
  ): Promise<{
    textBlock: string;
    rows: Array<{ policyName: string; provider: string; guarantee_label: string; coverage_status: string; coverage_amount: string | null; franchise: string | null; coverage_notes: string | null }>;
    cgUrls: Array<{ policyName: string; url: string }>;
  }> {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
    const sin = normalize(sinisterType);

    const KEYWORD_MAP: Array<{ triggers: string[]; keywords: string[] }> = [
      { triggers: ['bris de glace', 'bris glace', 'bris', 'vitrage', 'pare-brise'],
        keywords: ['bris', 'glace', 'vitrage', 'pare_brise', 'vitre'] },
      { triggers: ['accident', 'collision', 'accrochage'],
        keywords: ['responsabilite', 'dommages', 'collision', 'accident'] },
      { triggers: ['vol voiture', 'vol auto', 'vehicule vole'],
        keywords: ['vol', 'vehicule', 'accessoires'] },
      { triggers: ['inondation', 'degat des eaux', 'dégât des eaux'],
        keywords: ['inondation', 'degats des eaux', 'eau', 'catastrophe'] },
      { triggers: ['incendie', 'feu'],
        keywords: ['incendie', 'feu', 'explosion', 'catastrophe'] },
      { triggers: ['vol', 'cambriolage', 'effraction'],
        keywords: ['vol', 'effraction', 'cambriolage', 'vandalisme'] },
      { triggers: ['telephone', 'smartphone', 'mobile', 'portable', 'ecran'],
        keywords: ['mobile', 'telephone', 'appareil', 'ecran', 'casse'] },
      { triggers: ['cle perdue', 'cles perdues', 'perte cle', 'serrure', 'serrurier', 'cle'],
        keywords: ['cle', 'serrure', 'serrurier', 'effraction', 'remplacement'] },
    ];

    const match = KEYWORD_MAP.find(e => e.triggers.some(t => sin.includes(normalize(t))));
    const kws = match?.keywords ?? [];

    const allRows: Array<{ policyName: string; provider: string; guarantee_label: string; coverage_status: string; coverage_amount: string | null; franchise: string | null; coverage_notes: string | null }> = [];
    const cgUrls: Array<{ policyName: string; url: string }> = [];
    const textLines: string[] = [];

    // Paralléliser toutes les requêtes DB (une par contrat)
    type PolicyResult = {
      cgUrl: string | null;
      factRows: Array<{ guarantee_label: string; formula_label: string; coverage_status: string; coverage_amount: string | null; franchise: string | null; coverage_notes: string | null }>;
      policyName: string;
      provider: string;
      formulaRaw: string;
    };

    const policyResults = await Promise.all(
      coveringPolicies.map(async (p): Promise<PolicyResult> => {
        const cgId = (p as any).centralCgId;
        const formulaRaw = (p.coverageDetail || '').trim();

        let cgUrl: string | null = null;
        let factRows: PolicyResult['factRows'] = [];

        if (cgId) {
          const formulaKey = formulaRaw
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');

          const queries: Array<Promise<any>> = [
            dbQuery(`SELECT url FROM central_cg WHERE id = $1`, [cgId])
              .catch(() => ({ rows: [] as any[] })),
          ];

          if (kws.length > 0) {
            const kwConditions = kws
              .map((_, i) => `(guarantee_key ILIKE $${i + 3} OR guarantee_label ILIKE $${i + 3})`)
              .join(' OR ');
            const params: any[] = [cgId, formulaKey || '%', ...kws.map(k => `%${k}%`)];
            queries.push(
              dbQuery(
                `SELECT guarantee_label, formula_label, coverage_status, coverage_amount, franchise, coverage_notes
                 FROM coverage_facts
                 WHERE central_cg_id = $1
                   AND (formula_key ILIKE $2 OR formula_key IS NULL OR $2 = '%')
                   AND (${kwConditions})
                 ORDER BY coverage_status, guarantee_label
                 LIMIT 10`,
                params,
              ).catch(() => ({ rows: [] as any[] })),
            );
          }

          const [urlRes, factsRes] = await Promise.all(queries);
          cgUrl = urlRes.rows[0]?.url ?? null;
          factRows = factsRes?.rows ?? [];
        }

        return { cgUrl, factRows, policyName: p.name, provider: p.provider, formulaRaw };
      }),
    );

    for (const { cgUrl, factRows, policyName, provider, formulaRaw } of policyResults) {
      if (cgUrl) cgUrls.push({ policyName, url: cgUrl });
      if (factRows.length === 0) continue;

      textLines.push(`\n  Contrat : ${policyName} (${provider}) — Formule : ${formulaRaw || 'N/A'}`);
      for (const r of factRows) {
        const status = r.coverage_status === 'included' ? '✅' :
                       r.coverage_status === 'optional'  ? '⚡' :
                       r.coverage_status === 'excluded'  ? '❌' : '❓';
        let detail = `${status} ${r.guarantee_label}`;
        if (r.coverage_amount) detail += ` — Plafond : ${r.coverage_amount}`;
        if (r.franchise)        detail += ` — Franchise : ${r.franchise}`;
        if (r.coverage_notes)   detail += ` (${r.coverage_notes})`;
        textLines.push(`    ${detail}`);
        allRows.push({ policyName, provider, ...r });
      }
    }

    return {
      textBlock: textLines.length > 0 ? `\nDÉTAILS DE GARANTIES EXTRAITS DES CONTRATS :\n${textLines.join('\n')}\n` : '',
      rows: allRows,
      cgUrls,
    };
  }

  async guide(input: ClaimsInput): Promise<ClaimsResult> {
    const { sinisterType, policies, userId, sessionId, targetPolicyId, originalMessage } = input;

    let coveringPolicies = this.identifyCoveringPolicies(sinisterType, policies);

    // ── Affinage par contexte : si le message mentionne un véhicule, prioriser l'auto ──
    if (originalMessage && coveringPolicies.length > 1) {
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const msgNorm = normalize(originalMessage);
      const vehicleKeywords = ['voiture', 'vehicule', 'auto', 'voitur', 'moto', 'camion', 'scooter'];
      const mentionsVehicle = vehicleKeywords.some(k => msgNorm.includes(k));
      // Détecter si un nom de contrat auto apparaît dans le message
      const autoByPolicyName = coveringPolicies.filter(p => {
        const nameNorm = normalize(p.name);
        return msgNorm.includes(nameNorm) &&
          (normalize(p.type || '').includes('auto') || normalize(p.type || '').includes('vehicule'));
      });
      if (autoByPolicyName.length > 0) {
        coveringPolicies = autoByPolicyName;
      } else if (mentionsVehicle) {
        const autoOnly = coveringPolicies.filter(p => {
          const typeNorm = normalize(p.type || '');
          return typeNorm.includes('auto') || typeNorm.includes('vehicule') || typeNorm.includes('moto');
        });
        if (autoOnly.length > 0) coveringPolicies = autoOnly;
      }
    }

    // ── Filtrer sur le contrat ciblé si l'utilisateur a précisé ─────────────
    if (targetPolicyId) {
      const targeted = coveringPolicies.find(p => String(p.id) === String(targetPolicyId));
      if (targeted) coveringPolicies = [targeted];
    }

    // ── Désambiguïsation : plusieurs contrats du même type → demander lequel ─
    // On ne désambiguïse que si aucun targetPolicyId n'a été fourni
    if (!targetPolicyId && coveringPolicies.length > 1) {
      const policyList = coveringPolicies
        .map(p => `• ${p.name} (${p.provider}${p.coverageDetail ? ` — ${p.coverageDetail}` : ''})`)
        .join('\n');
      return {
        sinisterType,
        coveringPolicies: coveringPolicies.map(p => p.name),
        steps: [],
        urgencyLevel: 'low',
        needsClarification: `Plusieurs contrats peuvent couvrir ce sinistre :\n${policyList}\n\nPour quel contrat souhaitez-vous la procédure ?`,
      };
    }

    // ── Récupération des faits de garanties + URLs CG ───────────────────────
    const { textBlock: guaranteeFacts, rows: factRows, cgUrls } =
      await this.fetchGuaranteeFactsStructured(sinisterType, coveringPolicies);

    // ── Chemin rapide : steps générés depuis coverage_facts (sans LLM) ───────
    const fastSteps = this.buildStepsFromFacts(sinisterType, coveringPolicies, factRows);
    if (fastSteps) {
      console.log(`[ClaimsAgent] Réponse depuis coverage_facts (zéro LLM)`);
      // Préparer les détails de garanties à afficher AVANT les étapes
      const included = factRows.filter(r => r.coverage_status === 'included' || r.coverage_status === 'optional');
      const coverageDetails = included.map(r => ({
        policyName: r.policyName,
        guarantee_label: r.guarantee_label,
        coverage_status: r.coverage_status,
        coverage_amount: r.coverage_amount,
        franchise: r.franchise,
      }));
      return {
        sinisterType,
        coveringPolicies: coveringPolicies.map(p => p.name),
        steps: fastSteps,
        urgencyLevel: 'low',
        cgUrls,
        sessionId,
        coverageDetails: coverageDetails.length > 0 ? coverageDetails : undefined,
      };
    }

    // ── Fallback LLM (pas de coverage_facts disponibles) ────────────────────
    const ai = getAiClient();
    let steps: ClaimsStep[] = this.genericSteps(sinisterType);
    let urgencyLevel: 'low' | 'medium' | 'high' = 'medium';

    if (ai) {
      const hasCoverage = coveringPolicies.length > 0;
      const policyContext = hasCoverage
        ? coveringPolicies.map((p) => {
            let line = `- ${p.name} chez ${p.provider} (formule: ${p.coverageDetail || '?'})`;
            const opts = p.options?.filter(Boolean);
            if (opts && opts.length > 0) line += ` — options: ${opts.join(', ')}`;
            return line;
          }).join('\n')
        : '';

      const prompt = hasCoverage
        ? `Tu es un expert sinistres. L'utilisateur a subi un sinistre de type : "${sinisterType}".

CONTRATS COUVRANT CE SINISTRE :
${policyContext}
${guaranteeFacts}
Génère une procédure de déclaration en 3 étapes MAXIMUM, courtes et pratiques.
Chaque étape = 1-2 phrases maximum. Pas d'introduction, pas de rappel des garanties (elles sont déjà affichées).
Inclus les délais légaux français (code des assurances) dans le champ deadline.
Urgence = high si risque pour personnes, medium si dommages matériels importants, low sinon.

Réponds UNIQUEMENT en JSON :
{
  "urgencyLevel": "low" | "medium" | "high",
  "steps": [
    { "step": 1, "title": "Titre court", "description": "1-2 phrases max", "deadline": "Délai ou null", "contact": "Contact ou null" }
  ]
}`
        : `Tu es un expert sinistres. Sinistre signalé : "${sinisterType}". Aucun contrat ne couvre ce sinistre.

Génère EXACTEMENT 2 étapes courtes et pratiques.
Urgence = low.

Réponds UNIQUEMENT en JSON :
{
  "urgencyLevel": "low",
  "steps": [
    { "step": 1, "title": "Titre court", "description": "2 phrases max", "deadline": null, "contact": null }
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

    // ── Persister la session sinistre ────────────────────────────────────────
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
      cgUrls,
      sessionId: resolvedSessionId,
    };
  }
}

export const claimsAgent = new ClaimsAgent();
