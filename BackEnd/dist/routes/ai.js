"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geminiService_1 = require("../services/geminiService");
const storage_1 = require("../storage");
const db_1 = require("../db");
const cacheService_1 = require("../services/cacheService");
const router = (0, express_1.Router)();
// Endpoint chat utilisé par le frontend : envoie un message, le contexte des
// polices et l'historique. Réponse : `{ response: string }`.
router.post('/chat', async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        // Recharger les policies depuis la DB pour avoir les metadata complets
        const policyIds = (policies || []).map((p) => p.id).filter(Boolean);
        let enrichedPolicies = policies || [];
        if (policyIds.length > 0) {
            console.log(`🔄 Rechargement de ${policyIds.length} policies depuis DB pour avoir metadata...`);
            // Récupérer toutes les policies de l'utilisateur (on suppose que req contient userId ou on l'extrait des policies)
            const userId = policies[0]?.userId;
            if (userId) {
                const allPolicies = await storage_1.storage.readPolicies(userId);
                // Filtrer pour ne garder que celles demandées
                enrichedPolicies = allPolicies.filter((p) => policyIds.includes(String(p.id)));
                console.log(`✅ ${enrichedPolicies.length} policies rechargées avec metadata`);
            }
            else {
                console.warn('⚠️ Impossible de recharger policies : userId non trouvé');
            }
        }
        // 🚀 Cache Redis : évite les appels Gemini répétés pour la même question/contexte
        const cacheKey = (0, cacheService_1.makeCacheKey)('chat', message, policyIds.sort().join(','));
        const cached = await (0, cacheService_1.cacheGet)(cacheKey);
        if (cached) {
            console.log('🎯 Cache hit — chat');
            return res.json({ response: cached });
        }
        const response = await (0, geminiService_1.sendMessageToAssistant)(message, enrichedPolicies, history || []);
        // Mettre en cache 30 min (TTL configurable via CACHE_TTL env)
        await (0, cacheService_1.cacheSet)(cacheKey, response);
        res.json({ response });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Chat error' });
    }
});
// Endpoint chat STREAMING - envoie la réponse progressivement via SSE
router.post('/chat/stream', async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        // Même enrichissement des policies que /chat
        const policyIds = (policies || []).map((p) => p.id).filter(Boolean);
        let enrichedPolicies = policies || [];
        if (policyIds.length > 0) {
            const userId = policies[0]?.userId;
            if (userId) {
                const allPolicies = await storage_1.storage.readPolicies(userId);
                enrichedPolicies = allPolicies.filter((p) => policyIds.includes(String(p.id)));
                console.log(`✅ ${enrichedPolicies.length} policies rechargées (streaming)`);
            }
        }
        // Configuration SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        // Callback pour chaque chunk reçu
        const onChunk = (chunk) => {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        };
        // Appeler la fonction de streaming
        await (0, geminiService_1.sendMessageToAssistantStream)(message, enrichedPolicies, history || [], onChunk);
        // Signaler la fin du stream
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    }
    catch (e) {
        console.error('❌ Chat streaming error:', e);
        res.write(`data: ${JSON.stringify({ error: 'Erreur lors de la génération de la réponse' })}\n\n`);
        res.end();
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
        // Extraire le texte localement avant l'appel Gemini (réduit drastiquement les output tokens)
        let contentText;
        try {
            const pdfParse = require('pdf-parse');
            let pdfBuffer;
            if (pdfUrl.startsWith('data:application/pdf;base64,')) {
                pdfBuffer = Buffer.from(pdfUrl.split(',')[1], 'base64');
            }
            else {
                const resp = await fetch(pdfUrl);
                if (resp.ok)
                    pdfBuffer = Buffer.from(await resp.arrayBuffer());
            }
            if (pdfBuffer) {
                const parsed = await pdfParse(pdfBuffer);
                contentText = parsed.text || undefined;
                console.log(`💡 /index-cg: texte extrait localement (${contentText?.length ?? 0} chars) - envoi texte seul à Gemini`);
            }
        }
        catch (parseErr) {
            console.warn(`⚠️  Extraction locale échouée, fallback PDF binaire: ${parseErr.message}`);
        }
        const result = await (0, geminiService_1.indexCgDocument)(provider, type, pdfUrl, contentText);
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
// Endpoint analyse détaillée des garanties d'une police spécifique
router.post('/coverage-details', async (req, res) => {
    const { policy } = req.body;
    if (!policy)
        return res.status(400).json({ message: 'Missing policy' });
    try {
        const result = await (0, geminiService_1.getCoverageAnalysis)(policy);
        res.json(result);
    }
    catch (e) {
        console.error('coverage-details error:', e);
        res.status(500).json({ message: 'Coverage analysis error' });
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: diagnostic état coverage_facts pour un userId
// GET /api/ai/debug-coverage?userId=123
// ─────────────────────────────────────────────────────────────────────────────
router.get('/debug-coverage', async (req, res) => {
    const userId = req.query.userId;
    if (!userId)
        return res.status(400).json({ error: 'userId requis (query param)' });
    try {
        const policies = await storage_1.storage.readPolicies(parseInt(userId));
        const policyInfo = policies.map((p) => ({
            id: p.id,
            name: p.name,
            insurer: p.insurer,
            insurerCode: p.insurerCode,
            typeCode: p.typeCode,
            formula: p.formula,
            centralCgId: p.centralCgId,
            userCgId: p.userCgId
        }));
        // Résoudre les CG IDs (copie de la logique du helper)
        const cgIdsDirect = policies.map((p) => p.centralCgId).filter((id) => id != null).map(Number);
        // Lookup par insurer+type pour ceux sans centralCgId
        const policiesNoCgId = policies.filter((p) => !p.centralCgId && p.insurerCode && p.typeCode);
        let cgIdsResolved = [...cgIdsDirect];
        const cgLookupDetails = [];
        for (const p of policiesNoCgId) {
            const r = await (0, db_1.query)(`SELECT id, insurer_code, insurance_type_code, version, status FROM central_cg WHERE insurer_code = $1 AND insurance_type_code = $2 ORDER BY version DESC LIMIT 3`, [p.insurerCode, p.typeCode]);
            cgLookupDetails.push({ policy: p.name, insurerCode: p.insurerCode, typeCode: p.typeCode, found: r.rows });
            if (r.rows[0])
                cgIdsResolved.push(Number(r.rows[0].id));
        }
        cgIdsResolved = [...new Set(cgIdsResolved)];
        // Compte coverage_facts par formula_key pour ces CG
        let factsBreakdown = [];
        if (cgIdsResolved.length > 0) {
            const factsCount = await (0, db_1.query)(`SELECT central_cg_id, formula_key, COUNT(*) as cnt FROM coverage_facts WHERE central_cg_id = ANY($1) GROUP BY central_cg_id, formula_key ORDER BY central_cg_id, formula_key`, [cgIdsResolved]);
            factsBreakdown = factsCount.rows;
        }
        // Compte pages table_json
        let tablePages = [];
        if (cgIdsResolved.length > 0) {
            const tpCount = await (0, db_1.query)(`SELECT central_cg_id, COUNT(*) as pages_total, SUM(CASE WHEN has_table THEN 1 ELSE 0 END) as pages_with_table FROM central_cg_pages WHERE central_cg_id = ANY($1) GROUP BY central_cg_id`, [cgIdsResolved]);
            tablePages = tpCount.rows;
        }
        // Test resolveCoverageFacts complet
        const resolved = await (0, geminiService_1.resolveCoverageFacts)(storage_1.storage, policies, 'debug');
        res.json({
            userId,
            policiesCount: policies.length,
            policies: policyInfo,
            cgIdsDirect,
            cgIdsResolvedByInsurerType: cgLookupDetails,
            cgIdsResolved,
            coverageFactsBreakdown: factsBreakdown,
            tablePages,
            resolvedFactsCount: resolved.length,
            resolvedFactsSample: resolved.slice(0, 10)
        });
    }
    catch (err) {
        console.error('❌ debug-coverage error:', err);
        res.status(500).json({ error: err?.message || 'Erreur interne' });
    }
});
exports.default = router;
