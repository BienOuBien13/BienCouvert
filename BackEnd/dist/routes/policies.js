"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../storage");
const geminiService_1 = require("../services/geminiService");
// -----------------------------------------------------------------------------
// Routes /policies
// - Gestion des polices/contrats : création, lecture, mise à jour, suppression.
// - Supporte l'upload de fichier (multipart/form-data) ou l'envoi direct
//   de `fileData` encodé en base64 (utile pour l'API depuis le client).
// -----------------------------------------------------------------------------
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = (0, express_1.Router)();
// Liste les polices pour un utilisateur (filtre optionnel par userId)
router.get('/', (req, res) => {
    const userId = req.query.userId;
    const policies = storage_1.storage.readPolicies();
    if (userId)
        return res.json(policies.filter((p) => p.userId === userId));
    res.json(policies);
});
// Create with either file or web data
router.post('/', upload.single('file'), async (req, res) => {
    try {
        const body = req.body;
        // Validation minimale serveur : on requiert au moins un nom ou un fichier/base64
        // (le client frontend valide plus strictement selon le mode choisi).
        if (!body.name && !req.file && !(body.fileData && body.fileName)) {
            return res.status(400).json({ message: 'Missing required fields (name or file)' });
        }
        // On lit l'état actuel des polices (stockage local JSON)
        const policies = storage_1.storage.readPolicies();
        // Construction de l'objet de police à partir du body ou du fichier uploadé
        const newPolicy = {
            id: cryptoId(),
            userId: body.userId || 'anonymous',
            name: body.name,
            provider: body.provider,
            type: body.type,
            coverageDetail: body.coverageDetail || undefined,
            fileData: null,
            fileName: null,
            mimeType: body.mimeType || 'text/html',
            sourceUrl: body.sourceUrl || undefined,
            summary: body.summary || undefined,
            addedAt: Date.now()
        };
        // Si un fichier a été uploadé via multipart/form-data, on encode en base64
        // et on tente d'en extraire un résumé via le service AI (silencieux en échec).
        if (req.file) {
            newPolicy.fileData = req.file.buffer.toString('base64');
            newPolicy.fileName = req.file.originalname;
            newPolicy.mimeType = req.file.mimetype;
            // Tentative de résumé : on n'échoue pas la requête si l'AI n'est pas dispo
            try {
                newPolicy.summary = await (0, geminiService_1.summarizePolicy)(newPolicy.fileData, newPolicy.mimeType);
            }
            catch (e) {
                // On log l'erreur serveur coté AI mais on continue l'opération
                console.warn('Résumé automatique échoué pour upload de fichier', e);
            }
        }
        else if (body.fileData && body.fileName) {
            // Support pour client qui envoie directement du base64 (PolicyForm)
            newPolicy.fileData = body.fileData;
            newPolicy.fileName = body.fileName;
            newPolicy.mimeType = body.mimeType || newPolicy.mimeType;
            if (!newPolicy.summary) {
                try {
                    newPolicy.summary = await (0, geminiService_1.summarizePolicy)(newPolicy.fileData, newPolicy.mimeType);
                }
                catch (e) {
                    console.warn('Résumé automatique échoué pour fileData', e);
                }
            }
        }
        // Ajout et persistance
        policies.push(newPolicy);
        storage_1.storage.writePolicies(policies);
        res.json(newPolicy);
    }
    catch (err) {
        console.error(err);
        // Erreur générale : on renvoie 500
        res.status(500).json({ message: 'Server error' });
    }
});
router.put('/:id', upload.single('file'), async (req, res) => {
    const id = req.params.id;
    const policies = storage_1.storage.readPolicies();
    const idx = policies.findIndex((p) => p.id === id);
    if (idx === -1)
        return res.status(404).json({ message: 'Not found' });
    const existing = policies[idx];
    const body = req.body;
    existing.name = body.name || existing.name;
    existing.provider = body.provider || existing.provider;
    existing.type = body.type || existing.type;
    existing.coverageDetail = body.coverageDetail || existing.coverageDetail;
    existing.sourceUrl = body.sourceUrl || existing.sourceUrl;
    existing.summary = body.summary || existing.summary;
    if (req.file) {
        existing.fileData = req.file.buffer.toString('base64');
        existing.fileName = req.file.originalname;
        existing.mimeType = req.file.mimetype;
        try {
            existing.summary = await (0, geminiService_1.summarizePolicy)(existing.fileData, existing.mimeType);
        }
        catch (e) { }
    }
    else if (body.fileData && body.fileName) {
        existing.fileData = body.fileData;
        existing.fileName = body.fileName;
        existing.mimeType = body.mimeType || existing.mimeType;
        if (!existing.summary) {
            try {
                existing.summary = await (0, geminiService_1.summarizePolicy)(existing.fileData, existing.mimeType);
            }
            catch (e) { }
        }
    }
    policies[idx] = existing;
    storage_1.storage.writePolicies(policies);
    res.json(existing);
});
router.delete('/:id', (req, res) => {
    const id = req.params.id;
    const policies = storage_1.storage.readPolicies();
    const newPolicies = policies.filter((p) => p.id !== id);
    storage_1.storage.writePolicies(newPolicies);
    res.json({ ok: true });
});
router.post('/search', async (req, res) => {
    const { provider, type, name } = req.body;
    try {
        const result = await (0, geminiService_1.searchPolicyInfo)(provider, type, name);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ message: 'Search error' });
    }
});
router.post('/summarize', async (req, res) => {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType)
        return res.status(400).json({ message: 'Missing fileBase64 or mimeType' });
    try {
        const summary = await (0, geminiService_1.summarizePolicy)(fileBase64, mimeType);
        res.json({ summary });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Summarize error' });
    }
});
router.post('/detect-duplicates', async (req, res) => {
    const policies = req.body.policies || [];
    try {
        const findings = await (0, geminiService_1.detectDuplicates)(policies);
        res.json(findings);
    }
    catch (e) {
        res.status(500).json({ message: 'Error detecting duplicates' });
    }
});
function cryptoId() {
    return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
exports.default = router;
