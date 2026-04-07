// =============================================================================
// IngestionAgent — Processeur de documents (async)
// Responsabilité unique : vectoriser un PDF (CG admin ou contrat utilisateur)
// et stocker les chunks + tableaux extraits en base.
// Mode asynchrone : ne bloque pas la requête HTTP principale.
// =============================================================================

import { vectorizeCgByPages } from '../services/pageVectorizationService';
import { storage } from '../storage';
import { query as dbQuery } from '../db';
import { IngestionInput, IngestionResult } from './types';

export class IngestionAgent {
  readonly name = 'IngestionAgent';

  /**
   * Lance la vectorisation d'un document CG (référentiel admin).
   * Appelé de façon asynchrone — ne pas await dans la requête HTTP.
   */
  async ingestCentralCg(input: IngestionInput): Promise<IngestionResult> {
    const { pdfUrl, pdfBase64, mimeType, centralCgId } = input;

    if (!centralCgId) {
      return { success: false, pagesProcessed: 0, chunksVectorized: 0, tablesExtracted: 0, error: 'centralCgId manquant' };
    }

    if (!pdfUrl && !pdfBase64) {
      return { success: false, pagesProcessed: 0, chunksVectorized: 0, tablesExtracted: 0, error: 'Aucune source PDF fournie' };
    }

    let base64ToProcess = pdfBase64;
    let urlToProcess = pdfUrl;

    // Si URL fournie mais pas de base64, télécharger
    if (pdfUrl && !pdfBase64) {
      try {
        const fetch = require('node-fetch');
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.buffer();
        base64ToProcess = buffer.toString('base64');
        console.log(`[IngestionAgent] PDF téléchargé depuis ${pdfUrl}`);
      } catch (e: any) {
        return { success: false, pagesProcessed: 0, chunksVectorized: 0, tablesExtracted: 0, error: `Impossible de télécharger le PDF : ${e.message}` };
      }
    }

    try {
      // Utiliser le pool DB exposé par storage
      const { Pool } = require('pg');
      const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'assurclair',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD,
      });

      const stats = await vectorizeCgByPages(pool, centralCgId, urlToProcess || '', base64ToProcess || '');

      await pool.end();

      // Marquer le CG comme indexé
      await dbQuery(
        `UPDATE central_cg SET is_indexed = true, last_indexed_at = NOW() WHERE id = $1`,
        [centralCgId],
      ).catch(() => { /* colonne peut ne pas exister, silencieux */ });

      return {
        success: true,
        pagesProcessed: stats?.pagesProcessed || 0,
        chunksVectorized: stats?.factsCreated || 0,
        tablesExtracted: stats?.tablesExtracted || 0,
      };
    } catch (e: any) {
      console.error('[IngestionAgent] Erreur vectorisation:', e.message);
      return {
        success: false,
        pagesProcessed: 0,
        chunksVectorized: 0,
        tablesExtracted: 0,
        error: e.message,
      };
    }
  }

  /**
   * Vectorise un contrat utilisateur (policy_embeddings).
   */
  async ingestUserPolicy(input: IngestionInput): Promise<IngestionResult> {
    const { pdfBase64, mimeType, policyId } = input;

    if (!policyId || !pdfBase64) {
      return { success: false, pagesProcessed: 0, chunksVectorized: 0, tablesExtracted: 0, error: 'policyId ou pdfBase64 manquant' };
    }

    try {
      // Extraire le texte du PDF via Gemini, puis vectoriser
      const { getAiClient } = require('../services/geminiService');
      const ai = getAiClient();
      if (!ai) throw new Error('Client Gemini indisponible');

      const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'ingestionAgent_extract');
      const extractResult = await model.generateContent([
        { inlineData: { mimeType, data: pdfBase64 } },
        'Extrais intégralement le texte de ce document d\'assurance, sans reformuler.',
      ]);
      const pdfText = extractResult.response.text();

      await storage.vectorizePolicyPdf(policyId, pdfText);

      return {
        success: true,
        pagesProcessed: 1,
        chunksVectorized: Math.ceil(pdfText.length / 3000),
        tablesExtracted: 0,
      };
    } catch (e: any) {
      console.error('[IngestionAgent] Erreur vectorisation policy:', e.message);
      return {
        success: false,
        pagesProcessed: 0,
        chunksVectorized: 0,
        tablesExtracted: 0,
        error: e.message,
      };
    }
  }
}

export const ingestionAgent = new IngestionAgent();
