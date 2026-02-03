import { Router } from 'express';
import { masterDataService } from '../services/masterDataService';

const router = Router();

/**
 * Route GET /api/masterdata/insurance-types
 * Récupère la liste de tous les types d'assurances disponibles
 */
router.get('/insurance-types', async (req, res) => {
  try {
    const types = await masterDataService.getInsuranceTypes();
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
    const insurers = await masterDataService.getInsurers();
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

export default router;
