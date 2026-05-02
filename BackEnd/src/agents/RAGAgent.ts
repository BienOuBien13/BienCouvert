// =============================================================================
// RAGAgent — Moteur de recherche sémantique
// Responsabilité unique : retrouver les chunks de documents pertinents
// depuis pgvector (ou full-text si embedding indisponible) et les retourner.
// =============================================================================

import { cacheGet, cacheSet, makeCacheKey } from '../services/cacheService';
import { generateEmbedding } from '../services/geminiService';
import { storage } from '../storage';
import { query } from '../db';
import { RAGInput, RAGChunk, RAGResult } from './types';

const SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_LIMIT = 5;

/**
 * Recherche full-text PostgreSQL (fallback quand embedding indisponible).
 * Utilise plusieurs ILIKE indexés via gin_trgm_ops (migration 023) sur content_text
 * des pages vectorisées. Chaque mot-clé contribue à un score de pertinence.
 */
async function textSearchCentralCg(queryText: string, insurers: string[] | undefined, limit: number): Promise<RAGChunk[]> {
  // Découper la query en mots-clés pertinents (enlever mots vides courts)
  const keywords = queryText
    .toLowerCase()
    .replace(/[^a-zàâäéèêëîïôùûüç\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  // Construction d'une requête multi-ILIKE : chaque mot-clé est un filtre (AND).
  // L'index trigram (idx_central_cg_pages_content_trgm) accélère chaque ILIKE.
  // Score = somme des matches (mot le plus précis remonte en premier).
  const params: any[] = [];
  const ilikeConditions = keywords.map(kw => {
    params.push(`%${kw}%`);
    return `p.content_text ILIKE $${params.length}`;
  });

  // Score : combien de keywords matchent (utile pour ranker quand on a beaucoup de mots)
  const scoreExpr = keywords.map((_, i) => `(p.content_text ILIKE $${i + 1})::int`).join(' + ');

  let sql = `
    SELECT
      cg.insurer_code,
      cg.insurance_type_code,
      cg.metadata->>'productName' as product_name,
      p.content_text,
      p.chunk_type,
      p.page_number,
      COALESCE(i.label, cg.insurer_code) as insurer_label,
      (${scoreExpr})::float / ${keywords.length} as similarity
    FROM central_cg_pages p
    JOIN central_cg cg ON p.central_cg_id = cg.id
    LEFT JOIN insurers i ON cg.insurer_code = i.code
    WHERE cg.status = 'active'
      AND (${ilikeConditions.join(' OR ')})
  `;
  if (insurers && insurers.length > 0) {
    params.push(insurers);
    sql += ` AND cg.insurer_code = ANY($${params.length})`;
  }
  // Tri par pertinence décroissante puis page (résultats déterministes)
  sql += ` ORDER BY similarity DESC, p.page_number ASC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const result = await query(sql, params);
    return result.rows.map((row: any) => ({
      content: row.content_text || '',
      source: `${row.insurer_label || row.insurer_code} p.${row.page_number ?? '?'}`,
      similarity: typeof row.similarity === 'number' ? row.similarity : 0.5,
      chunkType: row.chunk_type,
      pageNumber: row.page_number,
    }));
  } catch (e: any) {
    console.warn('[RAGAgent] textSearch error:', e.message);
    return [];
  }
}

export class RAGAgent {
  readonly name = 'RAGAgent';

  /**
   * Recherche sémantique (ou full-text en fallback) dans les polices et CG admin.
   * Utilise le cache Redis pour les questions déjà posées.
   */
  async search(input: RAGInput): Promise<RAGResult> {
    const { query: userQuery, userId, policyIds = [], insurers = [], limit = DEFAULT_LIMIT } = input;

    // ── Cache Redis ──────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey('rag', String(userId), userQuery, policyIds.sort().join(','));
    const cached = await cacheGet<RAGResult>(cacheKey);
    if (cached) {
      console.log(`[RAGAgent] Cache hit — userId=${userId}`);
      return { ...cached, fromCache: true };
    }

    // ── Embedding de la question ─────────────────────────────────────────────
    let questionEmbedding: number[] | null = null;
    try {
      questionEmbedding = await generateEmbedding(userQuery);
    } catch (e: any) {
      console.warn('[RAGAgent] Embedding indisponible:', e.message);
    }

    const policyChunks: RAGChunk[] = [];
    const cgChunks: RAGChunk[] = [];

    if (questionEmbedding) {
      // ── Recherche vectorielle : polices utilisateur ────────────────────────
      if (policyIds.length > 0) {
        try {
          const policyNums = policyIds
            .map((id) => parseInt(id, 10))
            .filter((n) => !isNaN(n));

          const rows = await storage.searchPolicyEmbeddings(
            questionEmbedding,
            policyNums,
            limit,
          );

          for (const row of rows) {
            if (row.similarity >= SIMILARITY_THRESHOLD) {
              policyChunks.push({
                content: row.chunk_text,
                source: `Police #${row.policy_id}`,
                similarity: row.similarity,
                chunkType: row.chunk_type,
                pageNumber: row.page_number,
              });
            }
          }
        } catch (e: any) {
          // relation "policy_embeddings" does not exist → table not yet created, skip silently
          if (!e.message?.includes('does not exist')) {
            console.warn('[RAGAgent] searchPolicyEmbeddings error:', e.message);
          }
        }
      }

      // ── Recherche vectorielle : CG Admin ────────────────────────────────────
      try {
        const cgRows = await storage.searchCentralCg(
          questionEmbedding,
          insurers.length > 0 ? insurers : undefined,
          limit,
        );

        for (const row of cgRows) {
          if (row.similarity >= SIMILARITY_THRESHOLD) {
            cgChunks.push({
              content: row.content_text || '',
              source: `${row.insurer_label || row.insurer_code} — ${row.product_name || ''} p.${row.page_number ?? '?'}`,
              similarity: row.similarity,
              chunkType: row.chunk_type,
              pageNumber: row.page_number,
              formulaKey: row.formula_key,
            });
          }
        }
      } catch (e: any) {
        console.warn('[RAGAgent] searchCentralCg error:', e.message);
      }

      // Si la recherche vectorielle ne retourne rien (embeddings en DB encore NULL ou pas encore re-vectorisés),
      // on déclenche quand même le fallback full-text pour garantir un contexte à l'assistant.
      if (cgChunks.length === 0) {
        console.log('[RAGAgent] 0 chunks vectoriels CG → fallback full-text ILIKE');
        const textChunks = await textSearchCentralCg(
          userQuery,
          insurers.length > 0 ? insurers : undefined,
          limit,
        );
        cgChunks.push(...textChunks);
      }
    } else {
      // ── Fallback full-text (embedding indisponible) ────────────────────────
      console.log('[RAGAgent] Embedding indisponible → fallback recherche full-text');
      const textChunks = await textSearchCentralCg(
        userQuery,
        insurers.length > 0 ? insurers : undefined,
        limit,
      );
      cgChunks.push(...textChunks);
    }

    const result: RAGResult = {
      policyChunks,
      cgChunks,
      totalChunks: policyChunks.length + cgChunks.length,
      fromCache: false,
    };

    // ── Mise en cache (TTL 30 min) ───────────────────────────────────────────
    await cacheSet(cacheKey, result);

    console.log(
      `[RAGAgent] ${result.totalChunks} chunks trouvés` +
      ` (${policyChunks.length} polices + ${cgChunks.length} CG)`,
    );
    return result;
  }
}

export const ragAgent = new RAGAgent();
