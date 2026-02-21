/**
 * Routes pour gérer les conditions générales (CG)
 * - Récupération des CG standards depuis central_cg
 * - Upload et vectorisation de CG personnalisées dans user_cg
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../db';
import pool from '../db';
import { generateEmbedding as generateEmbeddingCentral } from '../services/geminiService';
import { vectorizeUserCgByPages } from '../services/pageVectorizationService';

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Configuration multer pour l'upload de fichiers PDF
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
  }
});

// -----------------------------------------------------------------------------
// GET /api/cg/central/by-type-and-insurer
// Récupère les CG disponibles depuis central_cg pour un type et un assureur
// -----------------------------------------------------------------------------
router.get('/central/by-type-and-insurer', async (req: Request, res: Response) => {
  try {
    console.log('[CG] GET request:', req.query);
    const { insurance_type_code, insurer_code } = req.query;

    if (!insurance_type_code || !insurer_code) {
      console.log('[CG] Missing parameters');
      return res.status(400).json({ 
        error: 'Les paramètres insurance_type_code et insurer_code sont requis' 
      });
    }

    console.log('[CG] Querying database for:', { insurance_type_code, insurer_code });
    const result = await query(
      `SELECT 
        id,
        insurer_code,
        insurance_type_code,
        version,
        type,
        detail,
        url,
        target_filename,
        status,
        metadata,
        created_at
      FROM central_cg
      WHERE insurance_type_code = $1 
        AND insurer_code = $2 
        AND status = 'active'
      ORDER BY version DESC
      LIMIT 1`,
      [insurance_type_code, insurer_code]
    );

    console.log('[CG] Query result:', result.rows.length, 'rows');

    if (result.rows.length === 0) {
      console.log('[CG] No CG found');
      return res.status(404).json({ 
        error: 'Aucune CG trouvée pour cet assureur et ce type d\'assurance' 
      });
    }

    const cg = result.rows[0];
    console.log('[CG] CG found:', { id: cg.id, has_metadata: !!cg.metadata, metadata_type: typeof cg.metadata });
    
    const response = {
      id: cg.id,
      insurer_code: cg.insurer_code,
      insurance_type_code: cg.insurance_type_code,
      version: cg.version,
      detail: cg.detail,
      url: cg.url,
      // Compatibilité : les CG admin stockent indexedFormulas, les user_cg stockent formules
      formules: cg.metadata?.formules || cg.metadata?.indexedFormulas || [],
      options: cg.metadata?.options || cg.metadata?.indexedOptions || { toutes_formules: [] },
      resume_court: cg.metadata?.resume_court || cg.metadata?.description || '',
      insurer_name: cg.metadata?.insurer_name || '',
      insurance_type_name: cg.metadata?.insurance_type_name || ''
    };
    
    console.log('[CG] Sending response with', response.formules?.length, 'formules');
    res.json(response);

  } catch (error: any) {
    console.error('[CG] ERROR:', error.message);
    console.error('[CG] Stack:', error.stack);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des CG', details: error.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/cg/user/upload
// Upload d'une CG personnalisée — réponse immédiate, traitement asynchrone
// -----------------------------------------------------------------------------
router.post('/user/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    const { insurance_type_code, insurer_code, user_email, contract_name, contract_version, doc_type, contract_url } = req.body;
    const file = req.file;

    if (!insurance_type_code || !insurer_code || !user_email) {
      return res.status(400).json({ 
        error: 'Les champs insurance_type_code, insurer_code et user_email sont requis' 
      });
    }

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier PDF fourni' });
    }

    // 1. Récupérer les noms (rapide — pas de Gemini)
    const [insurerResult, typeResult] = await Promise.all([
      query('SELECT name FROM insurers WHERE code = $1', [insurer_code]),
      query('SELECT name FROM insurance_types WHERE code = $1', [insurance_type_code])
    ]);
    const insurerName = insurerResult.rows[0]?.name || insurer_code;
    const insuranceTypeName = typeResult.rows[0]?.name || insurance_type_code;

    // 2. Insérer immédiatement avec statut 'extracting' — PDF stocké, pas encore traité
    const base64Pdf = file.buffer.toString('base64');

    const insertResult = await query(
      `INSERT INTO user_cg (
        insurer_code, insurance_type_code, version, type, detail, url,
        owner, target_filename, status, metadata, pdf_base64, vectorization_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'extracting')
      RETURNING id`,
      [
        insurer_code,
        insurance_type_code,
        contract_version || '001',
        doc_type || 'CG',
        contract_name || null,
        contract_url || null,
        user_email,
        file.originalname,
        'active',
        JSON.stringify({
          insurer_name: insurerName,
          insurance_type_name: insuranceTypeName,
          source: 'user_upload',
          uploaded_at: new Date().toISOString()
        }),
        base64Pdf
      ]
    );

    const cgId = insertResult.rows[0].id;

    // 3. Récupérer l'id utilisateur (pour user_coverage_facts)
    let userId: number | null = null;
    try {
      const userResult = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [user_email]);
      if (userResult.rows.length > 0) userId = userResult.rows[0].id;
    } catch (_) {}

    // 4. Répondre immédiatement — traitement async en arrière-plan
    res.status(202).json({
      success: true,
      id: cgId,
      status: 'extracting',
      insurer_name: insurerName,
      insurance_type_name: insuranceTypeName
    });

    // 5. Pipeline asynchrone complet (extraction + vectorisation)
    processUserCgAsync(cgId, base64Pdf, insuranceTypeName, userId).catch(err => {
      console.error(`❌ Pipeline async user_cg ${cgId}:`, err);
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload de la CG:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'upload de la CG' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/cg/user/status/:id
// Statut de traitement d'une CG utilisateur (pour polling frontend)
// -----------------------------------------------------------------------------
router.get('/user/status/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, vectorization_status, pages_total, pages_processed, vectorization_error, metadata
       FROM user_cg WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CG introuvable' });
    }

    const row = result.rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});

    // Calcul du pourcentage global
    let percent = 5;
    const vstatus = row.vectorization_status;
    if (vstatus === 'extracting') percent = 20;
    else if (vstatus === 'embedding') percent = 45;
    else if (vstatus === 'processing') {
      const total = row.pages_total || 1;
      const done = row.pages_processed || 0;
      percent = 50 + Math.round((done / total) * 45);
    } else if (vstatus === 'done') percent = 100;
    else if (vstatus === 'failed') percent = 0;

    res.json({
      id: row.id,
      status: vstatus,
      pages_total: row.pages_total || 0,
      pages_processed: row.pages_processed || 0,
      percent,
      error: row.vectorization_error || null,
      formules: meta.formules || [],
      options: meta.options || {},
      resume_court: meta.resume_court || '',
      insurer_name: meta.insurer_name || '',
      insurance_type_name: meta.insurance_type_name || ''
    });
  } catch (error) {
    console.error('Erreur status CG:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -----------------------------------------------------------------------------
// Pipeline asynchrone : extraction texte → metadata → embedding → vectorisation
// -----------------------------------------------------------------------------
async function processUserCgAsync(
  cgId: number,
  base64Pdf: string,
  insuranceTypeName: string,
  userId: number | null
): Promise<void> {
  try {
    // Phase 1 : extraction texte
    console.log(`[user_cg ${cgId}] Phase 1: extraction texte...`);
    const text = await extractTextFromPdf(base64Pdf);

    // Phase 2 : extraction métadonnées
    console.log(`[user_cg ${cgId}] Phase 2: extraction métadonnées...`);
    await pool.query(
      `UPDATE user_cg SET vectorization_status = 'embedding' WHERE id = $1`,
      [cgId]
    );
    const enrichedMetadata = await extractEnrichedMetadata(text, insuranceTypeName);

    // Phase 3 : embedding
    console.log(`[user_cg ${cgId}] Phase 3: embedding...`);
    const embeddingValues = await generateEmbeddingCentral(text);
    const embeddingStr = embeddingValues ? `[${embeddingValues.join(',')}]` : null;

    // Mise à jour complète avant vectorisation page par page
    await pool.query(
      `UPDATE user_cg
       SET content_text = $1, embedding = $2, metadata = $3, vectorization_status = 'processing'
       WHERE id = $4`,
      [
        text,
        embeddingStr,
        JSON.stringify({
          ...(await getCurrentMeta(cgId)),
          formules: enrichedMetadata.formules,
          options: enrichedMetadata.options,
          resume_court: enrichedMetadata.resume_court
        }),
        cgId
      ]
    );

    // Phase 4 : vectorisation page par page
    console.log(`[user_cg ${cgId}] Phase 4: vectorisation page par page...`);
    const { pagesProcessed, tablesExtracted, factsCreated } = await vectorizeUserCgByPages(pool, cgId, base64Pdf, userId);
    console.log(`✅ [user_cg ${cgId}] Pipeline terminé: ${pagesProcessed} pages, ${tablesExtracted} tableaux, ${factsCreated} faits`);

  } catch (error: any) {
    console.error(`❌ [user_cg ${cgId}] Pipeline échoué:`, error);
    try {
      await pool.query(
        `UPDATE user_cg SET vectorization_status = 'failed', vectorization_error = $1 WHERE id = $2`,
        [error?.message || 'Erreur inconnue', cgId]
      );
    } catch (_) {}
  }
}

async function getCurrentMeta(cgId: number): Promise<any> {
  try {
    const r = await pool.query('SELECT metadata FROM user_cg WHERE id = $1', [cgId]);
    if (r.rows.length > 0) {
      const m = r.rows[0].metadata;
      return typeof m === 'string' ? JSON.parse(m) : (m || {});
    }
  } catch (_) {}
  return {};
}

// -----------------------------------------------------------------------------
// Fonctions utilitaires
// -----------------------------------------------------------------------------

async function extractTextFromPdf(base64Pdf: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Pdf
      }
    },
    {
      text: 'Extract all text from this PDF document. Return only the raw text content without any formatting or explanations.'
    }
  ]);

  return result.response.text();
}

async function extractEnrichedMetadata(text: string, insuranceTypeName: string): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `Tu es un expert en assurance. Analyse ce document de conditions générales d'assurance ${insuranceTypeName}.

DOCUMENT:
${text.substring(0, 50000)}

Extrais et structure les informations suivantes au format JSON strict (pas de markdown, juste le JSON) :

{
  "formules": ["liste des formules/niveaux de garantie proposés, ex: Tiers, Intermédiaire, Tous risques"],
  "options": {
    "formule1": ["options spécifiques à cette formule"],
    "toutes_formules": ["options communes à toutes les formules"]
  },
  "resume_court": "résumé en 2-3 phrases des garanties principales"
}

Réponds UNIQUEMENT avec le JSON, sans aucun texte avant ou après.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      return JSON.parse(jsonText);
    } catch {
      return {
        formules: [],
        options: { toutes_formules: [] },
        resume_court: "Métadonnées non disponibles"
      };
    }
  } catch {
    return {
      formules: [],
      options: { toutes_formules: [] },
      resume_court: "Métadonnées non disponibles"
    };
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  // Kept for backward compat — now delegates to centralized null-safe version
  const values = await generateEmbeddingCentral(text);
  return values ?? new Array(768).fill(0);
}

export default router;
