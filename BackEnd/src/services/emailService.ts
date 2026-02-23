import nodemailer from 'nodemailer';
import https from 'https';

// -----------------------------------------------------------------------------
// Service d'envoi d'emails — SMTP Zoho (contact@biencouvert.fr)
// Fallback webhook Slack/Teams si SMTP indisponible (SLACK_WEBHOOK_URL)
// -----------------------------------------------------------------------------

const SMTP_FROM = 'BienCouvert <contact@biencouvert.fr>';

/**
 * Transporter Zoho.
 * Configurable via env :
 *   SMTP_HOST — défaut : smtp.zoho.com  (EU : smtp.zoho.eu)
 *   SMTP_PORT — défaut : 465
 *   SMTP_SECURE — défaut : true (SSL).  Mettre false pour STARTTLS (587)
 */
function createTransporter() {
  const host   = process.env.SMTP_HOST   || 'smtp.zoho.com';
  const port   = parseInt(process.env.SMTP_PORT   || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false'; // true par défaut
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** Envoie une notification webhook (Slack/Teams) en fallback SMTP */
async function notifyWebhook(subject: string, body: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const payload = JSON.stringify({ text: `*${subject}*\n${body}` });
    await new Promise<void>((resolve, reject) => {
      const url = new URL(webhookUrl);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
        (res) => { res.resume(); resolve(); }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    console.log('📣 Notification webhook envoyée');
  } catch (e: any) {
    console.warn('⚠️  Webhook échoué:', e.message);
  }
}

/** Vérifie la connexion SMTP au démarrage */
export async function verifySmtpConnection(): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  SMTP non configuré (SMTP_USER/SMTP_PASS manquants) — emails désactivés');
    return;
  }
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ SMTP Zoho connecté — contact@biencouvert.fr');
  } catch (err: any) {
    console.warn('⚠️  SMTP non disponible (emails désactivés) :', err.message);
  }
}

// -----------------------------------------------------------------------------
// E-mail : vérification d'adresse email à l'inscription
// -----------------------------------------------------------------------------
export async function sendVerificationEmail(
  toEmail: string,
  verifyUrl: string,
  firstName: string
): Promise<void> {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: '✉️ Confirmez votre adresse email BienCouvert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">
        <div style="background: #2563eb; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 900;">BienCouvert</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Votre assistant assurance</p>
        </div>
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 8px;">Bienvenue ${firstName} ! Confirmez votre email</h2>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Pour finaliser votre inscription et sécuriser votre compte, cliquez sur le bouton ci-dessous.<br>
          <strong>Ce lien est valable 24 heures.</strong>
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verifyUrl}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; display: inline-block;">Confirmer mon email</a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 24px 0 0;">
          Si vous n'avez pas créé de compte sur BienCouvert, ignorez cet email.<br><br>
          <strong>BienCouvert</strong> — <a href="https://biencouvert.fr" style="color: #2563eb;">biencouvert.fr</a>
        </p>
      </div>
    `,
  });
}

// -----------------------------------------------------------------------------
// E-mail : réinitialisation de mot de passe
// -----------------------------------------------------------------------------
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<void> {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: '🔑 Réinitialisation de votre mot de passe BienCouvert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">
        <div style="background: #2563eb; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;">BienCouvert</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Votre assistant assurance</p>
        </div>

        <h2 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 8px;">Réinitialisation de mot de passe</h2>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.<br>
          <strong>Ce lien est valable 1 heure.</strong>
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="
            background: #2563eb;
            color: white;
            padding: 14px 32px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 800;
            font-size: 14px;
            letter-spacing: 0.5px;
            display: inline-block;
          ">Réinitialiser mon mot de passe</a>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 24px 0 0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. Votre mot de passe reste inchangé.<br><br>
          <strong>BienCouvert</strong> — <a href="https://biencouvert.fr" style="color: #2563eb;">biencouvert.fr</a>
        </p>
      </div>
    `,
    });
  } catch (err: any) {
    console.error('❌ SMTP sendPasswordResetEmail:', err.message);
    await notifyWebhook(
      '❌ Échec email reset mot de passe',
      `Email: ${toEmail}\nLien: ${resetUrl}\nErreur: ${err.message}`
    );
    throw err; // Propager pour que la route loggue correctement
  }
}

// -----------------------------------------------------------------------------
// E-mail : confirmation de demande de RDV expert
// Envoyé à l'équipe BienCouvert (contact@biencouvert.fr)
// -----------------------------------------------------------------------------
export async function sendRdvNotificationEmail(params: {
  phone: string;
  day: string;
  slot: string;
  policies: string[];
  userEmail?: string;
}): Promise<void> {
  const { phone, day, slot, policies, userEmail } = params;
  const transporter = createTransporter();

  const policyList =
    policies.length > 0
      ? `<ul style="margin:8px 0;padding-left:20px;color:#334155;font-size:13px;">${policies.map(p => `<li>${p}</li>`).join('')}</ul>`
      : '<p style="color:#94a3b8;font-size:13px;">Aucun contrat précisé</p>';

  // Notif interne vers l'équipe
  try {
    await transporter.sendMail({
    from: SMTP_FROM,
    to: 'contact@biencouvert.fr',
    subject: `📞 Nouveau rappel expert — ${phone}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">
        <div style="background: #0f172a; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 18px; font-weight: 900;">Nouvelle demande de rappel</h1>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#64748b;width:140px;">📱 Téléphone</td><td style="font-weight:700;color:#0f172a;">${phone}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">📅 Jour</td><td style="font-weight:700;color:#0f172a;">${day}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">⏰ Créneau</td><td style="font-weight:700;color:#0f172a;">${slot}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">📧 Compte</td><td style="font-weight:700;color:#0f172a;">${userEmail || 'Non connecté'}</td></tr>
        </table>

        <div style="margin-top:16px;">
          <p style="color:#64748b;font-size:13px;margin-bottom:4px;">Contrats concernés :</p>
          ${policyList}
        </div>
      </div>
    `,
    });
  } catch (err: any) {
    console.error('❌ SMTP notif RDV interne:', err.message);
    // Fallback webhook
    const lines = [
      `Tél: ${phone}`, `Jour: ${day}`, `Créneau: ${slot}`,
      `Compte: ${userEmail || 'N/A'}`,
      `Contrats: ${policies.join(', ') || 'Aucun'}`
    ].join('\n');
    await notifyWebhook('📞 Nouvelle demande de rappel expert', lines);
  }

  // Confirmation au client si email disponible
  if (userEmail) {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: userEmail,
      subject: '✅ Votre demande de rappel expert BienCouvert est confirmée',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">
          <div style="background: #2563eb; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 900;">BienCouvert</h1>
          </div>

          <h2 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 8px;">Demande de rappel confirmée ✅</h2>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            Un expert BienCouvert vous rappellera au <strong>${phone}</strong><br>
            Créneau : <strong>${day} (${slot})</strong>
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; text-align: center;">
            BienCouvert — <a href="https://biencouvert.fr" style="color: #2563eb;">biencouvert.fr</a><br>
            contact@biencouvert.fr
          </p>
        </div>
      `,
    });
  }
}
