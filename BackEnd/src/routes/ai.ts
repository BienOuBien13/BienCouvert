import { Router } from 'express';
import { sendMessageToAssistant, sendMessageToAssistantStream, searchPolicyInfo, detectDuplicates, parsePoliciesFromText, indexCgDocument, generateShareableReport } from '../services/geminiService';
import { storage } from '../storage';

const router = Router();

// Endpoint chat utilisé par le frontend : envoie un message, le contexte des
// polices et l'historique. Réponse : `{ response: string }`.
router.post('/chat', async (req, res) => {
  const { message, policies, history } = req.body;
  if (!message) return res.status(400).json({ message: 'Missing message' });
  try {
    // Recharger les policies depuis la DB pour avoir les metadata complets
    const policyIds = (policies || []).map((p: any) => p.id).filter(Boolean);
    let enrichedPolicies = policies || [];
    
    if (policyIds.length > 0) {
      console.log(`🔄 Rechargement de ${policyIds.length} policies depuis DB pour avoir metadata...`);
      
      // Récupérer toutes les policies de l'utilisateur (on suppose que req contient userId ou on l'extrait des policies)
      const userId = policies[0]?.userId;
      if (userId) {
        const allPolicies = await storage.readPolicies(userId);
        // Filtrer pour ne garder que celles demandées
        enrichedPolicies = allPolicies.filter((p: any) => policyIds.includes(String(p.id)));
        console.log(`✅ ${enrichedPolicies.length} policies rechargées avec metadata`);
        
        // Debug: afficher les metadata de la première policy
        if (enrichedPolicies.length > 0) {
          console.log('🔍 Exemple policy rechargée:', {
            id: enrichedPolicies[0].id,
            name: enrichedPolicies[0].name,
            metadata: enrichedPolicies[0].metadata,
            coverage: enrichedPolicies[0].coverage,
            coverageDetail: enrichedPolicies[0].coverageDetail
          });
        }
      } else {
        console.warn('⚠️ Impossible de recharger policies : userId non trouvé');
      }
    }
    
    const response = await sendMessageToAssistant(message, enrichedPolicies, history || []);
    res.json({ response });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Chat error' });
  }
});

// Endpoint chat STREAMING - envoie la réponse progressivement via SSE
router.post('/chat/stream', async (req, res) => {
  const { message, policies, history } = req.body;
  if (!message) return res.status(400).json({ message: 'Missing message' });
  
  try {
    // Même enrichissement des policies que /chat
    const policyIds = (policies || []).map((p: any) => p.id).filter(Boolean);
    let enrichedPolicies = policies || [];
    
    if (policyIds.length > 0) {
      const userId = policies[0]?.userId;
      if (userId) {
        const allPolicies = await storage.readPolicies(userId);
        enrichedPolicies = allPolicies.filter((p: any) => policyIds.includes(String(p.id)));
        console.log(`✅ ${enrichedPolicies.length} policies rechargées (streaming)`);
      }
    }
    
    // Configuration SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Callback pour chaque chunk reçu
    const onChunk = (chunk: string) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    };
    
    // Appeler la fonction de streaming
    await sendMessageToAssistantStream(message, enrichedPolicies, history || [], onChunk);
    
    // Signaler la fin du stream
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    console.error('❌ Chat streaming error:', e);
    res.write(`data: ${JSON.stringify({ error: 'Erreur lors de la génération de la réponse' })}\n\n`);
    res.end();
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

// Endpoint détection de doublons/optimisations entre polices avec profil utilisateur
router.post('/detect-duplicates', async (req, res) => {
  const { policies, profile } = req.body;
  if (!policies || !Array.isArray(policies)) return res.status(400).json({ message: 'Invalid policies' });
  try {
    const result = await detectDuplicates(policies, profile || {});
    res.json(result);
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

// Endpoint indexation d'un document CG depuis une URL
router.post('/index-cg', async (req, res) => {
  const { provider, type, pdfUrl } = req.body;
  if (!provider || !type || !pdfUrl) return res.status(400).json({ message: 'Missing parameters' });
  try {
    const result = await indexCgDocument(provider, type, pdfUrl);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Index CG error' });
  }
});

// Endpoint génération de rapport partageable
router.post('/generate-report', async (req, res) => {
  const { policies, findings } = req.body;
  if (!policies || !Array.isArray(policies)) return res.status(400).json({ message: 'Invalid policies' });
  try {
    const text = await generateShareableReport(policies, findings || []);
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Report generation error' });
  }
});

export default router;
