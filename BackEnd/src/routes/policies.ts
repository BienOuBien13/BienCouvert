import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';
import { summarizePolicy, searchPolicyInfo, detectDuplicates } from '../services/geminiService';
import { query } from '../db';
import pool from '../db';
import { vectorizeCgByPages, requestStopVectorization } from '../services/pageVectorizationService';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

// -----------------------------------------------------------------------------
// Routes /policies
// - Gestion des polices/contrats : création, lecture, mise à jour, suppression.
// - Supporte l'upload de fichier (multipart/form-data) ou l'envoi direct
//   de `fileData` encodé en base64 (utile pour l'API depuis le client).
// -----------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés (MIME: application/pdf)'));
    }
  }
});
const router = Router();

// ─── Stockage PDF sur disque ──────────────────────────────────────────────────
const PDF_STORAGE_DIR = process.env.PDF_STORAGE_DIR || path.join(__dirname, '..', '..', 'pdf-storage');

async function savePdfToDisk(buffer: Buffer, subDir: string, filename: string): Promise<string> {
  const safeDir = subDir.replace(/[^a-zA-Z0-9_\-/]/g, '_');
  const dir = path.join(PDF_STORAGE_DIR, safeDir);
  fs.mkdirSync(dir, { recursive: true });
  const safeFilename = filename.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const uniqueName = `${Date.now()}_${safeFilename}`;
  fs.writeFileSync(path.join(dir, uniqueName), buffer);
  return `${safeDir}/${uniqueName}`;
}

/**
 * Route GET /api/policies
 * Liste les polices de l'utilisateur authentifié.
 * Les admins peuvent filtrer par ?userId=xxx pour voir les polices d'un autre utilisateur.
 */
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    // Les admins peuvent interroger n'importe quel userId via query param
    let targetUserId: number;
    if (req.user.isAdmin && req.query.userId) {
      targetUserId = parseInt(req.query.userId as string);
    } else {
      targetUserId = req.user.id;
    }
    const policies = await storage.readPolicies(targetUserId);
    res.json(policies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
/**
 * Route POST /api/policies
 * Création d'une nouvelle police d'assurance.
 * Supporte 2 modes d'upload :
 * - Multipart/form-data avec fichier joint (via multer)
 * - JSON avec fileData en base64 (pour upload depuis le frontend)
 * Génère automatiquement un résumé via l'IA si un document est fourni.
 */
router.post('/', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    const body = req.body;

    // userId toujours extrait du JWT — jamais du body client
    const userId: number = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    // Validation des codes requis
    if (!body.insurerCode || !body.insurance_type_code) {
      return res.status(400).json({ message: 'insurerCode and insurance_type_code are required' });
    }

    // ── Limite de 10 contrats par utilisateur ──
    const countResult = await query(
      'SELECT COUNT(*) AS cnt FROM policies WHERE user_id = $1 AND status != $2',
      [userId, 'cancelled']
    );
    if (parseInt(countResult.rows[0].cnt, 10) >= 10) {
      return res.status(400).json({ message: 'LIMIT_REACHED', detail: 'Vous avez atteint la limite de 10 contrats dans votre portefeuille.' });
    }

    // Construction de l'objet policy avec la nouvelle structure
    const newPolicy: any = {
      userId: userId,
      insurerCode: body.insurerCode,
      insuranceTypeCode: body.insurance_type_code,
      insuranceSubTypeCode: body.insurance_sub_type_code || null,  // NOUVEAU — optionnel
      centralCgId: body.cg_source === 'central' ? body.cg_id : null,
      userCgId: body.cg_source === 'user' ? body.cg_id : null,
      startDate: body.startDate || new Date().toISOString().split('T')[0],
      endDate: body.endDate || null,
      status: body.status || 'active',
      documentUrl: body.sourceUrl || null,
      metadata: {
        name: body.name || 'Contrat sans nom',
        formula: body.formula || null,
        options: body.options || [],
        premium: body.premium || null,
        coverage: body.coverage || null,
        summary: body.summary || null
      }
    };

    // Insertion dans PostgreSQL
    const policyId = await storage.writePolicy(newPolicy);
    
    // Récupérer la policy complète avec les JOINs (insurer label, type label, etc.)
    const createdPolicies = await storage.readPolicies(userId);
    const createdPolicy = createdPolicies.find((p: any) => p.id === policyId.toString());
    
    if (!createdPolicy) {
      return res.status(500).json({ message: 'Failed to retrieve created policy' });
    }
    
    // Réponse avec la policy complète
    res.json({ ...createdPolicy, message: 'Policy created successfully' });
    
  } catch (err: any) {
    console.error('❌ Erreur création policy:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * Route PUT /api/policies/:id
 * Mise à jour d'une police existante.
 * Permet de modifier toutes les propriétés de la police, y compris le document attaché.
 * Supporte les mêmes modes d'upload que la création (multipart ou JSON base64).
 */
router.put('/:id', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid policy id' });

    // Vérifier que la police existe
    const existing = await query(
      `SELECT p.*, i.label AS insurer_label
       FROM policies p
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE p.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const current = existing.rows[0];

    // Vérification de propriété : seul le propriétaire ou un admin peut modifier
    if (!req.user?.isAdmin && current.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    const currentMeta = current.metadata || {};

    const body = req.body;

    // Construire l'objet de mise à jour en fusionnant l'existant avec les nouvelles valeurs
    const updatedPolicy: any = {
      id,
      userId: current.user_id,
      insurerCode:          body.insurerCode          ?? current.insurer_code,
      insuranceTypeCode:    body.insurance_type_code   ?? body.typeCode ?? current.insurance_type_code,
      insuranceSubTypeCode: body.insurance_sub_type_code ?? body.subTypeCode ?? current.insurance_sub_type_code,
      centralCgId:          body.centralCgId !== undefined ? (body.centralCgId || null) : current.central_cg_id,
      userCgId:             body.userCgId    !== undefined ? (body.userCgId    || null) : current.user_cg_id,
      startDate:            body.startDate   ?? current.start_date,
      endDate:              body.endDate     !== undefined ? (body.endDate || null) : current.end_date,
      status:               body.status      ?? current.status,
      documentUrl:          body.sourceUrl   ?? current.document_url,
      metadata: {
        ...currentMeta,
        name:    body.name    ?? currentMeta.name,
        formula: body.formula !== undefined ? body.formula : currentMeta.formula,
        options: body.options !== undefined ? body.options : (currentMeta.options || []),
        premium: body.premium !== undefined ? body.premium : currentMeta.premium,
        coverage: body.coverage !== undefined ? body.coverage : currentMeta.coverage,
        summary: body.summary ?? currentMeta.summary,
      }
    };

    // Si un nouveau fichier est uploadé via multipart
    if (req.file) {
      const fileData = req.file.buffer.toString('base64');
      updatedPolicy.metadata.fileName = req.file.originalname;
      updatedPolicy.metadata.mimeType = req.file.mimetype;
      try { updatedPolicy.metadata.summary = await summarizePolicy(fileData, req.file.mimetype); } catch (e) {}
    } else if (body.fileData && body.fileName) {
      updatedPolicy.metadata.fileName = body.fileName;
      updatedPolicy.metadata.mimeType = body.mimeType || currentMeta.mimeType;
      if (!updatedPolicy.metadata.summary) {
        try { updatedPolicy.metadata.summary = await summarizePolicy(body.fileData, updatedPolicy.metadata.mimeType); } catch (e) {}
      }
    }

    await storage.writePolicy(updatedPolicy);

    // Retourner la policy complète avec les JOINs
    const updatedPolicies = await storage.readPolicies(current.user_id);
    const updated = updatedPolicies.find((p: any) => p.id === id.toString());
    res.json(updated ?? { message: 'Updated' });
  } catch (err: any) {
    console.error('❌ Erreur PUT policy:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * Route PATCH /api/policies/:id/options
 * Met à jour la formule et/ou les options souscrites d'une police existante.
 * Uniquement les champs fournis sont modifiés — les autres restent inchangés.
 *
 * Body attendu :
 *   { formula?: string, options?: string[] }
 *
 * Options : tableau de libellés correspondant aux guarantee_label des coverage_facts
 *   (ex: ["Bris de glace", "Protection juridique"])
 */
router.patch('/:id/options', authMiddleware, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid policy id' });

    const { formula, options } = req.body;
    if (formula === undefined && options === undefined) {
      return res.status(400).json({ message: 'At least one of formula or options is required' });
    }

    // Récupérer la police existante + vérifier la propriété
    const result = await query(
      'SELECT metadata, user_id FROM policies WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Policy not found' });

    // Vérification de propriété
    if (!req.user?.isAdmin && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const existingMeta = result.rows[0].metadata || {};

    // Fusionner uniquement ce qui est fourni
    const updatedMeta = {
      ...existingMeta,
      ...(formula !== undefined  ? { formula }  : {}),
      ...(options !== undefined  ? { options }   : {}),
    };

    await query(
      `UPDATE policies
         SET metadata = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(updatedMeta), id]
    );

    res.json({
      id,
      formula: updatedMeta.formula  || null,
      options: updatedMeta.options  || [],
    });
  } catch (err: any) {
    console.error('❌ PATCH /policies/:id/options:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * Route GET /api/policies/:id/available-options
 * Retourne les options disponibles (coverage_status = 'optional') pour la formule
 * souscrite de la police, en indiquant lesquelles sont déjà sélectionnées.
 *
 * Répond avec :
 * {
 *   formula: string | null,
 *   subscribedOptions: string[],           // options déjà cochées (metadata.options)
 *   availableOptions: [{
 *     guarantee_label: string,
 *     guarantee_key: string,
 *     formula_label: string,
 *     coverage_amount: string|null,
 *     coverage_notes: string|null,
 *     isSubscribed: boolean
 *   }]
 * }
 */
router.get('/:id/available-options', authMiddleware, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid policy id' });

    // Récupérer la police avec ses liens CG, ses options souscrites et son propriétaire
    const policyResult = await query(
      `SELECT p.metadata, p.central_cg_id, p.user_cg_id, p.user_id
       FROM policies p WHERE p.id = $1`,
      [id]
    );
    if (policyResult.rows.length === 0) return res.status(404).json({ message: 'Policy not found' });

    // Vérification de propriété
    if (!req.user?.isAdmin && policyResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const row = policyResult.rows[0];
    const meta = row.metadata || {};
    const formula: string | null = meta.formula || null;
    const subscribedOptions: string[] = Array.isArray(meta.options) ? meta.options : [];

    // Normaliser les options souscrites en keys pour comparaison
    const normalizeKey = (s: string) =>
      s.toLowerCase()
       .replace(/\+/g, '_plus')
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
       .replace(/[^a-z0-9]+/g, '_')
       .replace(/^_+|_+$/g, '');
    const subscribedKeys = new Set(subscribedOptions.map(normalizeKey));

    // Chercher les options dans coverage_facts (central_cg) ou user_coverage_facts (user_cg)
    let availableOptions: any[] = [];

    if (row.central_cg_id) {
      // Construire le filtre de formule si disponible
      const params: any[] = [row.central_cg_id];
      let formulaClause = '';
      if (formula) {
        const fKey = normalizeKey(formula);
        const fKeyAlt = normalizeKey(formula.replace(/\+/g, ''));
        params.push(fKey, fKeyAlt);
        formulaClause = `AND (cf.formula_key = $${params.length - 1} OR cf.formula_key = $${params.length} OR cf.formula_key LIKE $${params.length - 1} || '%')`;
      }

      const cfResult = await query(
        `SELECT DISTINCT ON (cf.guarantee_key)
           cf.guarantee_label,
           cf.guarantee_key,
           cf.formula_label,
           cf.formula_key,
           cf.coverage_amount,
           cf.coverage_notes,
           cf.source_page_number
         FROM coverage_facts cf
         WHERE cf.central_cg_id = $1
           AND cf.coverage_status = 'optional'
           ${formulaClause}
         ORDER BY cf.guarantee_key, cf.formula_key`,
        params
      );
      availableOptions = cfResult.rows;
    } else if (row.user_cg_id) {
      const params: any[] = [row.user_cg_id];
      let formulaClause = '';
      if (formula) {
        const fKey = normalizeKey(formula);
        const fKeyAlt = normalizeKey(formula.replace(/\+/g, ''));
        params.push(fKey, fKeyAlt);
        formulaClause = `AND (ucf.formula_key = $${params.length - 1} OR ucf.formula_key = $${params.length})`;
      }

      const ucfResult = await query(
        `SELECT DISTINCT ON (ucf.guarantee_key)
           ucf.guarantee_label,
           ucf.guarantee_key,
           ucf.formula_label,
           ucf.formula_key,
           ucf.source_page_number,
           ucf.coverage_amount,
           NULL::text AS coverage_notes
         FROM user_coverage_facts ucf
         WHERE ucf.user_cg_id = $1
           AND ucf.coverage_status = 'optional'
           ${formulaClause}
         ORDER BY ucf.guarantee_key, ucf.formula_key`,
        params
      );
      availableOptions = ucfResult.rows;
    }

    res.json({
      formula,
      subscribedOptions,
      availableOptions: availableOptions.map(opt => ({
        guarantee_label: opt.guarantee_label,
        guarantee_key:   opt.guarantee_key,
        formula_label:   opt.formula_label,
        coverage_amount: opt.coverage_amount  || null,
        coverage_notes:  opt.coverage_notes   || null,
        source_page:     opt.source_page_number || null,
        isSubscribed:    subscribedKeys.has(opt.guarantee_key),
      })),
    });
  } catch (err: any) {
    console.error('❌ GET /policies/:id/available-options:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * Route DELETE /api/policies/:id
 * Suppression d'une police d'assurance par son ID.
 */
router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid policy id' });

    // Vérifier la propriété avant suppression
    const ownerResult = await query('SELECT user_id FROM policies WHERE id = $1', [id]);
    if (ownerResult.rows.length === 0) return res.status(404).json({ message: 'Policy not found' });
    if (!req.user?.isAdmin && ownerResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    await storage.deletePolicy(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route POST /api/policies/search
 * Recherche d'informations sur une police via le service d'IA externe.
 * Utilisé pour trouver des détails sur un produit d'assurance en ligne.
 */
router.post('/search', async (req, res) => {
  const { provider, type, name } = req.body;
  try {
    const result = await searchPolicyInfo(provider, type, name);
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: 'Search error' });
  }
});

/**
 * Route POST /api/policies/summarize
 * Génération d'un résumé pour un document (PDF, image, etc.) via l'IA.
 * Utilisé pour prévisualiser le contenu d'un document avant de créer la police.
 */
router.post('/summarize', async (req, res) => {
  const { fileBase64, mimeType } = req.body;
  if (!fileBase64 || !mimeType) return res.status(400).json({ message: 'Missing fileBase64 or mimeType' });
  try {
    const summary = await summarizePolicy(fileBase64, mimeType);
    res.json({ summary });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Summarize error' });
  }
});

/**
 * Route POST /api/policies/detect-duplicates
 * Détection des doublons potentiels entre plusieurs polices d'assurance.
 * Analyse les polices fournies et identifie les couvertures redondantes.
 */
router.post('/detect-duplicates', async (req, res) => {
  const policies = req.body.policies as any[] || [];
  try {
    const findings = await detectDuplicates(policies);
    res.json(findings);
  } catch (e) {
    res.status(500).json({ message: 'Error detecting duplicates' });
  }
});

// -----------------------------------------------------------------------------
// Routes du Référentiel Central des Conditions Générales (CG)
// Ces routes permettent de gérer une bibliothèque centralisée des CG d'assurance,
// permettant de partager et réutiliser les documents déjà analysés.
// -----------------------------------------------------------------------------

/**
 * Route GET /api/policies/central-cg
 * Liste toutes les entrées du référentiel central des CG.
 * Utilisé par la vue d'administration pour gérer le référentiel.
 * Supporte les query params : ?type=auto, ?insurer=AXA
 * Les types sont normalisés en minuscules (auto, habitation, bancaire, etc.)
 */
router.get('/central-cg', async (req, res) => {
  try {
    const entries = await storage.readCentralCg();
    
    // Filtrage optionnel par type et/ou assureur
    let filtered = entries;
    if (req.query.type) {
      const requestedType = (req.query.type as string).toLowerCase();
      filtered = filtered.filter((e: any) => 
        e.metadata?.type?.toLowerCase() === requestedType || e.type?.toLowerCase() === requestedType
      );
    }
    if (req.query.insurer) {
      const requestedInsurer = (req.query.insurer as string).toLowerCase();
      filtered = filtered.filter((e: any) => 
        (e.insurer || '').toLowerCase().includes(requestedInsurer)
      );
    }
    
    res.json(filtered);
  } catch (err) {
    console.error('❌ Error in GET /central-cg:', err);
    res.status(500).json({ message: 'Server error', error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * Route POST /api/policies/central-cg
 * Ajout d'une nouvelle entrée au référentiel central des CG.
 * Permet d'indexer un nouveau document CG avec ses métadonnées.
 */
router.post('/central-cg', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📥 Réception POST /central-cg, body:', JSON.stringify({...req.body, pdfData: req.body.pdfData ? '[PDF DATA]' : undefined}, null, 2));
    
    // Extraction des champs
    const { 
      insurerCode,
      productName,
      insuranceTypeCode,
      insuranceSubTypeCode,
      documentTypeCode,
      version,
      type,
      detail,
      url,
      targetFilename,
      pdfData,
      metadata
    } = req.body;
    
    console.log('📋 Champs extraits:', { 
      insurerCode, 
      productName, 
      insuranceTypeCode,
      insuranceSubTypeCode,
      documentTypeCode,
      version,
      type,
      url,
      targetFilename,
      hasPdfData: !!pdfData
    });
    
    // Validation des champs obligatoires
    if (!insurerCode || !productName || !insuranceTypeCode || !pdfData) {
      console.error('❌ Champs manquants:', { insurerCode, productName, insuranceTypeCode, pdfData: !!pdfData });
      return res.status(400).json({ message: 'Missing required fields: insurerCode, productName, insuranceTypeCode, pdfData' });
    }

    // Récupérer l'utilisateur actif depuis le token/session
    const userId = (req as any).user?.id || 'system';

    // Le PDF est déjà en base64 (data:application/pdf;base64,...)
    let pdfBase64: string | null = null;
    if (pdfData && pdfData.startsWith('data:application/pdf;base64,')) {
      pdfBase64 = pdfData.split(',')[1];
      console.log(`📄 PDF en base64 extrait (${Math.round(pdfData.length / 1024)} KB)`);
    }

    // ⚡ INSERT léger : métadonnées uniquement, SANS le PDF base64
    // → réponse immédiate au client, pas de timeout 504 même pour les gros PDFs
    const newEntry: any = {
      insurerCode,
      insuranceTypeCode,
      insuranceSubTypeCode: insuranceSubTypeCode || null,
      documentTypeCode: documentTypeCode || type || 'CG',
      version: version || null,
      type: documentTypeCode || type || 'CG',
      owner: `user_${userId}`,
      detail: detail || null,
      url: url || null,
      targetFilename: targetFilename || 'document.pdf',
      status: 'active',
      contentText: null,
      embedding: null,
      pdfBase64: null,          // stocké en background pour ne pas bloquer la réponse
      metadata: {
        indexedFormulas: metadata?.indexedFormulas || [],
        indexedOptions: metadata?.indexedOptions || {},
        description: metadata?.description || '',
        productName
      }
    };

    const entryId = await storage.writeCentralCgEntry(newEntry);
    newEntry.id = entryId;

    // ⚡ Réponse immédiate au client
    res.json({ ...newEntry, vectorizationStatus: 'pending' });

    // 🔄 Tout le reste en arrière-plan : stockage PDF + vectorisation
    (async () => {
      try {
        if (!pdfBase64) {
          throw new Error('PDF base64 non disponible pour vectorisation');
        }

        // Étape 1 : stocker le PDF base64 (UPDATE non bloquant pour le client)
        await query(
          'UPDATE central_cg SET pdf_base64 = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [pdfBase64, entryId]
        );
        console.log(`✅ PDF stocké en DB pour CG ${entryId} (${Math.round(pdfBase64.length / 1024)} KB)`);

        // Étape 1b : sauvegarder le PDF sur le disque
        try {
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          const filename = newEntry.targetFilename || 'document.pdf';
          const relPath = await savePdfToDisk(pdfBuffer, `central/${insurerCode}`, filename);
          await query(
            'UPDATE central_cg SET pdf_file_path = $1 WHERE id = $2',
            [relPath, entryId]
          );
          console.log(`✅ PDF sauvegardé sur disque: ${relPath}`);
        } catch (diskErr: any) {
          console.warn(`⚠️ Sauvegarde PDF disque central_cg ${entryId}:`, diskErr?.message);
        }

        // Étape 2 : vectorisation page par page
        console.log(`🚀 Démarrage vectorisation en arrière-plan pour CG ${entryId}`);
        const pageResult = await vectorizeCgByPages(pool, entryId, url || '', pdfBase64);
        console.log(`✅ Vectorisation page par page OK pour CG ${entryId}:`, pageResult);

        // Étape 3 : agréger le texte complet
        const textResult = await query(
          `SELECT COALESCE(string_agg(content_text, E'\n\n' ORDER BY page_number), '') AS full_text
           FROM central_cg_pages WHERE central_cg_id = $1`,
          [entryId]
        );
        const fullText = textResult.rows[0]?.full_text || '';
        await query(
          'UPDATE central_cg SET content_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [fullText, entryId]
        );
        console.log(`✅ Texte agrégé sauvegardé pour CG ${entryId} (${fullText.length} chars)`);

        // Étape 4 : embedding global
        if (fullText.trim().length > 0) {
          await storage.vectorizeCentralCg(entryId, fullText);
          console.log(`✅ Embedding central_cg mis à jour pour CG ${entryId}`);
        } else {
          console.warn(`⚠️ Texte vide après extraction pages pour CG ${entryId}, embedding non mis à jour`);
        }
      } catch (e) {
        console.error(`❌ Vectorisation CG ${entryId} échouée:`, e);
      }
    })().catch(err => console.error('❌ Erreur async vectorisation:', err));
  } catch (err) {
    console.error('❌ Erreur POST /central-cg:', err);
    const errorMessage = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ message: 'Erreur lors de la sauvegarde de la CG', error: errorMessage });
  }
});

/**
 * Route GET /api/policies/central-cg/:id/vectorization-status
 * Retourne le statut de vectorisation d'une CG (pending/processing/done/failed/partial).
 * Permet au frontend de suivre la progression de l'indexation en temps réel.
 */
router.get('/central-cg/:id/vectorization-status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

    const result = await query(
      `SELECT
        cg.id,
        cg.vectorization_status,
        cg.pages_total,
        cg.pages_processed,
        cg.tables_extracted,
        cg.vectorized_at,
        cg.vectorization_error,
        COUNT(p.id) AS pages_count,
        COUNT(cf.id) AS facts_count
       FROM central_cg cg
       LEFT JOIN central_cg_pages p ON p.central_cg_id = cg.id
       LEFT JOIN coverage_facts cf ON cf.central_cg_id = cg.id
       WHERE cg.id = $1
       GROUP BY cg.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'CG not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      status: row.vectorization_status || (row.pages_count > 0 ? 'done' : 'pending'),
      pagesTotal: row.pages_total || 0,
      pagesProcessed: row.pages_processed || parseInt(row.pages_count) || 0,
      tablesExtracted: row.tables_extracted || 0,
      factsCount: parseInt(row.facts_count) || 0,
      vectorizedAt: row.vectorized_at,
      error: row.vectorization_error || null
    });
  } catch (err) {
    console.error('❌ Error in GET /central-cg/:id/vectorization-status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route POST /api/policies/central-cg/:id/reprocess
 * Relance la vectorisation d'un CG central existant (utile si le PDF était absent lors de la création).
 * Utilise le pdf_base64 ou pdf_file_path déjà stocké en DB.
 */
router.post('/central-cg/:id/reprocess', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });

    // Vérifications préliminaires
    const cgCheck = await query(
      `SELECT id, insurer_code, source_url, pdf_base64, pdf_file_path, vectorization_status
       FROM central_cg WHERE id = $1`,
      [id]
    );
    if (cgCheck.rows.length === 0) {
      return res.status(404).json({ message: `CG ${id} introuvable` });
    }

    const cg = cgCheck.rows[0];

    // Si aucun PDF disponible, tenter u téléchargement depuis source_url
    let pdfBase64: string | null = cg.pdf_base64 || null;

    if (!pdfBase64 && cg.pdf_file_path) {
      try {
        const fullPath = path.join(PDF_STORAGE_DIR, cg.pdf_file_path);
        if (fs.existsSync(fullPath)) {
          pdfBase64 = fs.readFileSync(fullPath).toString('base64');
          console.log(`✅ PDF lu depuis disque: ${fullPath}`);
        }
      } catch (diskErr) {
        console.warn(`⚠️ Impossible de lire PDF disque:`, diskErr);
      }
    }

    if (!pdfBase64 && cg.source_url) {
      try {
        console.log(`📥 Téléchargement PDF depuis: ${cg.source_url}`);
        const https = await import('https');
        const http = await import('http');
        const fetchModule = cg.source_url.startsWith('https') ? https : http;
        pdfBase64 = await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          fetchModule.get(cg.source_url, (resp) => {
            if (resp.statusCode !== 200) return reject(new Error(`HTTP ${resp.statusCode}`));
            resp.on('data', (chunk: Buffer) => chunks.push(chunk));
            resp.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
          }).on('error', reject);
        });
        await query('UPDATE central_cg SET pdf_base64 = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [pdfBase64, id]);
        console.log(`✅ PDF téléchargé et stocké pour CG ${id}`);
      } catch (downloadErr) {
        console.error(`❌ Échec téléchargement PDF pour CG ${id}:`, downloadErr);
        return res.status(422).json({ message: `Aucun PDF disponible et téléchargement échoué: ${(downloadErr as Error).message}` });
      }
    }

    if (!pdfBase64) {
      return res.status(422).json({ message: `Impossible de retraiter CG ${id}: aucun PDF disponible` });
    }

    // Réponse immédiate — traitement en arrière-plan
    res.json({ message: `Retraitement du CG ${id} lancé en arrière-plan`, status: 'processing' });

    (async () => {
      try {
        const pageResult = await vectorizeCgByPages(pool, id, cg.source_url || '', pdfBase64!);
        console.log(`✅ Retraitement page par page OK pour CG ${id}:`, pageResult);

        const textResult = await query(
          `SELECT COALESCE(string_agg(content_text, E'\n\n' ORDER BY page_number), '') AS full_text
           FROM central_cg_pages WHERE central_cg_id = $1`,
          [id]
        );
        const fullText = textResult.rows[0]?.full_text || '';
        await query('UPDATE central_cg SET content_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [fullText, id]);

        if (fullText.trim().length > 0) {
          await storage.vectorizeCentralCg(id, fullText);
          console.log(`✅ Embedding mis à jour pour CG ${id} après retraitement`);
        } else {
          console.warn(`⚠️ Texte vide après retraitement pour CG ${id}`);
        }
      } catch (e) {
        console.error(`❌ Erreur retraitement CG ${id}:`, e);
      }
    })().catch(err => console.error('❌ Erreur async reprocess:', err));
  } catch (err) {
    console.error('❌ Erreur POST /central-cg/:id/reprocess:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route POST /api/policies/central-cg/:id/stop-vectorization
 * Arrête proprement une vectorisation en cours pour un CG donné.
 */
router.post('/central-cg/:id/stop-vectorization', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  requestStopVectorization(id);
  console.log(`⛔ Stop vectorisation demandé pour CG ${id}`);
  res.json({ message: `Arrêt de la vectorisation du CG ${id} demandé.` });
});

/**
 * Route DELETE /api/policies/central-cg/:id
 * Suppression d'une entrée du référentiel central par son ID.
 * Accès restreint aux administrateurs.
 */
router.delete('/central-cg/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCentralCgEntry(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/policies/central-cg/search
 * Recherche d'une CG dans le référentiel par correspondance de nom, assureur et type.
 * Utilisé pour vérifier si une CG existe déjà avant d'uploader un document.
 * Retourne null si aucune correspondance n'est trouvée.
 */
router.get('/central-cg/search', async (req, res) => {
  try {
    const { provider, name, type } = req.query;
    
    // Vérification des paramètres requis
    if (!provider || !name || !type) {
      return res.json(null);
    }
    
    const entries = await storage.readCentralCg();
    
    // Normalisation pour recherche insensible à la casse
    const p = (provider as string).toLowerCase().trim();
    const n = (name as string).toLowerCase().trim();
    
    // Recherche par correspondance partielle sur l'insurer et le nom
    const found = entries.find((entry: any) => 
      entry.insurer.toLowerCase().includes(p) && 
      (entry.productName.toLowerCase().includes(n) || n.includes(entry.productName.toLowerCase())) &&
      entry.metadata?.type === type
    );
    
    res.json(found || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Génère un identifiant unique pour une police ou une entrée CG.
 * Utilise crypto.randomUUID() si disponible (Node.js 15+),
 * sinon génère un ID basé sur le timestamp et un nombre aléatoire.
 * @returns Identifiant unique sous forme de chaîne
 */
function cryptoId() {
  return (globalThis as any).crypto?.randomUUID 
    ? (globalThis as any).crypto.randomUUID() 
    : Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

export default router;