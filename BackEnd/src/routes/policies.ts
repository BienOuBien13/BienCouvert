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
router.get('/', (req: any, res) => {
  const userId = req.query.userId as string | undefined;
  const policies = storage.readPolicies();
  // Filtrage conditionnel par userId si fourni
  if (userId) return res.json(policies.filter((p: any) => p.userId === userId));
  res.json(policies);
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
    // (Le frontend effectue une validation plus stricte selon le mode de saisie)
    if (!body.name && !req.file && !(body.fileData && body.fileName)) {
      return res.status(400).json({ message: 'Missing required fields (name or file)' });
    }

    // Lecture du stockage actuel des polices
    const policies = storage.readPolicies();

    // Construction de l'objet police avec toutes les propriétés nécessaires
    const newPolicy: any = {
      id: cryptoId(),                                    // Génération d'un UUID unique
      userId: body.userId || 'anonymous',               // ID de l'utilisateur propriétaire
      name: body.name,                                  // Nom de la police
      provider: body.provider,                          // Assureur
      type: body.type,                                  // Type d'assurance
      coverageDetail: body.coverageDetail || undefined, // Formule (Tiers, Tous Risques, etc.)
      options: body.options || [],                      // Options souscrites
      fileData: null,                                   // Document en base64 (rempli plus bas)
      fileName: null,                                   // Nom du fichier (rempli plus bas)
      mimeType: body.mimeType || 'text/html',          // Type MIME du document
      sourceUrl: body.sourceUrl || undefined,          // URL source si provient du web
      summary: body.summary || undefined,              // Résumé (généré plus bas si absent)
      addedAt: Date.now(),                             // Timestamp de création
      annualPremium: body.annualPremium || undefined,  // Prime annuelle en €
      isInternalSource: body.isInternalSource || false // Provient du référentiel CG ?
    };

    // --- Mode 1 : Upload via multipart/form-data (fichier reçu par multer) ---
    if (req.file) {
      // Encodage du buffer du fichier en base64 pour stockage JSON
      newPolicy.fileData = req.file.buffer.toString('base64');
      newPolicy.fileName = req.file.originalname;
      newPolicy.mimeType = req.file.mimetype;
      
      // Tentative de génération d'un résumé via l'IA (service Gemini)
      // En cas d'échec, on continue sans bloquer la création
      try {
        newPolicy.summary = await summarizePolicy(newPolicy.fileData, newPolicy.mimeType);
      } catch (e) {
        console.warn('Résumé automatique échoué pour upload de fichier', e);
      }
    } 
    // --- Mode 2 : Upload JSON avec base64 (utilisé par le frontend React) ---
    else if (body.fileData && body.fileName) {
      newPolicy.fileData = body.fileData;
      newPolicy.fileName = body.fileName;
      newPolicy.mimeType = body.mimeType || newPolicy.mimeType;
      
      // Génération du résumé si pas déjà fourni
      if (!newPolicy.summary) {
        try { 
          newPolicy.summary = await summarizePolicy(newPolicy.fileData, newPolicy.mimeType); 
        } catch (e) { 
          console.warn('Résumé automatique échoué pour fileData', e); 
        }
      }
    }

    // Ajout de la nouvelle police au tableau et sauvegarde
    policies.push(newPolicy);
    storage.writePolicies(policies);
    res.json(newPolicy);
  } catch (err) {
    console.error(err);
    // Erreur serveur générale
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
  const id = req.params.id;
  const policies = storage.readPolicies();
  
  // Recherche de la police à modifier
  const idx = policies.findIndex((p: any) => p.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  
  const existing = policies[idx];
  const body = req.body;

  // Mise à jour des propriétés de base (ne modifie que les champs fournis)
  existing.name = body.name || existing.name;
  existing.provider = body.provider || existing.provider;
  existing.type = body.type || existing.type;
  existing.coverageDetail = body.coverageDetail || existing.coverageDetail;
  existing.options = body.options || existing.options;
  existing.sourceUrl = body.sourceUrl || existing.sourceUrl;
  existing.summary = body.summary || existing.summary;
  existing.annualPremium = body.annualPremium !== undefined ? body.annualPremium : existing.annualPremium;
  existing.isInternalSource = body.isInternalSource !== undefined ? body.isInternalSource : existing.isInternalSource;

  // Si un nouveau fichier est uploadé via multipart
  if (req.file) {
    existing.fileData = req.file.buffer.toString('base64');
    existing.fileName = req.file.originalname;
    existing.mimeType = req.file.mimetype;
    // Regénération du résumé pour le nouveau document
    try { existing.summary = await summarizePolicy(existing.fileData, existing.mimeType); } catch (e) {}
  } 
  // Si un nouveau fichier est fourni en base64
  else if (body.fileData && body.fileName) {
    existing.fileData = body.fileData;
    existing.fileName = body.fileName;
    existing.mimeType = body.mimeType || existing.mimeType;
    if (!existing.summary) {
      try { existing.summary = await summarizePolicy(existing.fileData, existing.mimeType); } catch (e) {}
    }
  }

  // Sauvegarde des modifications
  policies[idx] = existing;
  storage.writePolicies(policies);
  res.json(existing);
});

/**
 * Route DELETE /api/policies/:id
 * Suppression d'une police d'assurance par son ID.
 */
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const policies = storage.readPolicies();
  // Filtrage : on garde toutes les polices sauf celle à supprimer
  const newPolicies = policies.filter((p: any) => p.id !== id);
  storage.writePolicies(newPolicies);
  res.json({ ok: true });
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
 */
router.get('/central-cg', (req, res) => {
  const entries = storage.readCentralCg();
  res.json(entries);
});

/**
 * Route POST /api/policies/central-cg
 * Ajout d'une nouvelle entrée au référentiel central des CG.
 * Permet d'indexer un nouveau document CG avec ses métadonnées.
 */
router.post('/central-cg', (req, res) => {
  const { provider, policyName, type, pdfUrl, indexedFormulas, indexedOptions, semanticSummary } = req.body;
  
  // Validation des champs obligatoires
  if (!provider || !policyName || !type || !pdfUrl) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const entries = storage.readCentralCg();
  // Création de la nouvelle entrée avec génération de l'ID et du timestamp
  const newEntry: any = {
    id: cryptoId(),                               // UUID unique
    provider,                                     // Nom de l'assureur
    policyName,                                   // Nom du produit
    type,                                         // Type d'assurance
    pdfUrl,                                       // URL du document PDF
    lastVerified: Date.now(),                     // Timestamp de vérification
    indexedFormulas: indexedFormulas || [],       // Formules indexées (Tiers, Tous Risques, etc.)
    indexedOptions: indexedOptions || [],         // Options indexées
    semanticSummary: semanticSummary || ''        // Résumé pour recherche sémantique
  };
  
  entries.push(newEntry);
  storage.writeCentralCg(entries);
  res.json(newEntry);
});

/**
 * Route DELETE /api/policies/central-cg/:id
 * Suppression d'une entrée du référentiel central par son ID.
 * Accès restreint aux administrateurs.
 */
router.delete('/central-cg/:id', (req, res) => {
  const id = req.params.id;
  const entries = storage.readCentralCg();
  const filtered = entries.filter((e: any) => e.id !== id);
  storage.writeCentralCg(filtered);
  res.json({ ok: true });
});

/**
 * Route GET /api/policies/central-cg/search
 * Recherche d'une CG dans le référentiel par correspondance de nom, assureur et type.
 * Utilisé pour vérifier si une CG existe déjà avant d'uploader un document.
 * Retourne null si aucune correspondance n'est trouvée.
 */
router.get('/central-cg/search', (req, res) => {
  const { provider, name, type } = req.query;
  const entries = storage.readCentralCg();
  
  // Vérification des paramètres requis
  if (!provider || !name || !type) {
    return res.json(null);
  }
  
  // Normalisation pour recherche insensible à la casse
  const p = (provider as string).toLowerCase().trim();
  const n = (name as string).toLowerCase().trim();
  
  // Recherche par correspondance partielle sur le provider et le nom
  const found = entries.find((entry: any) => 
    entry.provider.toLowerCase().includes(p) && 
    (entry.policyName.toLowerCase().includes(n) || n.includes(entry.policyName.toLowerCase())) &&
    entry.type === type
  );
  
  res.json(found || null);
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