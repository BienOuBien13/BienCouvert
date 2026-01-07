"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geminiService_1 = require("../services/geminiService");
const router = (0, express_1.Router)();
// Endpoint chat utilisé par le frontend : envoie un message, le contexte des
// polices et l'historique. Réponse : `{ reply: string }`.
router.post('/chat', async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        const reply = await (0, geminiService_1.sendMessageToAssistant)(message, policies || [], history || []);
        res.json({ reply });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Chat error' });
    }
});
exports.default = router;
