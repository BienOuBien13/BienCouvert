/**
 * Routes pour gérer les conditions générales (CG)
 * - Récupération des CG standards depuis central_cg
 * - Upload et vectorisation de CG personnalisées dans user_cg
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../db';
import pool from '../db';
import { generateEmbedding as generateEmbeddingCentral } from '../services/geminiService';
import { vectorizeUserCgByPages } from '../services/pageVectorizationService';
// pdf-parse : extraction texte locale (0 token Gemini output)
const pdfParse = require('pdf-parse');

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Répertoire de stockage des PDFs sur le disque ───────────────────────────
// Configure via PDF_STORAGE_DIR env-var (ex: /data/assur-clair/pdfs)
// En dev, défaut à <projet>/BackEnd/pdf-storage
const PDF_STORAGE_DIR = process.env.PDF_STORAGE_DIR || path.join(__dirname, '..', '..', 'pdf-storage');

/**
 * Sauvegarde un Buffer PDF sur le disque et retourne le chemin relatif.
 * @param buffer   Contenu binaire du PDF
 * @param subDir   Sous-répertoire (ex: 'central/MAA01' ou 'user/alice@example.com')
 * @param filename Nom de fichier original
 * @returns chemin relatif stocké en DB (ex: central/MAA01/1710000000000_auto-zen.pdf)
 */
async function savePdfToDisk(buffer: Buffer, subDir: string, filename: string): Promise<string> {
  const safeDir = subDir.replace(/[^a-zA-Z0-9_\-/]/g, '_');
  const dir = path.join(PDF_STORAGE_DIR, safeDir);
  fs.mkdirSync(dir, { recursive: true });
  const safeFilename = filename.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const uniqueName = `${Date.now()}_${safeFilename}`;
  const fullPath = path.join(dir, uniqueName);
  fs.writeFileSync(fullPath, buffer);
  return path.join(safeDir, uniqueName).replace(/\\/g, '/'); // toujours slash POSIX en BD
}

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
// Récupère la CG principale (document_type_code = 'CG') depuis central_cg
// pour un type, un assureur, et optionnellement un sous-type.
// -----------------------------------------------------------------------------
router.get('/central/by-type-and-insurer', async (req: Request, res: Response) => {
  try {
    console.log('[CG] GET request:', req.query);
    const { insurance_type_code, insurer_code, insurance_sub_type_code } = req.query;

    if (!insurance_type_code || !insurer_code) {
      console.log('[CG] Missing parameters');
      return res.status(400).json({ 
        error: 'Les paramètres insurance_type_code et insurer_code sont requis' 
      });
    }

    // Construction dynamique : si un sous-type est précisé on l'utilise, sinon on
    // accepte aussi les lignes sans sous-type (IS NULL) pour rester rétro-compat.
    const params: any[] = [insurance_type_code, insurer_code];
    let subTypeClause = '';
    if (insurance_sub_type_code) {
      params.push(insurance_sub_type_code);
      subTypeClause = `AND (insurance_sub_type_code = $${params.length} OR insurance_sub_type_code IS NULL)`;
    }

    console.log('[CG] Querying database for:', { insurance_type_code, insurer_code, insurance_sub_type_code });

    // Clause ORDER BY : si un sous-type est demandé, on préfère la correspondance exacte
    const orderBySubType = insurance_sub_type_code
      ? `CASE WHEN insurance_sub_type_code = $${params.length} THEN 0 ELSE 1 END,`
      : '';

    const result = await query(
      `SELECT 
        id,
        insurer_code,
        insurance_type_code,
        insurance_sub_type_code,
        document_type_code,
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
        AND (document_type_code = 'CG' OR document_type_code IS NULL)
        ${subTypeClause}
        AND status = 'active'
      ORDER BY
        ${orderBySubType}
        version DESC
      LIMIT 1`,
      params
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
      insurance_sub_type_code: cg.insurance_sub_type_code || null,
      document_type_code: cg.document_type_code || 'CG',
      version: cg.version,
      detail: cg.detail,
      url: cg.url,
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
// GET /api/cg/central/documents
// Retourne TOUS les documents disponibles pour un assureur + type + sous-type.
// Utile pour lister CG, NI, IPID, DIP etc. sur la même page de contrat.
// Paramètres query : insurance_type_code (requis), insurer_code (requis),
//                    insurance_sub_type_code (optionnel), document_type_code (optionnel)
// -----------------------------------------------------------------------------
router.get('/central/documents', async (req: Request, res: Response) => {
  try {
    const { insurance_type_code, insurer_code, insurance_sub_type_code, document_type_code } = req.query;

    if (!insurance_type_code || !insurer_code) {
      return res.status(400).json({
        error: 'Les paramètres insurance_type_code et insurer_code sont requis'
      });
    }

    const params: any[] = [insurance_type_code, insurer_code];
    const conditions: string[] = [
      'insurance_type_code = $1',
      'insurer_code = $2',
      "status = 'active'"
    ];

    if (insurance_sub_type_code) {
      params.push(insurance_sub_type_code);
      conditions.push(`(insurance_sub_type_code = $${params.length} OR insurance_sub_type_code IS NULL)`);
    }
    if (document_type_code) {
      params.push(document_type_code);
      conditions.push(`document_type_code = $${params.length}`);
    }

    const result = await query(
      `SELECT
         id,
         insurer_code,
         insurance_type_code,
         insurance_sub_type_code,
         document_type_code,
         version,
         detail,
         url,
         target_filename,
         status,
         metadata,
         created_at
       FROM central_cg
       WHERE ${conditions.join(' AND ')}
       ORDER BY document_type_code, version DESC`,
      params
    );

    const documents = result.rows.map(row => ({
      id: row.id,
      insurer_code: row.insurer_code,
      insurance_type_code: row.insurance_type_code,
      insurance_sub_type_code: row.insurance_sub_type_code || null,
      document_type_code: row.document_type_code || 'CG',
      version: row.version,
      detail: row.detail,
      url: row.url,
      target_filename: row.target_filename,
      formules: row.metadata?.formules || row.metadata?.indexedFormulas || [],
      resume_court: row.metadata?.resume_court || row.metadata?.description || '',
      insurer_name: row.metadata?.insurer_name || '',
      insurance_type_name: row.metadata?.insurance_type_name || ''
    }));

    res.json(documents);
  } catch (error: any) {
    console.error('[CG/documents] ERROR:', error.message);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/cg/user/upload
// Upload d'une CG personnalisée — réponse immédiate, traitement asynchrone
// -----------------------------------------------------------------------------
router.post('/user/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    const {
      insurance_type_code,
      insurer_code,
      user_email,
      contract_name,
      contract_version,
      doc_type,
      contract_url,
      insurance_sub_type_code,   // NOUVEAU — optionnel
      document_type_code,        // NOUVEAU — optionnel (défaut : doc_type || 'CG')
    } = req.body;
    const file = req.file;

    if (!insurance_type_code || !insurer_code || !user_email) {
      return res.status(400).json({ 
        error: 'Les champs insurance_type_code, insurer_code et user_email sont requis' 
      });
    }

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier PDF fourni' });
    }

    // Résolution du document_type_code : priorité à document_type_code, puis doc_type, défaut 'CG'
    const resolvedDocTypeCode: string = document_type_code || doc_type || 'CG';

    // 1. Récupérer les noms (rapide — pas de Gemini)
    const queryPromises: Promise<any>[] = [
      query('SELECT label, full_name FROM insurers WHERE code = $1', [insurer_code]),
      query('SELECT label_fr FROM insurance_types WHERE code = $1', [insurance_type_code]),
    ];
    if (insurance_sub_type_code) {
      queryPromises.push(
        query('SELECT label_fr FROM insurance_sub_types WHERE code = $1', [insurance_sub_type_code])
      );
    }
    const [insurerResult, typeResult, subTypeResult] = await Promise.all(queryPromises);
    const insurerName = insurerResult.rows[0]?.full_name || insurerResult.rows[0]?.label || insurer_code;
    const insuranceTypeName = typeResult.rows[0]?.label_fr || insurance_type_code;
    const insuranceSubTypeName = subTypeResult?.rows[0]?.label_fr || insurance_sub_type_code || null;

    // 2. Insérer immédiatement avec statut 'extracting' — PDF stocké, pas encore traité
    const base64Pdf = file.buffer.toString('base64');

    const insertResult = await query(
      `INSERT INTO user_cg (
        insurer_code, insurance_type_code, insurance_sub_type_code,
        document_type_code, version, type, detail, url,
        owner, target_filename, status, metadata, pdf_base64, vectorization_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'extracting')
      RETURNING id`,
      [
        insurer_code,
        insurance_type_code,
        insurance_sub_type_code || null,
        resolvedDocTypeCode,
        contract_version || '001',
        resolvedDocTypeCode,           // ancien champ libre maintenu pour rétro-compat
        contract_name || null,
        contract_url || null,
        user_email,
        file.originalname,
        'active',
        JSON.stringify({
          insurer_name: insurerName,
          insurance_type_name: insuranceTypeName,
          insurance_sub_type_name: insuranceSubTypeName,
          source: 'user_upload',
          uploaded_at: new Date().toISOString()
        }),
        base64Pdf
      ]
    );

    const cgId = insertResult.rows[0].id;

    // Sauvegarde du PDF sur le disque (non-bloquant — fire & forget)
    setImmediate(() => {
      savePdfToDisk(file.buffer, `user/${insurer_code}`, file.originalname)
        .then(relPath => query(
          'UPDATE user_cg SET pdf_file_path = $1 WHERE id = $2',
          [relPath, cgId]
        ))
        .catch(err => console.warn(`⚠️ Sauvegarde PDF disque user_cg ${cgId}:`, err?.message));
    });

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
      insurance_type_name: insuranceTypeName,
      insurance_sub_type_code: insurance_sub_type_code || null,
      insurance_sub_type_name: insuranceSubTypeName,
      document_type_code: resolvedDocTypeCode
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

/**
 * Extrait le texte d'un PDF localement via pdf-parse (0 token Gemini).
 * Falls back to Gemini Vision uniquement si pdf-parse retourne < 100 chars (PDF scanné).
 */
async function extractTextFromPdf(base64Pdf: string): Promise<string> {
  try {
    const pdfBuffer = Buffer.from(base64Pdf, 'base64');
    const data = await pdfParse(pdfBuffer);
    const localText = (data.text || '').trim();
    if (localText.length >= 100) {
      console.log(`✅ extractTextFromPdf: ${localText.length} chars extrait localement (0 token Gemini)`);
      return localText;
    }
    console.warn(`⚠️ pdf-parse: texte court (${localText.length} chars) — PDF probablement scanné, fallback Gemini Vision`);
  } catch (parseErr: any) {
    console.warn(`⚠️ pdf-parse échoué: ${parseErr.message} — fallback Gemini Vision`);
  }

  // Fallback Gemini (uniquement pour PDFs scannés / Image-only)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
    { text: 'Extract all text from this PDF document. Return only the raw text content without any formatting or explanations.' }
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

// -----------------------------------------------------------------------------
// GET /api/cg/files/central/:id
// Sert le fichier PDF d'une CG centrale depuis le disque (pdf_file_path)
// -----------------------------------------------------------------------------
router.get('/files/central/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });

    const result = await query(
      'SELECT pdf_file_path, target_filename FROM central_cg WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document introuvable' });

    const { pdf_file_path, target_filename } = result.rows[0];
    if (!pdf_file_path) return res.status(404).json({ error: 'Fichier non disponible sur disque' });

    const fullPath = path.join(PDF_STORAGE_DIR, pdf_file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${target_filename || 'document.pdf'}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err: any) {
    console.error('Erreur GET /files/central:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/cg/files/user/:id
// Sert le fichier PDF d'une CG utilisateur depuis le disque (pdf_file_path)
// -----------------------------------------------------------------------------
router.get('/files/user/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });

    const result = await query(
      'SELECT pdf_file_path, target_filename FROM user_cg WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document introuvable' });

    const { pdf_file_path, target_filename } = result.rows[0];
    if (!pdf_file_path) return res.status(404).json({ error: 'Fichier non disponible sur disque' });

    const fullPath = path.join(PDF_STORAGE_DIR, pdf_file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${target_filename || 'document.pdf'}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err: any) {
    console.error('Erreur GET /files/user:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
