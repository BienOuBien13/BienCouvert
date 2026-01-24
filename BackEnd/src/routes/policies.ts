import { Router } from 'express';
import multer from 'multer';
import { storage } from '../storage';
import { summarizePolicy, searchPolicyInfo, detectDuplicates } from '../services/geminiService';

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

    // Validation minimale côté serveur : au moins un nom ou un document
    if (!body.name && !req.file && !(body.fileData && body.fileName)) {
      return res.status(400).json({ message: 'Missing required fields (name or file)' });
    }

    // Validation du userId : doit être un entier valide
    const userId = body.userId ? parseInt(body.userId) : null;
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Valid userId is required' });
    }

    // Construction de l'objet police avec toutes les propriétés nécessaires
    const newPolicy: any = {
      userId: userId,                                   // ID de l'utilisateur propriétaire (INTEGER requis)
      policyNumber: body.policyNumber || `POL-${Date.now()}`,  // Génère un numéro si absent
      insurer: body.provider || body.insurer || 'Non spécifié',  // Assureur (requis)
      type: body.type || 'Autre',                       // Type d'assurance (requis)
      premium: body.annualPremium ? parseFloat(body.annualPremium) : null,  // Prime annuelle en €
      coverage: body.coverage ? parseFloat(body.coverage) : null,  // Montant couverture
      startDate: body.startDate || new Date().toISOString().split('T')[0],  // Date de début
      endDate: body.endDate || null,                    // Date de fin
      status: body.status || 'active',                  // Statut (active par défaut)
      documentUrl: body.sourceUrl || null,              // URL source si provient du web
      documentData: null,                               // Document en base64 (rempli plus bas)
      metadata: {
        name: body.name || 'Contrat sans nom',
        fileName: null,
        mimeType: body.mimeType || 'text/html',
        coverageDetail: body.coverageDetail || null,
        options: body.options || [],
        summary: body.summary || null,
        isInternalSource: body.isInternalSource || false
      }
    };

    // --- Mode 1 : Upload via multipart/form-data (fichier reçu par multer) ---
    if (req.file) {
      newPolicy.documentData = req.file.buffer.toString('base64');
      newPolicy.metadata.fileName = req.file.originalname;
      newPolicy.metadata.mimeType = req.file.mimetype;
      
      // Tentative de génération d'un résumé via l'IA
      try {
        newPolicy.metadata.summary = await summarizePolicy(newPolicy.documentData, newPolicy.metadata.mimeType);
      } catch (e) {
        console.warn('Résumé automatique échoué pour upload de fichier', e);
      }
    } 
    // --- Mode 2 : Upload JSON avec base64 ---
    else if (body.fileData && body.fileName) {
      newPolicy.documentData = body.fileData;
      newPolicy.metadata.fileName = body.fileName;
      newPolicy.metadata.mimeType = body.mimeType || newPolicy.metadata.mimeType;
      
      if (!newPolicy.metadata.summary) {
        try { 
          newPolicy.metadata.summary = await summarizePolicy(newPolicy.documentData, newPolicy.metadata.mimeType); 
        } catch (e) { 
          console.warn('Résumé automatique échoué pour fileData', e); 
        }
      }
    }

    // Insertion dans PostgreSQL
    const policyId = await storage.writePolicy(newPolicy);
    newPolicy.id = policyId;
    
    // Vectorisation automatique si PDF présent
    if (newPolicy.documentData && newPolicy.metadata.mimeType === 'application/pdf') {
      try {
        // Extraire le texte du PDF avec Gemini
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: newPolicy.documentData
            }
          },
          "Extrais tout le texte de ce document PDF en français, mot pour mot, sans résumé."
        ]);
        
        const pdfText = result.response.text();
        await storage.vectorizePolicyPdf(policyId, pdfText);
        console.log(`✅ PDF vectorisé pour policy ${policyId}`);
      } catch (e) {
        console.warn('⚠️ Vectorisation PDF échouée:', e);
      }
    }
    
    res.json(newPolicy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
    if (body.provider || body.insurer) existing.insurer = body.provider || body.insurer;
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
        e.metadata?.type?.toLowerCase() === requestedType
      );
    }
    if (req.query.insurer) {
      const requestedInsurer = (req.query.insurer as string).toLowerCase();
      filtered = filtered.filter((e: any) => 
        e.insurer.toLowerCase().includes(requestedInsurer)
      );
    }
    
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route POST /api/policies/central-cg
 * Ajout d'une nouvelle entrée au référentiel central des CG.
 * Permet d'indexer un nouveau document CG avec ses métadonnées.
 */
router.post('/central-cg', async (req, res) => {
  try {
    const { provider, policyName, type, pdfUrl, indexedFormulas, indexedOptions, semanticSummary } = req.body;
    
    // Validation des champs obligatoires
    if (!provider || !policyName || !type || !pdfUrl) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Création de la nouvelle entrée
    const newEntry: any = {
      insurer: provider,
      productName: policyName,
      version: null,
      documentUrl: pdfUrl,
      documentHash: null,
      contentText: null,
      embedding: null,
      metadata: {
        lastVerified: Date.now(),
        indexedFormulas: indexedFormulas || [],
        indexedOptions: indexedOptions || [],
        semanticSummary: semanticSummary || '',
        type
      }
    };
    
    const entryId = await storage.writeCentralCgEntry(newEntry);
    newEntry.id = entryId;
    
    // Vectorisation automatique du PDF
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      // Télécharger et extraire le texte du PDF
      const response = await fetch(pdfUrl);
      const arrayBuffer = await response.arrayBuffer();
      const pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
      
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        "Extrais tout le texte de ce document PDF en français, mot pour mot, sans résumé."
      ]);
      
      const pdfText = result.response.text();
      
      // Stocker le texte et vectoriser
      const { query } = require('../db');
      await query(
        'UPDATE central_cg SET content_text = $1 WHERE id = $2',
        [pdfText, entryId]
      );
      
      await storage.vectorizeCentralCg(entryId, pdfText);
      console.log(`✅ CG ${entryId} vectorisée`);
    } catch (e) {
      console.warn('⚠️ Vectorisation CG échouée:', e);
    }
    
    res.json(newEntry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
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
    
    // Recherche par correspondance partielle sur le provider et le nom
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