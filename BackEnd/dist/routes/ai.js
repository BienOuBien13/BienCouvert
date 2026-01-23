"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geminiService_1 = require("../services/geminiService");
const router = (0, express_1.Router)();
// Endpoint chat utilisé par le frontend : envoie un message, le contexte des
// polices et l'historique. Réponse : `{ response: string }`.
router.post('/chat', async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        const response = await (0, geminiService_1.sendMessageToAssistant)(message, policies || [], history || []);
        res.json({ response });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Chat error' });
    }
});
// Endpoint recherche d'infos sur une police via Gemini + Google Search
router.post('/search-policy', async (req, res) => {
    const { provider, type, name } = req.body;
    if (!provider || !type || !name)
        return res.status(400).json({ message: 'Missing parameters' });
    try {
        const result = await (0, geminiService_1.searchPolicyInfo)(provider, type, name);
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Search error' });
    }
});
// Endpoint détection de doublons/optimisations entre polices avec profil utilisateur
router.post('/detect-duplicates', async (req, res) => {
    const { policies, profile } = req.body;
    if (!policies || !Array.isArray(policies))
        return res.status(400).json({ message: 'Invalid policies' });
    try {
        const result = await (0, geminiService_1.detectDuplicates)(policies, profile || {});
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Duplicate detection error' });
    }
});
// Endpoint extraction de contrats depuis texte libre
router.post('/parse-text', async (req, res) => {
    const { text } = req.body;
    if (!text)
        return res.status(400).json({ message: 'Missing text' });
    try {
        const result = await (0, geminiService_1.parsePoliciesFromText)(text);
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Parse error' });
    }
});
// Endpoint indexation d'un document CG depuis une URL
router.post('/index-cg', async (req, res) => {
    const { provider, type, pdfUrl } = req.body;
    if (!provider || !type || !pdfUrl)
        return res.status(400).json({ message: 'Missing parameters' });
    try {
        const result = await (0, geminiService_1.indexCgDocument)(provider, type, pdfUrl);
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Index CG error' });
    }
});
// Endpoint génération de rapport partageable
router.post('/generate-report', async (req, res) => {
    const { policies, findings } = req.body;
    if (!policies || !Array.isArray(policies))
        return res.status(400).json({ message: 'Invalid policies' });
    try {
        const text = await (0, geminiService_1.generateShareableReport)(policies, findings || []);
        res.json({ text });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Report generation error' });
    }
});
exports.default = router;
