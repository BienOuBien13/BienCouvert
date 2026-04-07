// =============================================================================
// RAGAgent — Moteur de recherche sémantique
// Responsabilité unique : retrouver les chunks de documents pertinents
// depuis pgvector et les retourner avec scores de similarité.
// =============================================================================

import { cacheGet, cacheSet, makeCacheKey } from '../services/cacheService';
import { generateEmbedding } from '../services/geminiService';
import { storage } from '../storage';
import { RAGInput, RAGChunk, RAGResult } from './types';

const SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_LIMIT = 5;

export class RAGAgent {
  readonly name = 'RAGAgent';

  /**
   * Recherche sémantique dans les polices de l'utilisateur ET dans les CG admin.
   * Utilise le cache Redis pour les questions déjà posées.
   */
  async search(input: RAGInput): Promise<RAGResult> {
    const { query, userId, policyIds = [], insurers = [], limit = DEFAULT_LIMIT } = input;

    // ── Cache Redis ──────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey('rag', String(userId), query, policyIds.sort().join(','));
    const cached = await cacheGet<RAGResult>(cacheKey);
    if (cached) {
      console.log(`[RAGAgent] Cache hit — userId=${userId}`);
      return { ...cached, fromCache: true };
    }

    // ── Embedding de la question ─────────────────────────────────────────────
    let questionEmbedding: number[] | null = null;
    try {
      questionEmbedding = await generateEmbedding(query);
    } catch (e: any) {
      console.warn('[RAGAgent] Embedding indisponible:', e.message);
    }

    const policyChunks: RAGChunk[] = [];
    const cgChunks: RAGChunk[] = [];

    if (questionEmbedding) {
      // ── Polices utilisateur ────────────────────────────────────────────────
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

      // ── CG Admin ────────────────────────────────────────────────────────────
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
