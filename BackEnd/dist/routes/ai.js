"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geminiService_1 = require("../services/geminiService");
const tableExtractionService_1 = require("../services/tableExtractionService");
const storage_1 = require("../storage");
const db_1 = require("../db");
const cacheService_1 = require("../services/cacheService");
const auth_1 = require("../middleware/auth");
const agents_1 = require("../agents");
const router = (0, express_1.Router)();
// Endpoint chat utilisé par le frontend : envoie un message, le contexte des
// polices et l'historique. Réponse : `{ response: string }`.
// Utilise l'OrchestratorAgent BMAD pour un routage intelligent vers les agents spécialisés.
router.post('/chat', auth_1.authMiddleware, async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        // userId toujours extrait du JWT — jamais du body client
        const userId = req.user.id;
        // Valider les policy IDs côté serveur (protection IDOR sur le RAG)
        const requestedIds = (policies || []).map((p) => parseInt(p.id)).filter((id) => !isNaN(id));
        const ownedPolicies = await storage_1.storage.readPolicies(userId);
        const enrichedPolicies = ownedPolicies.filter((p) => requestedIds.includes(parseInt(p.id)));
        const policyIds = enrichedPolicies.map((p) => String(p.id));
        // Cache Redis (clé userId-safe)
        const cacheKey = (0, cacheService_1.makeCacheKey)('chat-bmad', String(userId), message, policyIds.sort().join(','));
        const cached = await (0, cacheService_1.cacheGet)(cacheKey);
        if (cached) {
            console.log('🎯 Cache hit — chat-bmad');
            return res.json({ response: cached });
        }
        // Profil utilisateur pour personnalisation
        const userProfile = await storage_1.storage.readAnalysisProfile(userId).catch(() => null);
        // Orchestration multi-agent BMAD
        const result = await agents_1.orchestratorAgent.run({
            message,
            userId,
            policies: enrichedPolicies,
            history: history || [],
            userProfile: userProfile || undefined,
        });
        await (0, cacheService_1.cacheSet)(cacheKey, result.response);
        res.json({
            response: result.response,
            _meta: {
                intent: result.intent,
                agentsUsed: result.agentsUsed,
                processingMs: result.processingMs,
            },
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Chat error' });
    }
});
// Endpoint chat STREAMING - envoie la réponse progressivement via SSE
// Utilise l'OrchestratorAgent BMAD avec streaming chunk-par-chunk.
router.post('/chat/stream', auth_1.authMiddleware, async (req, res) => {
    const { message, policies, history } = req.body;
    if (!message)
        return res.status(400).json({ message: 'Missing message' });
    try {
        const userId = req.user.id;
        const requestedIds = (policies || []).map((p) => parseInt(p.id)).filter((id) => !isNaN(id));
        const ownedPolicies = await storage_1.storage.readPolicies(userId);
        const enrichedPolicies = ownedPolicies.filter((p) => requestedIds.includes(parseInt(p.id)));
        console.log(`✅ ${enrichedPolicies.length} policies validées (streaming BMAD)`);
        // Configuration SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const onChunk = (chunk) => {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        };
        const userProfile = await storage_1.storage.readAnalysisProfile(userId).catch(() => null);
        const result = await agents_1.orchestratorAgent.runStream({
            message,
            userId,
            policies: enrichedPolicies,
            history: history || [],
            userProfile: userProfile || undefined,
        }, onChunk);
        // Envoyer les métadonnées BMAD à la fin
        res.write(`data: ${JSON.stringify({ done: true, _meta: { intent: result.intent, agentsUsed: result.agentsUsed, processingMs: result.processingMs } })}\n\n`);
        res.end();
    }
    catch (e) {
        console.error('❌ Chat streaming BMAD error:', e);
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
// Deux modes : BMAD OptimizerAgent (recommandé) ou legacy geminiService
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
// ── Endpoint BMAD OptimizerAgent — analyse portefeuille + circuit ─────────────
// POST /api/ai/optimize  { policies: Policy[], includeCircuit?: boolean }
router.post('/optimize', auth_1.authMiddleware, async (req, res) => {
    const { policies, includeCircuit } = req.body;
    if (!policies || !Array.isArray(policies)) {
        return res.status(400).json({ message: 'Invalid policies' });
    }
    try {
        const userId = req.user.id;
        const userProfile = await storage_1.storage.readAnalysisProfile(userId).catch(() => null);
        const { optimizerAgent } = require('../agents');
        const result = await optimizerAgent.optimize({ policies, userProfile: userProfile || undefined }, includeCircuit
            ? {
                ragCacheHit: false,
                ragChunksFound: 0,
                policyCount: policies.length,
                hasUserProfile: !!userProfile,
                intentConfidence: 1,
            }
            : undefined);
        res.json(result);
    }
    catch (e) {
        console.error('optimize error:', e);
        res.status(500).json({ message: 'Optimize error' });
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
// Protégé : admin uniquement (prévient l'injection de contenu dans la base RAG partagée)
router.post('/index-cg', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
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
router.get('/debug-coverage', auth_1.authMiddleware, async (req, res) => {
    // Un utilisateur non-admin ne peut consulter que ses propres données
    let userId;
    if (req.user?.isAdmin && req.query.userId) {
        userId = parseInt(req.query.userId);
    }
    else {
        userId = req.user.id;
    }
    if (isNaN(userId))
        return res.status(400).json({ error: 'userId invalide' });
    try {
        const policies = await storage_1.storage.readPolicies(userId);
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
// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: relancer Vision sur une page spécifique et voir le JSON brut
// GET /api/ai/debug-extract-page?cgId=536&page=5
// ─────────────────────────────────────────────────────────────────────────────
router.get('/debug-extract-page', async (req, res) => {
    const cgId = parseInt(req.query.cgId);
    const pageNo = parseInt(req.query.page);
    if (isNaN(cgId) || isNaN(pageNo))
        return res.status(400).json({ error: 'cgId et page (numéros) requis' });
    try {
        // 1. Récupérer l'image de la page depuis la DB
        const pageRow = await (0, db_1.query)(`SELECT page_image_base64, content_text, has_table, table_json
       FROM central_cg_pages WHERE central_cg_id = $1 AND page_number = $2 LIMIT 1`, [cgId, pageNo]);
        if (pageRow.rows.length === 0) {
            return res.status(404).json({ error: `Page ${pageNo} introuvable pour CG ${cgId}. Vectoriser d'abord.` });
        }
        const { page_image_base64, content_text, has_table, table_json } = pageRow.rows[0];
        // 2. Récupérer insurer_code et insurance_type_code
        const cgRow = await (0, db_1.query)(`SELECT insurer_code, insurance_type_code FROM central_cg WHERE id = $1`, [cgId]);
        const insurer_code = cgRow.rows[0]?.insurer_code ?? 'unknown';
        const insurance_type = cgRow.rows[0]?.insurance_type_code ?? 'unknown';
        // 3. Relancer Vision en direct sur cette page
        let freshExtraction = null;
        let extractionError = null;
        if (page_image_base64) {
            try {
                freshExtraction = await (0, tableExtractionService_1.extractTableFromPageImage)(page_image_base64, insurer_code, insurance_type);
            }
            catch (e) {
                extractionError = e?.message || 'Erreur Vision';
            }
        }
        else {
            extractionError = 'image non disponible en DB (page pas encore vectorisée avec images)';
        }
        // 4. Coverage_facts actuellement en DB pour cette page
        const existingFacts = await (0, db_1.query)(`SELECT guarantee_label, guarantee_key, formula_label, formula_key, coverage_status
       FROM coverage_facts WHERE central_cg_id = $1 ORDER BY guarantee_key, formula_key`, [cgId]);
        res.json({
            cgId, pageNo, insurer_code, insurance_type,
            textPreview: (content_text || '').substring(0, 500),
            hasTableInDB: has_table,
            tableJsonInDB: table_json,
            freshVisionExtraction: freshExtraction,
            extractionError,
            existingFactsCount: existingFacts.rows.length,
            existingFacts: existingFacts.rows
        });
    }
    catch (err) {
        console.error('❌ debug-extract-page error:', err);
        res.status(500).json({ error: err?.message || 'Erreur interne' });
    }
});
exports.default = router;
