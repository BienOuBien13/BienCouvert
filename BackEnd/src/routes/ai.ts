import { Router } from 'express';
import { sendMessageToAssistant, searchPolicyInfo, detectDuplicates, parsePoliciesFromText } from '../services/geminiService';

const router = Router();

// Endpoint chat utilisÃ© par le frontend : envoie un message, le contexte des
// polices et l'historique. RÃ©ponse : `{ reply: string }`.
router.post('/chat', async (req, res) => {
  const { message, policies, history } = req.body;
  if (!message) return res.status(400).json({ message: 'Missing message' });
  try {
    const reply = await sendMessageToAssistant(message, policies || [], history || []);
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Chat error' });
  }
});

// Endpoint recherche d'infos sur une police via Gemini + Google Search
router.post('/search-policy', async (req, res) => {
  const { provider, type, name } = req.body;
  if (!provider || !type || !name) return res.status(400).json({ message: 'Missing parameters' });
  try {
    const result = await searchPolicyInfo(provider, type, name);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Search error' });
  }
});

// Endpoint dÃ©tection de doublons entre polices
router.post('/detect-duplicates', async (req, res) => {
  const { policies } = req.body;
  if (!policies || !Array.isArray(policies)) return res.status(400).json({ message: 'Invalid policies' });
  try {
    const duplicates = await detectDuplicates(policies);
    res.json({ duplicates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Duplicate detection error' });
  }
});


// Endpoint extraction de contrats depuis texte libre
router.post('/parse-text', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: 'Missing text' });
  try {
    const result = await parsePoliciesFromText(text);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Parse error' });
  }
});
export default router;
