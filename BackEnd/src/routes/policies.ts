import { Router } from 'express';
import multer from 'multer';
import { storage } from '../storage';
import { summarizePolicy, searchPolicyInfo, detectDuplicates } from '../services/geminiService';
import { query } from '../db';
import pool from '../db';
import { vectorizeCgByPages, requestStopVectorization } from '../services/pageVectorizationService';

// -----------------------------------------------------------------------------
// Routes /policies
// - Gestion des polices/contrats : création, lecture, mise à jour, suppression.
// - Supporte l'upload de fichier (multipart/form-data) ou l'envoi direct
//   de `fileData` encodé en base64 (utile pour l'API depuis le client).
// -----------------------------------------------------------------------------

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

/**
 * Route GET /api/policies
 * Liste toutes les polices d'assurance.
 * Si le paramètre query ?userId=xxx est fourni, filtre les polices pour cet utilisateur uniquement.
 * Sinon, retourne toutes les polices (utile pour l'admin).
 */
router.get('/', async (req: any, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const policies = await storage.readPolicies(userId ? parseInt(userId) : undefined);
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
router.post('/', upload.single('file'), async (req: any, res) => {
  try {
    const body = req.body;

    // Validation du userId : doit être un entier valide
    const userId = body.userId ? parseInt(body.userId) : null;
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Valid userId is required' });
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
router.put('/:id', upload.single('file'), async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const policies = await storage.readPolicies();
    
    // Recherche de la police à modifier
    const existing = policies.find((p: any) => p.id === id);
    if (!existing) return res.status(404).json({ message: 'Not found' });
    
    const body = req.body;

    // Mise à jour des propriétés de base
    if (body.name) existing.metadata.name = body.name;
    if (body.insurer) existing.insurer = body.insurer;
    if (body.type) existing.type = body.type;
    if (body.coverageDetail) existing.metadata.coverageDetail = body.coverageDetail;
    if (body.options) existing.metadata.options = body.options;
    if (body.sourceUrl) existing.documentUrl = body.sourceUrl;
    if (body.summary) existing.metadata.summary = body.summary;
    if (body.annualPremium !== undefined) existing.premium = body.annualPremium;
    if (body.isInternalSource !== undefined) existing.metadata.isInternalSource = body.isInternalSource;

    // Si un nouveau fichier est uploadé via multipart
    if (req.file) {
      existing.documentData = req.file.buffer.toString('base64');
      existing.metadata.fileName = req.file.originalname;
      existing.metadata.mimeType = req.file.mimetype;
      try { existing.metadata.summary = await summarizePolicy(existing.documentData, existing.metadata.mimeType); } catch (e) {}
    } 
    // Si un nouveau fichier est fourni en base64
    else if (body.fileData && body.fileName) {
      existing.documentData = body.fileData;
      existing.metadata.fileName = body.fileName;
      existing.metadata.mimeType = body.mimeType || existing.metadata.mimeType;
      if (!existing.metadata.summary) {
        try { existing.metadata.summary = await summarizePolicy(existing.documentData, existing.metadata.mimeType); } catch (e) {}
      }
    }

    // Sauvegarde des modifications
    await storage.writePolicy(existing);
    res.json(existing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route DELETE /api/policies/:id
 * Suppression d'une police d'assurance par son ID.
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // La suppression se fait directement dans PostgreSQL via DELETE
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
router.post('/central-cg', async (req, res) => {
  try {
    console.log('📥 Réception POST /central-cg, body:', JSON.stringify({...req.body, pdfData: req.body.pdfData ? '[PDF DATA]' : undefined}, null, 2));
    
    // Extraction des champs
    const { 
      insurerCode,
      productName,
      insuranceTypeCode,
      version,
      type,
      url,
      targetFilename,
      pdfData,
      metadata
    } = req.body;
    
    console.log('📋 Champs extraits:', { 
      insurerCode, 
      productName, 
      insuranceTypeCode,
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
      version: version || null,
      type: type || 'CG',
      owner: `user_${userId}`,
      detail: null,
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