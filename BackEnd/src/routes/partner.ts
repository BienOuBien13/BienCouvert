/**
 * Routes Partenaire — /api/partner
 * Accessible uniquement aux utilisateurs avec is_partner = TRUE
 *
 * GET  /api/partner/rdv-requests       — liste des demandes de RDV (toutes ou non assignées)
 * POST /api/partner/assign             — prendre en charge un dossier (rdvId)
 * GET  /api/partner/my-assignments     — mes dossiers assignés
 * GET  /api/partner/client/:email      — profil complet d'un client (policies + profil)
 */

import { Router } from 'express';
import { query } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

async function partnerMiddleware(req: any, res: any, next: any) {
  try {
    const result = await query('SELECT is_partner FROM users WHERE id = $1', [req.user?.id]);
    if (!result.rows[0]?.is_partner) {
      return res.status(403).json({ message: 'Accès réservé aux partenaires' });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Server error' });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/partner/rdv-requests
 * Liste toutes les demandes de RDV avec le statut d'assignation.
 */
router.get('/rdv-requests', authMiddleware, partnerMiddleware, async (_req: any, res) => {
  try {
    const result = await query(`
      SELECT
        r.id,
        r.user_email,
        r.phone,
        r.day,
        r.slot,
        r.policies,
        r.created_at,
        r.email_sent,
        u.first_name,
        u.last_name,
        pa.id            AS assignment_id,
        pa.partner_id,
        pa.assigned_at,
        pa.status        AS assignment_status,
        pu.first_name    AS partner_first_name,
        pu.last_name     AS partner_last_name
      FROM rdv_requests r
      LEFT JOIN users          u  ON u.email  = r.user_email
      LEFT JOIN partner_assignments pa ON pa.rdv_id  = r.id
      LEFT JOIN users          pu ON pu.id    = pa.partner_id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /partner/rdv-requests:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/partner/assign
 * Body: { rdvId: number, notes?: string }
 * Prend en charge (ou reprend) un dossier RDV.
 */
router.post('/assign', authMiddleware, partnerMiddleware, async (req: any, res) => {
  const { rdvId, notes } = req.body;
  const partnerId = req.user?.id;
  if (!rdvId) return res.status(400).json({ message: 'rdvId requis' });

  try {
    // Récupère l'email client depuis rdv_requests
    const rdv = await query('SELECT user_email FROM rdv_requests WHERE id = $1', [rdvId]);
    if (!rdv.rows[0]) return res.status(404).json({ message: 'Demande de RDV introuvable' });
    const clientEmail = rdv.rows[0].user_email;

    const result = await query(`
      INSERT INTO partner_assignments (partner_id, rdv_id, client_email, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (rdv_id) DO UPDATE
        SET partner_id  = EXCLUDED.partner_id,
            assigned_at = NOW(),
            status      = 'assigned',
            notes       = COALESCE(EXCLUDED.notes, partner_assignments.notes)
      RETURNING *
    `, [partnerId, rdvId, clientEmail, notes || null]);

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('POST /partner/assign:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/partner/assignment/:id/status
 * Body: { status: 'assigned' | 'contacted' | 'completed' | 'cancelled', notes?: string }
 */
router.patch('/assignment/:id/status', authMiddleware, partnerMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const partnerId = req.user?.id;
  const allowed = ['assigned', 'contacted', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Statut invalide' });

  try {
    const result = await query(`
      UPDATE partner_assignments
      SET status = $1, notes = COALESCE($2, notes)
      WHERE id = $3 AND partner_id = $4
      RETURNING *
    `, [status, notes || null, id, partnerId]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Assignation introuvable' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('PATCH /partner/assignment:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/partner/my-assignments
 * Liste les dossiers assignés au partenaire connecté.
 */
router.get('/my-assignments', authMiddleware, partnerMiddleware, async (req: any, res) => {
  try {
    const result = await query(`
      SELECT
        pa.*,
        r.day, r.slot, r.phone, r.policies, r.created_at AS rdv_created_at,
        u.first_name, u.last_name, u.email
      FROM partner_assignments pa
      JOIN rdv_requests r ON r.id = pa.rdv_id
      LEFT JOIN users u ON u.email = pa.client_email
      WHERE pa.partner_id = $1
      ORDER BY pa.assigned_at DESC
    `, [req.user?.id]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /partner/my-assignments:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/partner/client/:email
 * Profil synthétique complet d'un client : user info + policies + RDV requests.
 * Restreint : le partenaire doit avoir une assignation active pour ce client.
 */
router.get('/client/:email', authMiddleware, partnerMiddleware, async (req: any, res) => {
  const email = decodeURIComponent(req.params.email);
  const partnerId = req.user.id;

  try {
    // Vérifier que ce partenaire a une assignation pour ce client
    const assignmentCheck = await query(
      `SELECT pa.id FROM partner_assignments pa WHERE pa.partner_id = $1 AND pa.client_email = $2 LIMIT 1`,
      [partnerId, email]
    );
    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Accès refusé : aucune assignation pour ce client' });
    }

    // Infos utilisateur
    const userResult = await query(
      `SELECT id, email, first_name, last_name, profile FROM users WHERE email = $1`,
      [email]
    );
    if (!userResult.rows[0]) return res.status(404).json({ message: 'Client non trouvé' });
    const usr = userResult.rows[0];

    // Contrats
    const policiesResult = await query(`
      SELECT
        p.id, p.metadata, p.insurer_code, p.insurance_type_code,
        p.created_at,
        COALESCE(i.label, p.metadata->>'insurer_label')  AS insurer_label,
        i.logo_url                                        AS insurer_logo,
        COALESCE(it.label_fr, p.metadata->>'insurance_type_name') AS type_label
      FROM policies p
      LEFT JOIN insurers       i  ON i.code  = p.insurer_code
      LEFT JOIN insurance_types it ON it.code = p.insurance_type_code
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [usr.id]);

    // Demandes de RDV
    const rdvResult = await query(`
      SELECT r.*, pa.partner_id, pa.assigned_at, pa.status AS assignment_status
      FROM rdv_requests r
      LEFT JOIN partner_assignments pa ON pa.rdv_id = r.id
      WHERE r.user_email = $1
      ORDER BY r.created_at DESC
    `, [email]);

    res.json({
      user: {
        id:        usr.id,
        email:     usr.email,
        firstName: usr.first_name,
        lastName:  usr.last_name,
        profile:   usr.profile ? JSON.parse(usr.profile) : {}
      },
      policies:    policiesResult.rows,
      rdvRequests: rdvResult.rows
    });
  } catch (err: any) {
    console.error('GET /partner/client:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
