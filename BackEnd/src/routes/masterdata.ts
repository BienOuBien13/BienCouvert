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

export default router;
