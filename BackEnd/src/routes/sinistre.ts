import { Router, Request, Response } from 'express';
import { query } from '../db';
import { storage } from '../storage';
import { analyzeClaim, generateClaimLetter, chatClaim, ClaimContext, ChatMessage } from '../services/geminiService';
import { authMiddleware } from '../middleware/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Routes /api/sinistre — Assistant Sinistre BienCouvert
// Document-Driven Claim Assistant : qualification → analyse → plan → lettre
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// Appliquer authMiddleware à toutes les routes sinistre
router.use(authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mapSessionRow = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  policyId: row.policy_id,
  status: row.status,
  title: row.title,
  claimData: row.claim_data,
  analysis: row.analysis,
  actionPlan: row.action_plan,
  letterContent: row.letter_content,
  messages: row.messages || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sinistre/sessions
// Liste toutes les sessions sinistre de l'utilisateur authentifié
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sessions', async (req: any, res: Response) => {
  try {
    const userId = req.user.id; // toujours extrait du JWT
    const result = await query(
      `SELECT cs.*, p.metadata->>'name' AS policy_name,
              i.label AS insurer, p.type AS policy_type
       FROM claim_sessions cs
       LEFT JOIN policies p ON p.id = cs.policy_id
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE cs.user_id = $1
       ORDER BY cs.updated_at DESC`,
      [userId]
    );
    res.json(result.rows.map(mapSessionRow));
  } catch (err: any) {
    console.error('[sinistre] GET sessions error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sinistre/session/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/session/:id', async (req: any, res: Response) => {
  try {
    const result = await query(
      `SELECT cs.*, p.metadata->>'name' AS policy_name,
              i.label AS insurer, p.type AS policy_type
       FROM claim_sessions cs
       LEFT JOIN policies p ON p.id = cs.policy_id
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE cs.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });

    // Vérification de propriété
    if (result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json(mapSessionRow(result.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sinistre/session/:id/chat
// Envoyer un message et obtenir une réponse IA contextuelle
// L'historique est persisté dans le champ messages de claim_sessions
// ─────────────────────────────────────────────────────────────────────────────
router.post('/session/:id/chat', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message requis' });

    // Charger la session
    const sessionResult = await query(
      `SELECT cs.*, p.metadata AS policy_metadata,
              i.label AS insurer, p.type AS policy_type,
              cg.insurer_code, cg.insurance_type_code
       FROM claim_sessions cs
       LEFT JOIN policies p ON p.id = cs.policy_id
       LEFT JOIN central_cg cg ON cg.id = p.central_cg_id
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE cs.id = $1`,
      [id]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });
    const session = sessionResult.rows[0];

    // Vérification de propriété
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const claimData: ClaimContext = session.claim_data || {};
    const analysis = session.analysis || null;
    const policyMeta = session.policy_metadata || {};
    const existingMessages: ChatMessage[] = session.messages || [];

    // Construire le contexte du contrat
    let policyContext = '';
    if (policyMeta.summary) policyContext += `Résumé : ${policyMeta.summary}\n`;
    if (policyMeta.description) policyContext += `Description : ${policyMeta.description}\n`;
    // Chercher CG si dispo
    if (policyMeta.centralCgId || policyMeta.central_cg_id) {
      const cgRow = await query(`SELECT content_text FROM central_cg WHERE id = $1`, [policyMeta.centralCgId || policyMeta.central_cg_id]).catch(() => ({ rows: [] }));
      if (cgRow.rows[0]?.content_text) policyContext += `\nConditions générales :\n${cgRow.rows[0].content_text.slice(0, 2000)}`;
    }

    // Appel Gemini
    const reply = await chatClaim(
      message.trim(),
      existingMessages,
      claimData,
      analysis,
      policyMeta.name || `Contrat #${session.policy_id}`,
      session.insurer || 'Votre assureur',
      policyContext
    );

    // Construire les nouveaux messages
    const now = new Date().toISOString();
    const newMessages: ChatMessage[] = [
      ...existingMessages,
      { role: 'user', content: message.trim(), ts: now },
      { role: 'assistant', content: reply, ts: new Date().toISOString() },
    ];

    // Sauvegarder en DB
    await query(
      `UPDATE claim_sessions SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(newMessages), id]
    );

    res.json({ reply, messages: newMessages });
  } catch (err: any) {
    console.error('[sinistre] chat error:', err.message);
    res.status(500).json({ error: 'Erreur chat IA', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sinistre/sessions
// Créer une nouvelle session sinistre (étape 1 : qualification)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sessions', async (req: any, res: Response) => {
  try {
    const { policyId, claimData, title } = req.body;
    const userId = req.user.id; // toujours extrait du JWT

    const result = await query(
      `INSERT INTO claim_sessions (user_id, policy_id, claim_data, title, status)
       VALUES ($1, $2, $3::jsonb, $4, 'qualification')
       RETURNING *`,
      [userId, policyId || null, JSON.stringify(claimData || {}), title || 'Nouveau sinistre']
    );
    res.status(201).json(mapSessionRow(result.rows[0]));
  } catch (err: any) {
    console.error('[sinistre] POST sessions error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sinistre/session/:id
// Mettre à jour la qualification (claim_data, policy, title, status)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/session/:id', async (req: any, res: Response) => {
  try {
    const { claimData, policyId, title, status } = req.body;
    const { id } = req.params;

    const existing = await query('SELECT id, user_id FROM claim_sessions WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });

    // Vérification de propriété
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (claimData !== undefined) { updates.push(`claim_data = $${idx++}::jsonb`); values.push(JSON.stringify(claimData)); }
    if (policyId !== undefined)  { updates.push(`policy_id = $${idx++}`);          values.push(policyId); }
    if (title !== undefined)     { updates.push(`title = $${idx++}`);              values.push(title); }
    if (status !== undefined)    { updates.push(`status = $${idx++}`);             values.push(status); }

    if (updates.length === 0) return res.status(400).json({ error: 'Rien à mettre à jour' });

    values.push(id);
    const result = await query(
      `UPDATE claim_sessions SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(mapSessionRow(result.rows[0]));
  } catch (err: any) {
    console.error('[sinistre] PATCH session error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sinistre/session/:id/analyze
// Analyser le sinistre avec l'IA et sauvegarder le résultat
// ─────────────────────────────────────────────────────────────────────────────
router.post('/session/:id/analyze', async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Charger la session
    const sessionResult = await query(
      `SELECT cs.*, p.metadata AS policy_metadata,
              i.label AS insurer, p.type AS policy_type,
              cg.insurer_code, cg.insurance_type_code
       FROM claim_sessions cs
       LEFT JOIN policies p ON p.id = cs.policy_id
       LEFT JOIN central_cg cg ON cg.id = p.central_cg_id
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE cs.id = $1`,
      [id]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });
    const session = sessionResult.rows[0];

    // Vérification de propriété
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const claimData: ClaimContext = session.claim_data || {};
    const policyMeta = session.policy_metadata || {};

    // Construire le contexte du contrat : résumé + formules + options
    let policyContext = '';
    const localMeta = policyMeta;
    if (localMeta.summary) policyContext += `Résumé : ${localMeta.summary}\n`;
    if (localMeta.indexedFormulas?.length) policyContext += `Formules : ${localMeta.indexedFormulas.join(', ')}\n`;
    if (localMeta.description) policyContext += `Description : ${localMeta.description}\n`;
    if (localMeta.name) policyContext += `Contrat : ${localMeta.name}\n`;

    // Chercher le texte de la CG centrale si disponible
    if (localMeta.centralCgId || localMeta.central_cg_id) {
      const cgId = localMeta.centralCgId || localMeta.central_cg_id;
      try {
        const cgRow = await query(
          `SELECT content_text, metadata FROM central_cg WHERE id = $1`,
          [cgId]
        );
        if (cgRow.rows[0]?.content_text) {
          policyContext += `\nExtraits conditions générales :\n${cgRow.rows[0].content_text.slice(0, 4000)}`;
        }
      } catch (_) { /* pas bloquant */ }
    }

    // Mettre à jour en "analyzing"
    await query(`UPDATE claim_sessions SET status = 'analyzing' WHERE id = $1`, [id]);

    const analysis = await analyzeClaim(
      claimData,
      policyContext,
      localMeta.name || `Contrat #${session.policy_id}`,
      session.insurer || 'Votre assureur',
      session.policy_type || claimData.typeAssurance || ''
    );

    // Calcul date limite déclaration
    const incidentDate = claimData.dateIncident ? new Date(claimData.dateIncident) : new Date();
    const deadline = new Date(incidentDate);
    deadline.setDate(deadline.getDate() + (analysis.declarationDeadlineDays * 1.4)); // jours ouvrés ~ 7/5
    analysis.declarationDeadlineDate = deadline.toLocaleDateString('fr-FR');

    // Sauvegarder l'analyse
    await query(
      `UPDATE claim_sessions SET analysis = $1::jsonb, status = 'plan' WHERE id = $2`,
      [JSON.stringify(analysis), id]
    );

    res.json({ analysis });
  } catch (err: any) {
    console.error('[sinistre] analyze error:', err.message);
    // Remettre status precédent si erreur
    await query(`UPDATE claim_sessions SET status = 'qualification' WHERE id = $1`, [req.params.id]).catch(() => {});
    res.status(500).json({ error: 'Erreur analyse IA', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sinistre/session/:id/letter
// Générer la lettre de déclaration de sinistre
// ─────────────────────────────────────────────────────────────────────────────
router.post('/session/:id/letter', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // toujours extrait du JWT

    // Charger session + vérifier propriété
    const sessionResult = await query(
      `SELECT cs.*, p.metadata AS policy_metadata,
              i.label AS insurer, p.type AS policy_type
       FROM claim_sessions cs
       LEFT JOIN policies p ON p.id = cs.policy_id
       LEFT JOIN insurers i ON i.code = p.insurer_code
       WHERE cs.id = $1`,
      [id]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });
    const session = sessionResult.rows[0];

    // Vérification de propriété
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (!session.analysis) return res.status(400).json({ error: 'Analyse requise avant génération lettre' });

    // Charger les infos utilisateur
    let userFirstName = 'Prénom';
    let userLastName = 'Nom';
    let userEmail = '';
    if (userId) {
      const users = await storage.readUsers<any>();
      const usr = users.find((u: any) => String(u.id) === String(userId));
      if (usr) { userFirstName = usr.firstName; userLastName = usr.lastName; userEmail = usr.email; }
    }

    const claimData: ClaimContext = session.claim_data || {};
    const analysis = session.analysis;
    const policyMeta = session.policy_metadata || {};

    const letterResult = await generateClaimLetter(
      claimData,
      analysis,
      policyMeta.name || `Contrat #${session.policy_id}`,
      session.insurer || 'Votre assureur',
      userFirstName,
      userLastName,
      userEmail
    );

    // Sauvegarder la lettre et passer au statut done
    await query(
      `UPDATE claim_sessions SET letter_content = $1, status = 'done' WHERE id = $2`,
      [letterResult.letter, id]
    );

    res.json(letterResult);
  } catch (err: any) {
    console.error('[sinistre] letter error:', err.message);
    res.status(500).json({ error: 'Erreur génération lettre', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sinistre/session/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/session/:id', async (req: any, res: Response) => {
  try {
    // Vérifier la propriété avant suppression
    const existing = await query('SELECT user_id FROM claim_sessions WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Session introuvable' });
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await query('DELETE FROM claim_sessions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

export default router;
