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
 * Utilise to_tsquery + ILIKE sur content_text des pages vectorisées.
 */
async function textSearchCentralCg(queryText: string, insurers: string[] | undefined, limit: number): Promise<RAGChunk[]> {
  // Découper la query en mots-clés pertinents (enlever mots vides courts)
  const keywords = queryText
    .toLowerCase()
    .replace(/[^a-zàâäéèêëîïôùûüç\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 6);

  if (keywords.length === 0) return [];

  const params: any[] = [`%${keywords.join('%')}%`]; // ILIKE simplifié
  let sql = `
    SELECT
      cg.insurer_code,
      cg.insurance_type_code,
      cg.metadata->>'productName' as product_name,
      p.content_text,
      p.chunk_type,
      p.page_number,
      COALESCE(i.label, cg.insurer_code) as insurer_label,
      0.5 as similarity
    FROM central_cg_pages p
    JOIN central_cg cg ON p.central_cg_id = cg.id
    LEFT JOIN insurers i ON cg.insurer_code = i.code
    WHERE cg.status = 'active'
      AND p.content_text ILIKE $1
  `;
  if (insurers && insurers.length > 0) {
    params.push(insurers);
    sql += ` AND cg.insurer_code = ANY($${params.length})`;
  }
  sql += ` ORDER BY p.page_number LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const result = await query(sql, params);
    return result.rows.map((row: any) => ({
      content: row.content_text || '',
      source: `${row.insurer_label || row.insurer_code} p.${row.page_number ?? '?'}`,
      similarity: 0.5,
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
          console.warn('[RAGAgent] searchPolicyEmbeddings error:', e.message);
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
