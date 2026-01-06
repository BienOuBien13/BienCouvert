import { Router } from 'express';
import { sendMessageToAssistant } from '../services/geminiService';

const router = Router();

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

export default router;