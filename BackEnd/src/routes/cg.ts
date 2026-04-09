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
import { vectorizeUserCgByPages, vectorizeCgByPages } from '../services/pageVectorizationService';
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
// Utilitaire partagé : nettoyer et dédoublonner une liste de formules issues de
// l'extraction IA (Gemini texte, Gemini Vision, bulk-upload, admin, user CP).
//
// Problèmes fréquents traités ici :
//  1. Doublons sémantiques : "Formule Économique" + "Économique" → garder "Économique"
//  2. Zones géographiques captées par erreur : "France métropolitaine", "Monaco"…
//  3. Entrées trop longues (phrases, descriptions, "RC Résidence principale (RP) ou RS")
//  4. Combinaisons multi-slash : "Éco/Éq/Confort", "Standard / Autres Formules"
//  5. Formules génériques (FORMULE 1/2/3) cohabitant avec noms sémantiques
//  6. Catégories de produits : "Appareils neufs", "Appareils reconditionnés"…
// -----------------------------------------------------------------------------

/** Retourne true si l'entrée n'est clairement PAS un nom de formule commerciale. */
function isNotAFormulaName(f: string): boolean {
  const s = f.trim();
  // Entrée vide ou trop courte
  if (s.length < 2) return true;
  // Trop long → phrase/description, pas un nom de formule (seuil : 55 caractères)
  if (s.length > 55) return true;
  // Mots-clés de structure de tableau
  if (/^(garanties?|prestations?|coverage|guarantee|nature|objet|description|montant|plafond|franchise)$/i.test(s)) return true;
  // Zones géographiques (présence dans la chaîne, pas seulement en recherche exacte)
  if (/\b(france\s+m[eé]trop|m[eé]tropol|corse|monaco|drom|com\s*\d|dom\b|antill|r[eé]union|martiniq|guadeloup|guyane|polyn[eé]sie|nouvelle[\s-]?cal|nouvelle[\s-]?z[eé]lande|outre[\s-]?mer|m[eé]tropolitaine)\b/i.test(s)) return true;
  // Catégories produits ou segments clients (pas des formules)
  if (/\b(appareils?\s+(?:neufs?|reconditionnés?)|individu\b|famille\b)\b/i.test(s)) return true;
  // Combinaisons multi-slash (3 segments ou plus = combo de formules, pas une formule unique)
  if (/\w{2,}\s*\/\s*\w{2,}\s*\/\s*\w{2,}/.test(s)) return true;
  return false;
}

/** Forme canonique pour détecter les doublons avec/sans préfixe "Formule". */
function canonicalizeFormula(f: string): string {
  return f.trim()
    .replace(/^formules?\s+/i, '')   // Strip "Formule " / "Formules " prefix
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Retourne true si la formule est générique (Formule 1, F1, Formule n°2…). */
function isGenericFormulaName(f: string): boolean {
  return (
    /^formule\s*\d+$/i.test(f) ||
    /^f\s*\d+$/i.test(f) ||
    /^formule\s+n[°o]?\s*\d+$/i.test(f) ||
    /^formule\d+$/i.test(f)
  );
}

function deduplicateFormulas(rawFormulas: string[]): string[] {
  if (!rawFormulas || rawFormulas.length === 0) return [];

  // 1. Nettoyer les entrées invalides (géographie, trop long, catégories…)
  const cleaned = rawFormulas.map(f => f.trim()).filter(f => !isNotAFormulaName(f));

  // 2. Regrouper par forme canonique — préférer la version SANS préfixe "Formule "
  const byCanon = new Map<string, string[]>();
  for (const f of cleaned) {
    const key = canonicalizeFormula(f);
    if (!byCanon.has(key)) byCanon.set(key, []);
    byCanon.get(key)!.push(f);
  }
  const deduped: string[] = [];
  for (const variants of byCanon.values()) {
    if (variants.length === 1) {
      deduped.push(variants[0]);
    } else {
      // Parmi les doublons, préférer celui sans préfixe "Formule " (plus court/simple)
      const withoutPrefix = variants.filter(v => !/^formules?\s+/i.test(v));
      deduped.push(withoutPrefix.length > 0 ? withoutPrefix[0] : variants[0]);
    }
  }

  // 3. Supprimer les génériques (Formule 1, F1…) si des noms sémantiques existent
  const genericOnes  = deduped.filter(f => isGenericFormulaName(f));
  const semanticOnes = deduped.filter(f => !isGenericFormulaName(f));
  if (semanticOnes.length > 0 && genericOnes.length > 0) {
    return semanticOnes;
  }

  return deduped;
}

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

    console.log('[CG] Querying database for:', { insurance_type_code, insurer_code, insurance_sub_type_code });

    // Fonction utilitaire : exécuter la requête avec ou sans clause sous-type
    const runQuery = async (subTypeFilter: string, qParams: any[]) => query(
      `SELECT 
        id, insurer_code, insurance_type_code, insurance_sub_type_code,
        document_type_code, version, type, detail, url, target_filename,
        status, metadata, created_at
      FROM central_cg
      WHERE insurance_type_code = $1
        AND insurer_code         = $2
        AND status NOT IN ('archived', 'deleted')
        ${subTypeFilter}
      ORDER BY
        CASE WHEN document_type_code = 'CG' THEN 0
             WHEN document_type_code IS NULL THEN 1
             ELSE 2 END,
        version DESC NULLS LAST
      LIMIT 1`,
      qParams
    );

    // Tentative 1 : correspondance exacte (insensible à la casse) sur le sous-type
    let result = { rows: [] as any[] };
    if (insurance_sub_type_code) {
      result = await runQuery(
        `AND LOWER(insurance_sub_type_code) = LOWER($3)`,
        [insurance_type_code, insurer_code, insurance_sub_type_code]
      );
    }

    // Tentative 2 : sans filtre sous-type (inclut IS NULL et tout autre sous-type)
    if (result.rows.length === 0) {
      result = await runQuery('', [insurance_type_code, insurer_code]);
    }

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
      formules: deduplicateFormulas(cg.metadata?.indexedFormulas || cg.metadata?.formula_hints || cg.metadata?.formules || []),
      options: (() => {
        const rawOpts = cg.metadata?.options || cg.metadata?.indexedOptions || {};
        if (Array.isArray(rawOpts)) {
          return rawOpts.length > 0 ? { 'Options': rawOpts } : {};
        }
        return rawOpts || {};
      })(),
      resume_court: cg.metadata?.resume_court || cg.metadata?.description || ''
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
// GET /api/cg/central/available-sub-types
// Retourne les sous-types distincts disponibles dans central_cg pour un
// assureur + type d'assurance donnés (uniquement ceux qui ont des CG actives).
// Paramètres query : insurance_type_code (requis), insurer_code (requis)
// Réponse : [{ code, labelFr }]  — tableau vide si pas de sous-type
// -----------------------------------------------------------------------------
router.get('/central/available-sub-types', async (req: Request, res: Response) => {
  try {
    const { insurance_type_code, insurer_code } = req.query;

    if (!insurance_type_code || !insurer_code) {
      return res.status(400).json({
        error: 'Les paramètres insurance_type_code et insurer_code sont requis'
      });
    }

    const result = await query(
      `SELECT DISTINCT
         cg.insurance_sub_type_code AS code,
         COALESCE(ist.label_fr, cg.insurance_sub_type_code) AS label_fr
       FROM central_cg cg
       LEFT JOIN insurance_sub_types ist
         ON ist.code = cg.insurance_sub_type_code
        AND ist.parent_type_code = $1
       WHERE cg.insurance_type_code = $1
         AND cg.insurer_code        = $2
         AND cg.insurance_sub_type_code IS NOT NULL
         AND cg.status = 'active'
       ORDER BY label_fr`,
      [insurance_type_code, insurer_code]
    );

    // Renommer label_fr → labelFr pour correspondre au type frontend { code, labelFr }
    const subTypes = result.rows.map((r: any) => ({ code: r.code, labelFr: r.label_fr }));
    res.json(subTypes); // peut être [] si aucun sous-type
  } catch (error: any) {
    console.error('[CG/available-sub-types] ERROR:', error.message);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
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
      formules: deduplicateFormulas(row.metadata?.indexedFormulas || row.metadata?.formula_hints || row.metadata?.formules || []),
      resume_court: row.metadata?.resume_court || row.metadata?.description || ''
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
// PATCH /api/cg/central/:id
// Met à jour les formules et options indexées d'un document CG (sans re-vectoriser)
// Body: { indexedFormulas?: string[], indexedOptions?: Record<string, string[]>, description?: string }
// -----------------------------------------------------------------------------
router.patch('/central/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { indexedFormulas, indexedOptions, description } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID requis' });
    }

    // Récupère le document existant pour merger le metadata
    const existing = await query('SELECT metadata FROM central_cg WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Document CG introuvable' });
    }

    const currentMeta = existing.rows[0].metadata || {};

    // Merge partiel : on ne remplace que les champs fournis
    const newMeta: Record<string, any> = { ...currentMeta };
    if (Array.isArray(indexedFormulas)) newMeta.indexedFormulas = indexedFormulas;
    if (indexedOptions !== undefined) newMeta.indexedOptions = indexedOptions;
    if (description !== undefined) newMeta.description = description;
    if (description !== undefined) newMeta.resume_court = description;

    await query(
      'UPDATE central_cg SET metadata = $1::jsonb WHERE id = $2',
      [JSON.stringify(newMeta), id]
    );

    console.log(`[CG/PATCH] Metadata updated for id=${id}`, {
      formulas: (newMeta.indexedFormulas || []).length,
    });

    res.json({ success: true, id, metadata: newMeta });
  } catch (error: any) {
    console.error('[CG/PATCH] ERROR:', error.message);
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
  "formules": ["liste des formules/niveaux de garantie proposés"],
  "options": {
    "formule1": ["options spécifiques à cette formule"],
    "toutes_formules": ["options communes à toutes les formules"]
  },
  "resume_court": "résumé en 2-3 phrases des garanties principales"
}

ATTENTION pour les formules \u2014 R\u00c8GLES STRICTES :
- Une formule = EN-T\u00caTE DE COLONNE du tableau principal des garanties.
- Exemples valides : \u00c9conomique, \u00c9largie, Confort, Tiers, Tous Risques, Essentiel, Gold, Premium, Bronze, Silver.
- NOMS COURTS : 1 \u00e0 5 mots maximum.
- Si la formule s'appelle "Formule \u00c9conomique", retourne "\u00c9conomique" (sans le pr\u00e9fixe "Formule").
- EXCLURE absolument : zones g\u00e9ographiques (France m\u00e9tropolitaine, Monaco, Corse, DROM, COM\u2026)
- EXCLURE : cat\u00e9gories produit ou segments clients (Appareils neufs, reconditionn\u00e9s, Individu, Famille\u2026)
- EXCLURE : noms de garanties = lignes du tableau (Responsabilit\u00e9 Civile, Vol, Incendie, Bris de glace\u2026)
- EXCLURE : combinaisons avec "/" (ex : "\u00c9co/\u00c9q/Confort", "Standard / Autres Formules")
- MAXIMUM 8 formules. En cas de doute, ne PAS inclure. Tableau vide [] si aucune formule certaine.

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

// -----------------------------------------------------------------------------
// GET /api/cg/coverage-facts/:centralCgId
// Retourne tous les coverage_facts pour un document CG central
// Groupés par guarantee_label × formula_key pour la vue admin
// -----------------------------------------------------------------------------
router.get('/coverage-facts/:centralCgId', async (req: Request, res: Response) => {
  try {
    const { centralCgId } = req.params;
    const result = await query(
      `SELECT id, guarantee_key, guarantee_label, formula_key, formula_label,
              coverage_status, coverage_amount, coverage_notes, franchise,
              source_page_number, extraction_confidence
       FROM coverage_facts
       WHERE central_cg_id = $1
       ORDER BY guarantee_label, formula_key`,
      [centralCgId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CG/coverage-facts GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// PATCH /api/cg/coverage-fact/:id
// Met à jour le coverage_status (et notes/amount optionnels) d'un fait de couverture
// Body: { coverage_status: 'included'|'optional'|'excluded'|'not_applicable', coverage_notes?: string, coverage_amount?: string }
// -----------------------------------------------------------------------------
router.patch('/coverage-fact/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { coverage_status, coverage_notes, coverage_amount } = req.body;

    const VALID = ['included', 'optional', 'excluded', 'not_applicable'];
    if (!VALID.includes(coverage_status)) {
      return res.status(400).json({ error: `coverage_status doit être l'un de : ${VALID.join(', ')}` });
    }

    await query(
      `UPDATE coverage_facts
       SET coverage_status = $1,
           coverage_notes  = COALESCE($2, coverage_notes),
           coverage_amount = COALESCE($3, coverage_amount),
           updated_at      = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [coverage_status, coverage_notes ?? null, coverage_amount ?? null, id]
    );

    console.log(`[CG/coverage-fact PATCH] id=${id} → ${coverage_status}`);
    res.json({ success: true, id, coverage_status });
  } catch (err: any) {
    console.error('[CG/coverage-fact PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/cg/coverage-fact/:id
// Supprime un fait de couverture individuel (ex: doublon ou extraction erronée)
// -----------------------------------------------------------------------------
router.delete('/coverage-fact/:id', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM coverage_facts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// =============================================================================
// ADMIN : User CG management
// =============================================================================

// GET /api/cg/admin/user-cgs
// Liste tous les CG utilisateurs avec infos user, assureur, type, compteurs
router.get('/admin/user-cgs', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT uc.id,
              uc.user_id,
              u.email        AS user_email,
              u.first_name,
              u.last_name,
              uc.insurer_code,
              COALESCE(i.label, uc.insurer_code)       AS insurer_label,
              uc.insurance_type_code,
              COALESCE(it.label_fr, uc.insurance_type_code) AS insurance_type_label,
              uc.target_filename,
              uc.url,
              uc.created_at,
              uc.vectorized_at,
              COUNT(DISTINCT ucp.id)::int  AS pages_count,
              COUNT(DISTINCT ucf.id)::int  AS facts_count
       FROM user_cg uc
       LEFT JOIN users             u   ON u.id   = uc.user_id
       LEFT JOIN insurers          i   ON i.code  = uc.insurer_code
       LEFT JOIN insurance_types   it  ON it.code = uc.insurance_type_code
       LEFT JOIN user_cg_pages     ucp ON ucp.user_cg_id = uc.id
       LEFT JOIN user_coverage_facts ucf ON ucf.user_cg_id = uc.id
       GROUP BY uc.id, u.email, u.first_name, u.last_name, i.label, it.label_fr
       ORDER BY uc.created_at DESC`,
      []
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CG/admin/user-cgs GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// DELETE /api/cg/admin/user-cg/:id
// Supprime un CG utilisateur (FK cascade sur pages et faits)
router.delete('/admin/user-cg/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM user_cg WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CG/admin/user-cg DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// GET /api/cg/user-coverage-facts/:userCgId
// Retourne les faits de couverture d'un CG utilisateur
router.get('/user-coverage-facts/:userCgId', async (req: Request, res: Response) => {
  try {
    const { userCgId } = req.params;
    const result = await query(
      `SELECT id, guarantee_key, guarantee_label, formula_key, formula_label,
              coverage_status, coverage_amount, coverage_notes, franchise,
              source_page_number, extraction_confidence
       FROM user_coverage_facts
       WHERE user_cg_id = $1
       ORDER BY guarantee_label, formula_key`,
      [userCgId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CG/user-coverage-facts GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// PATCH /api/cg/user-coverage-fact/:id
// Met à jour le statut d'un fait de couverture utilisateur
router.patch('/user-coverage-fact/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { coverage_status } = req.body;
    const VALID = ['included', 'optional', 'excluded', 'not_applicable'];
    if (!VALID.includes(coverage_status)) {
      return res.status(400).json({ error: `coverage_status doit être l'un de : ${VALID.join(', ')}` });
    }
    await query(
      `UPDATE user_coverage_facts SET coverage_status = $1 WHERE id = $2`,
      [coverage_status, id]
    );
    res.json({ success: true, id, coverage_status });
  } catch (err: any) {
    console.error('[CG/user-coverage-fact PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/cg/user/promote-to-central/:userCgId
// Partage (avec consentement) un CG utilisateur comme CG de référence centrale.
// Conditions :
//   - document_type_code doit être 'CG' (seuls les contrats généraux sont partagés)
//   - Le PDF est re-vectorisé via vectorizeCgByPages (même pipeline que Admin)
//   - La propriété remain préservée via owner = 'shared_by_<email>'
//   - Réponse immédiate (202) — vectorisation en arrière-plan
// -----------------------------------------------------------------------------
router.post('/user/promote-to-central/:userCgId', async (req: Request, res: Response) => {
  try {
    const userCgId = parseInt(req.params.userCgId);
    if (isNaN(userCgId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    // Récupérer le CG utilisateur
    const cgResult = await query(
      `SELECT id, insurer_code, insurance_type_code, insurance_sub_type_code,
              document_type_code, version, detail, url, target_filename,
              owner, pdf_base64, pdf_file_path, metadata, vectorization_status
       FROM user_cg WHERE id = $1`,
      [userCgId]
    );

    if (cgResult.rows.length === 0) {
      return res.status(404).json({ error: `CG utilisateur ${userCgId} introuvable` });
    }

    const userCg = cgResult.rows[0];

    // Seuls les documents type 'CG' peuvent être partagés
    const resolvedDocType: string = userCg.document_type_code || 'CG';
    if (resolvedDocType !== 'CG') {
      return res.status(400).json({
        error: `Seuls les documents de type CG peuvent être partagés (ce document est de type "${resolvedDocType}")`
      });
    }

    // Récupérer le PDF (base64 ou disque)
    let pdfBase64: string | null = userCg.pdf_base64 || null;
    if (!pdfBase64 && userCg.pdf_file_path) {
      try {
        const fullPath = path.join(PDF_STORAGE_DIR, userCg.pdf_file_path);
        if (fs.existsSync(fullPath)) {
          pdfBase64 = fs.readFileSync(fullPath).toString('base64');
        }
      } catch (diskErr: any) {
        console.warn(`⚠️ Lecture PDF disque user_cg ${userCgId}:`, diskErr?.message);
      }
    }

    if (!pdfBase64) {
      return res.status(422).json({
        error: 'PDF non disponible pour ce CG — impossible de partager sans le document source'
      });
    }

    const meta = typeof userCg.metadata === 'string'
      ? JSON.parse(userCg.metadata)
      : (userCg.metadata || {});

    // Vérifier qu'un CG central identique n'existe pas déjà (même insurer + type + version)
    const existingCheck = await query(
      `SELECT id FROM central_cg
       WHERE insurer_code = $1 AND insurance_type_code = $2
         AND LOWER(COALESCE(version,'')) = LOWER(COALESCE($3,''))
         AND status = 'active'
       LIMIT 1`,
      [userCg.insurer_code, userCg.insurance_type_code, userCg.version]
    );
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Un CG central avec le même assureur, type et version existe déjà',
        existing_central_cg_id: existingCheck.rows[0].id
      });
    }

    // Insérer dans central_cg (sans le PDF pour réponse rapide)
    const insertResult = await query(
      `INSERT INTO central_cg (
         insurer_code, insurance_type_code, insurance_sub_type_code,
         document_type_code, version, type, owner,
         detail, url, target_filename, status,
         metadata, vectorization_status,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', NOW(), NOW())
       RETURNING id`,
      [
        userCg.insurer_code,
        userCg.insurance_type_code,
        userCg.insurance_sub_type_code || null,
        'CG',
        userCg.version || '001',
        'CG',
        `shared_by_${userCg.owner || 'user'}`,
        userCg.detail || meta?.description || null,
        userCg.url || null,
        userCg.target_filename || 'partagé.pdf',
        'active',
        JSON.stringify({
          ...meta,
          source: 'user_shared',
          shared_from_user_cg_id: userCgId,
          shared_at: new Date().toISOString()
        })
      ]
    );

    const centralCgId: number = insertResult.rows[0].id;

    // Réponse immédiate
    res.status(202).json({
      success: true,
      central_cg_id: centralCgId,
      status: 'processing',
      message: 'CG partagé avec succès — vectorisation en cours en arrière-plan'
    });

    // Pipeline asynchrone : stocker PDF + vectoriser
    (async () => {
      try {
        // Stocker le PDF en base
        await query(
          'UPDATE central_cg SET pdf_base64 = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [pdfBase64, centralCgId]
        );

        // Sauvegarder sur disque
        try {
          const pdfBuffer = Buffer.from(pdfBase64!, 'base64');
          const relPath = await savePdfToDisk(
            pdfBuffer,
            `central/${userCg.insurer_code}`,
            userCg.target_filename || `shared-${userCgId}.pdf`
          );
          await query(
            'UPDATE central_cg SET pdf_file_path = $1 WHERE id = $2',
            [relPath, centralCgId]
          );
        } catch (diskErr: any) {
          console.warn(`⚠️ Sauvegarde PDF disque central_cg ${centralCgId}:`, diskErr?.message);
        }

        // Vectorisation page par page (même pipeline Admin)
        const pageResult = await vectorizeCgByPages(pool, centralCgId, userCg.url || '', pdfBase64!);
        console.log(`✅ [promote] Vectorisation CG ${centralCgId} terminée:`, pageResult);

        // Agréger le texte et mettre à jour l'embedding
        const textResult = await query(
          `SELECT COALESCE(string_agg(content_text, E'\n\n' ORDER BY page_number), '') AS full_text
           FROM central_cg_pages WHERE central_cg_id = $1`,
          [centralCgId]
        );
        const fullText = textResult.rows[0]?.full_text || '';
        if (fullText.trim().length > 0) {
          await query(
            'UPDATE central_cg SET content_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [fullText, centralCgId]
          );
        }
      } catch (e: any) {
        console.error(`❌ [promote] Pipeline CG ${centralCgId} échoué:`, e);
        try {
          await query(
            `UPDATE central_cg SET vectorization_status = 'failed', vectorization_error = $1 WHERE id = $2`,
            [e?.message || 'Erreur inconnue', centralCgId]
          );
        } catch (_) {}
      }
    })().catch(err => console.error('❌ [promote] Async error:', err));

  } catch (error: any) {
    console.error('[CG/promote-to-central] ERROR:', error.message);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

export default router;
