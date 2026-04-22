// =============================================================================
// AnalysisAgent — Analyste de couverture
// Responsabilité : prendre les chunks RAG + profil utilisateur et produire
// une analyse structurée de couverture (couvert/partiel/non couvert).
// =============================================================================

import { getAiClient } from '../services/geminiService';
import { Policy } from '../types';
import {
  AnalysisInput,
  CoverageFact,
  CoverageAnalysisResult,
  CoverageStatus,
  RAGChunk,
} from './types';

/** Construit le contexte documentaire à injecter dans le prompt */
function buildDocContext(chunks: RAGChunk[], label: string): string {
  if (chunks.length === 0) return '';
  const lines = chunks
    .slice(0, 6)
    .map((c, i) => `[${label} ${i + 1}] (similarité: ${c.similarity.toFixed(2)}) ${c.source}\n${c.content}`)
    .join('\n\n');
  return `\n=== ${label} ===\n${lines}\n`;
}

/** Construit le contexte structuré depuis coverage_facts (source primaire) */
function buildFactsContext(facts: CoverageFact[]): string {
  if (facts.length === 0) return '';

  // Grouper par assureur + formule pour associer chaque URL à sa source
  const byGroup = new Map<string, { facts: CoverageFact[]; url?: string }>();
  for (const f of facts) {
    const key = `${f.insurer_label || ''} — ${f.formula_label || f.formula_key || 'Formule inconnue'}`;
    if (!byGroup.has(key)) byGroup.set(key, { facts: [], url: f.pdf_url ?? undefined });
    byGroup.get(key)!.facts.push(f);
  }

  let out = '\n=== GARANTIES STRUCTURÉES (source : conditions générales) ===\n';
  for (const [label, group] of byGroup) {
    out += `\nFormule "${label}"${group.url ? ` [URL:${group.url}]` : ''} :\n`;
    for (const f of group.facts) {
      const statusIcon = f.coverage_status === 'included' ? '✓'
        : f.coverage_status === 'excluded' ? '✗'
        : f.coverage_status === 'optional' ? '○' : '—';
      const amount = f.coverage_amount ? ` (${f.coverage_amount})` : '';
      const franchise = f.franchise ? ` [franchise: ${f.franchise}]` : '';
      out += `  ${statusIcon} ${f.guarantee_label}${amount}${franchise}\n`;
    }
  }
  return out;
}

/** Formate la liste des contrats de l'utilisateur */
function buildPolicySummary(policies: Policy[]): string {
  return policies
    .map(
      (p) =>
        `- "${p.name}" chez ${p.provider} — formule: ${p.coverageDetail || 'non précisée'}` +
        (p.summary ? ` — résumé: ${p.summary.slice(0, 200)}` : ''),
    )
    .join('\n');
}

export class AnalysisAgent {
  readonly name = 'AnalysisAgent';

  async analyze(input: AnalysisInput): Promise<CoverageAnalysisResult> {
    const { question, ragResult, policies, userProfile, coverageFacts = [], history = [] } = input;

    const ai = getAiClient();
    if (!ai) {
      return this.fallback(question);
    }

    // Source primaire : faits structurés (coverage_facts) — rapide et précis
    const factsContext = buildFactsContext(coverageFacts);
    // Source secondaire : chunks textuels RAG (détails supplémentaires)
    const docContext =
      buildDocContext(ragResult.cgChunks, 'Extraits CG') +
      buildDocContext(ragResult.policyChunks, 'Contrat utilisateur');

    const hasFacts = coverageFacts.length > 0;
    // Map URL par clé (assureur+formule) pour récupération post-LLM
    const urlByGroup = new Map<string, string>();
    for (const f of coverageFacts) {
      if (f.pdf_url) {
        const key = `${f.insurer_label || ''} — ${f.formula_label || f.formula_key || 'Formule inconnue'}`;
        if (!urlByGroup.has(key)) urlByGroup.set(key, f.pdf_url);
      }
    }
    // ── Chemin rapide : réponse directe depuis coverage_facts (zéro LLM) ─────
    // Si les faits structurés répondent sans ambiguïté → pas de Gemini (~700 ms économisés)
    if (hasFacts && coverageFacts.length > 0) {
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const qNorm = normalize(question);
      const stopWords = new Set([
        'votre', 'votr', 'avec', 'pour', 'dans', 'estce', 'etes', 'vous',
        'suisje', 'couvre', 'garantie', 'assurance', 'contrat', 'couverte',
        'couvert', 'couverts', 'inclus', 'incluse', 'exclus', 'exclue',
      ]);
      const qWords = qNorm.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

      if (qWords.length > 0) {
        const relevant = coverageFacts.filter(f => {
          const label = normalize(f.guarantee_label || '');
          const key   = (f.guarantee_key || '').toLowerCase();
          return qWords.some(w => label.includes(w) || key.includes(w));
        });

        if (relevant.length > 0) {
          const includedFacts = relevant.filter(f => f.coverage_status === 'included');
          const excludedFacts = relevant.filter(f => f.coverage_status === 'excluded');
          const allSameStatus = relevant.every(f => f.coverage_status === relevant[0].coverage_status);

          if (allSameStatus && (includedFacts.length > 0 || excludedFacts.length > 0)) {
            const status: CoverageStatus = includedFacts.length > 0 ? 'couvert' : 'non_couvert';
            const best = relevant[0];
            const amountHint = best.coverage_amount ? ` (jusqu'à ${best.coverage_amount})` : '';
            const summary = status === 'couvert'
              ? `✅ La garantie "${best.guarantee_label}" est incluse dans votre contrat${amountHint}.`
              : `❌ La garantie "${best.guarantee_label}" n'est pas couverte par votre contrat.`;
            const cgUrl = [...urlByGroup.values()][0] ?? undefined;
            console.log(
              `[AnalysisAgent] Réponse directe coverage_facts (zéro LLM) — ${relevant.length} faits, status=${status}`
            );
            return {
              status,
              summary: best.coverage_notes ? `${summary} ${best.coverage_notes}` : summary,
              garantie: best.guarantee_label,
              montantMax: best.coverage_amount ?? undefined,
              franchise: best.franchise ?? undefined,
              lacunes: excludedFacts.map(f => f.guarantee_label),
              sources: [best.insurer_label || policies[0]?.provider || ''].filter(Boolean),
              cgUrl,
              rawAnswer: '',
            };
          }
        }
      }
    }
    // ── Fin chemin rapide ─────────────────────────────────────────────────────

    const profileContext = userProfile
      ? `Profil: ${userProfile.adultsCount ?? 1} adulte(s), ${userProfile.childrenCount ?? 0} enfant(s), ` +
        `logement: ${userProfile.housingType ?? '?'}, statut: ${userProfile.housingStatus ?? '?'}`
      : '';

    // Contexte conversationnel (derniers échanges pour résoudre les questions de suivi)
    const historyContext = history.length > 0
      ? history
          .slice(-6)  // 3 derniers échanges
          .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text.slice(0, 400)}`)
          .join('\n')
      : '';

    const prompt = `Tu es un analyste expert en assurances. Réponds à cette question de manière RAPIDE et PRÉCISE.

${historyContext ? `HISTORIQUE RÉCENT DE LA CONVERSATION :\n${historyContext}\n\n` : ''}QUESTION ACTUELLE : ${question}

CONTRATS DE L'UTILISATEUR :
${buildPolicySummary(policies)}

${profileContext ? `PROFIL UTILISATEUR :\n${profileContext}\n` : ''}
${hasFacts ? factsContext : ''}
${!hasFacts || ragResult.totalChunks > 0 ? (docContext || '') : ''}
${!hasFacts && ragResult.totalChunks === 0 ? 'Aucun document trouvé dans la base.' : ''}

INSTRUCTIONS :
${hasFacts
  ? '- Les GARANTIES STRUCTURÉES sont la source principale et fiable. Base ta réponse dessus en priorité.'
  : '- Utilise les extraits disponibles pour répondre.'}
- Sois concis (3 phrases max pour le résumé)
- Si la garantie est "included" (✓) → status = "couvert"
- Si "excluded" (✗) → status = "non_couvert"
- Si mélange inclus/exclus selon formule → status = "partiel"
- Si aucune donnée → status = "inconnu"
- Si la réponse s'appuie sur une formule précise contenant [URL:...], inclus son URL dans cgUrl (sinon null)

Réponds UNIQUEMENT en JSON :
{
  "status": "couvert" | "partiel" | "non_couvert" | "inconnu",
  "summary": "Réponse concise (3 phrases max)",
  "garantie": "Nom de la garantie ou null",
  "montantMax": "Plafond ou null",
  "franchise": "Franchise ou null",
  "lacunes": ["lacune 1"],
  "sources": ["source 1"],
  "cgUrl": "https://... ou null"
}`;

    try {
      const model = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
        'analysisAgent',
      );
      const result = await model.generateContent([prompt]);
      const text = result.response.text();
      const parsed = JSON.parse(text);

      // Résoudre cgUrl : priorité à la sélection LLM, sinon chercher dans la map par sources citées
      let cgUrl: string | undefined = (parsed.cgUrl && parsed.cgUrl !== 'null') ? parsed.cgUrl : undefined;
      if (!cgUrl && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
        // Chercher une URL dans urlByGroup dont la clé contient une source citée
        for (const src of parsed.sources) {
          for (const [key, url] of urlByGroup) {
            if (key.toLowerCase().includes(src.toLowerCase().slice(0, 20))) { cgUrl = url; break; }
          }
          if (cgUrl) break;
        }
      }
      // Dernier recours : première URL disponible (si unique insurer)
      if (!cgUrl && urlByGroup.size === 1) cgUrl = [...urlByGroup.values()][0];

      return {
        status: (parsed.status as CoverageStatus) || 'inconnu',
        summary: parsed.summary || 'Analyse indisponible.',
        garantie: parsed.garantie || undefined,
        montantMax: parsed.montantMax || undefined,
        franchise: parsed.franchise || undefined,
        lacunes: Array.isArray(parsed.lacunes) ? parsed.lacunes : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        cgUrl,
        rawAnswer: text,
      };
    } catch (e: any) {
      console.error('[AnalysisAgent] Erreur LLM:', e.message);
      return this.fallback(question);
    }
  }

  private fallback(question: string): CoverageAnalysisResult {
    return {
      status: 'inconnu',
      summary: `Je n'ai pas pu analyser la couverture pour votre question. Vérifiez que vos contrats sont bien chargés.`,
      lacunes: [],
      sources: [],
    };
  }
}

export const analysisAgent = new AnalysisAgent();
