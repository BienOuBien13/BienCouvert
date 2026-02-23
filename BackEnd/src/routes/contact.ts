import { Router } from 'express';
import { sendRdvNotificationEmail } from '../services/emailService';
import { query } from '../db';

// -----------------------------------------------------------------------------
// Routes de contact / prise de RDV expert
// POST /api/contact/rdv — Persiste en DB, envoie les emails
// CSRF appliqué dans index.ts
// -----------------------------------------------------------------------------

const router = Router();

router.post('/rdv', async (req: any, res) => {
  const { phone, day, slot, policies, userEmail } = req.body;

  if (!phone || !day || !slot) {
    return res.status(400).json({ message: 'Champs requis : phone, day, slot' });
  }

  let emailSent = false;
  let emailError: string | null = null;

  // Tenter l'envoi email
  try {
    await sendRdvNotificationEmail({ phone, day, slot, policies: policies || [], userEmail });
    emailSent = true;
    console.log(`📞 RDV envoyé par email — ${phone} (${day} / ${slot})`);
  } catch (err: any) {
    emailError = err.message;
    console.error('❌ Erreur envoi email RDV:', err.message);
  }

  // Persister la demande en DB (même si l'email a échoué)
  try {
    const result = await query(
      `INSERT INTO rdv_requests (user_email, phone, day, slot, policies, email_sent, email_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userEmail || null, phone, day, slot, policies || [], emailSent, emailError]
    );
    const rdvId = result.rows[0]?.id;
    console.log(`✅ RDV #${rdvId} persisté en base`);
    res.json({ ok: true, id: rdvId });
  } catch (dbErr: any) {
    console.error('❌ Erreur persistence RDV:', dbErr.message);
    // Retourner ok même si la DB échoue pour ne pas bloquer l'UX
    res.json({ ok: true, emailSent });
  }
});

export default router;
