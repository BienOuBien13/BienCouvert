import { Router } from 'express';
import { sendRdvNotificationEmail } from '../services/emailService';

// -----------------------------------------------------------------------------
// Routes de contact / prise de RDV expert
// POST /api/contact/rdv — Enregistre une demande de rappel et envoie les emails
// CSRF appliqué dans index.ts
// -----------------------------------------------------------------------------

const router = Router();

router.post('/rdv', async (req: any, res) => {
  const { phone, day, slot, policies, userEmail } = req.body;

  if (!phone || !day || !slot) {
    return res.status(400).json({ message: 'Champs requis : phone, day, slot' });
  }

  try {
    await sendRdvNotificationEmail({ phone, day, slot, policies: policies || [], userEmail });
    console.log(`📞 Demande de RDV enregistrée — ${phone} (${day} / ${slot})`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('❌ Erreur envoi email RDV:', err.message);
    // On retourne quand même OK pour ne pas bloquer l'UX
    res.json({ ok: true, emailError: err.message });
  }
});

export default router;
