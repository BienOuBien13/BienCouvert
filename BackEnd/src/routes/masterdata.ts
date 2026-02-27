import { Router } from 'express';
import { masterDataService } from '../services/masterDataService';

const router = Router();

// Cache en mémoire pour les données statiques (5 minutes TTL)
const cache: Record<string, { data: any; expiresAt: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string) {
  const entry = cache[key];
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
}
function setCached(key: string, data: any) {
  cache[key] = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Route GET /api/masterdata/insurance-types
 * Récupère la liste de tous les types d'assurances disponibles
 */
router.get('/insurance-types', async (req, res) => {
  try {
    const cached = getCached('insurance-types');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const types = await masterDataService.getInsuranceTypes();
    setCached('insurance-types', types);
    res.setHeader('X-Cache', 'MISS');
    res.json(types);
  } catch (err) {
    console.error('Erreur GET /insurance-types:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/insurance-types/:code
 * Récupère un type d'assurance spécifique par son code
 */
router.get('/insurance-types/:code', async (req, res) => {
  try {
    const type = await masterDataService.getInsuranceTypeByCode(req.params.code as any);
    if (!type) {
      return res.status(404).json({ message: 'Type not found' });
    }
    res.json(type);
  } catch (err) {
    console.error('Erreur GET /insurance-types/:code:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/insurers
 * Récupère la liste de tous les assureurs disponibles
 */
router.get('/insurers', async (req, res) => {
  try {
    const cached = getCached('insurers');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const insurers = await masterDataService.getInsurers();
    setCached('insurers', insurers);
    res.setHeader('X-Cache', 'MISS');
    res.json(insurers);
  } catch (err) {
    console.error('Erreur GET /insurers:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/insurers/:code
 * Récupère un assureur spécifique par son code
 */
router.get('/insurers/:code', async (req, res) => {
  try {
    const insurer = await masterDataService.getInsurerByCode(req.params.code);
    if (!insurer) {
      return res.status(404).json({ message: 'Insurer not found' });
    }
    res.json(insurer);
  } catch (err) {
    console.error('Erreur GET /insurers/:code:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/insurers-by-type/:insuranceTypeCode
 * Récupère les assureurs disponibles pour un type d'assurance donné
 */
router.get('/insurers-by-type/:insuranceTypeCode', async (req, res) => {
  try {
    const insurers = await masterDataService.getInsurersByType(req.params.insuranceTypeCode);
    res.json(insurers);
  } catch (err) {
    console.error('Erreur GET /insurers-by-type/:insuranceTypeCode:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Sous-types d'assurance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route GET /api/masterdata/insurance-sub-types
 * Retourne tous les sous-types actifs.
 * Paramètre optionnel ?parentTypeCode=HABITATION pour filtrer par type parent.
 */
router.get('/insurance-sub-types', async (req, res) => {
  try {
    const parent = req.query.parentTypeCode as string | undefined;
    const cacheKey = `insurance-sub-types:${parent || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const subTypes = await masterDataService.getInsuranceSubTypes(parent);
    setCached(cacheKey, subTypes);
    res.setHeader('X-Cache', 'MISS');
    res.json(subTypes);
  } catch (err) {
    console.error('Erreur GET /insurance-sub-types:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/insurance-sub-types/:code
 * Récupère un sous-type spécifique par son code
 */
router.get('/insurance-sub-types/:code', async (req, res) => {
  try {
    const subType = await masterDataService.getInsuranceSubTypeByCode(req.params.code);
    if (!subType) {
      return res.status(404).json({ message: 'Sub-type not found' });
    }
    res.json(subType);
  } catch (err) {
    console.error('Erreur GET /insurance-sub-types/:code:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Types de documents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route GET /api/masterdata/document-types
 * Retourne tous les types de documents actifs (CG, NI, IPID, DIP, TABLEAU…)
 */
router.get('/document-types', async (req, res) => {
  try {
    const cached = getCached('document-types');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const docTypes = await masterDataService.getDocumentTypes();
    setCached('document-types', docTypes);
    res.setHeader('X-Cache', 'MISS');
    res.json(docTypes);
  } catch (err) {
    console.error('Erreur GET /document-types:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/masterdata/document-types/:code
 * Récupère un type de document spécifique par son code
 */
router.get('/document-types/:code', async (req, res) => {
  try {
    const docType = await masterDataService.getDocumentTypeByCode(req.params.code);
    if (!docType) {
      return res.status(404).json({ message: 'Document type not found' });
    }
    res.json(docType);
  } catch (err) {
    console.error('Erreur GET /document-types/:code:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
