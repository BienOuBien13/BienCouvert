"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfProtection = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = __importDefault(require("body-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const csrf_csrf_1 = require("csrf-csrf");
const auth_1 = __importDefault(require("./routes/auth"));
const policies_1 = __importDefault(require("./routes/policies"));
const ai_1 = __importDefault(require("./routes/ai"));
const masterdata_1 = __importDefault(require("./routes/masterdata"));
const cg_1 = __importDefault(require("./routes/cg"));
const contact_1 = __importDefault(require("./routes/contact"));
const partner_1 = __importDefault(require("./routes/partner"));
const sinistre_1 = __importDefault(require("./routes/sinistre"));
require("./db"); // Initialisation de la connexion PostgreSQL
const telemetry_1 = require("./telemetry");
const geminiMetrics_1 = require("./utils/geminiMetrics");
const auditService_1 = require("./services/auditService");
const emailService_1 = require("./services/emailService");
const dbInitService_1 = require("./services/dbInitService");
// -----------------------------------------------------------------------------
// Point d'entrée principal du serveur backend AssurClair
// Ce fichier configure Express avec les middlewares nécessaires et monte
// les différentes routes de l'API REST.
// Configuration PostgreSQL : connecté à la VM Azure
// -----------------------------------------------------------------------------
// Chargement des variables d'environnement depuis le fichier .env
dotenv_1.default.config();
// Bypass SSL Zscaler/corporate proxy pour les appels HTTPS sortants (Gemini, etc.)
// Identique à ce que font les scripts bulk – nécessaire sur les postes avec inspection TLS.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Initialisation de la télémétrie OTel (avant tout appel Gemini)
(0, telemetry_1.initTelemetry)();
// -----------------------------------------------------------------------------
// Vérification des variables d'environnement critiques
// Le serveur s'arrête immédiatement si une variable obligatoire est manquante.
// -----------------------------------------------------------------------------
const REQUIRED_ENV = ['JWT_SECRET', 'CSRF_SECRET'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ Variable d'environnement obligatoire manquante : ${key}`);
        console.error('   Définissez-la dans le fichier .env ou dans les variables de votre environnement.');
        process.exit(1);
    }
});
const app = (0, express_1.default)();
// Correction proxy pour express-rate-limit derrière nginx/docker
app.set('trust proxy', 1);
// -----------------------------------------------------------------------------
// Configuration CORS (Cross-Origin Resource Sharing)
// Contrôle quelles origines (domaines) sont autorisées à accéder à l'API.
// 
// Variable d'environnement FRONTEND_ORIGIN :
// - Si définie : seules les origines listées sont autorisées (séparées par des virgules)
//   Exemple : "http://localhost:3000,https://app.assurclair.fr"
// - Si vide ou '*' : toutes les origines sont autorisées (mode développement)
// 
// Note : Les requêtes sans header Origin (ex: curl, Postman) sont autorisées
// en développement pour faciliter les tests en ligne de commande.
// -----------------------------------------------------------------------------
// ===============================================================================
// CONFIGURATION CORS - Phase 2 Security (httpOnly cookies + HTTPS)
// ===============================================================================
// Récupération de la configuration CORS depuis les variables d'environnement
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
let corsOptions = { origin: '*' }; // Par défaut : toutes origines autorisées
// Si une configuration spécifique est fournie, on configure CORS de manière restrictive
if (frontendOrigin && frontendOrigin !== '*') {
    // Parse la liste d'origines autorisées (séparées par des virgules)
    const allowed = frontendOrigin.split(',').map(s => s.trim()).filter(Boolean);
    corsOptions = {
        origin: (origin, callback) => {
            // Cas 1 : Requête sans origin (curl, Postman, etc.) -> autorisé en dev
            if (!origin)
                return callback(null, true);
            // Debug log pour voir l'origin et la whitelist
            console.log('CORS origin:', origin, 'allowed:', allowed);
            // Cas 2 : Origin dans la liste blanche -> autorisé
            if (allowed.includes(origin))
                return callback(null, true);
            // Cas 3 : Origin non autorisée -> rejet
            return callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true // 🔒 Autorise les cookies httpOnly cross-origin
    };
}
else {
    // Mode développement : tout autorisé avec credentials
    corsOptions = { origin: '*', credentials: true };
}
// -----------------------------------------------------------------------------
// Sécurité des headers HTTP avec Helmet.js
// Protège contre les vulnérabilités web courantes (XSS, clickjacking, etc.)
// -----------------------------------------------------------------------------
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' }, // Anti-clickjacking
    noSniff: true, // Anti-MIME sniffing
    xssFilter: true // Protection XSS basique
}));
// 🔒 Cookie parser pour lire les cookies httpOnly
app.use((0, cookie_parser_1.default)());
// -----------------------------------------------------------------------------
// Protection CSRF (Cross-Site Request Forgery)
// Génère et valide des tokens CSRF pour protéger contre les attaques CSRF
// -----------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const { invalidCsrfTokenError, // Erreur si token invalide
generateCsrfToken, // Fonction pour générer token
doubleCsrfProtection, // Middleware pour valider token CSRF
 } = (0, csrf_csrf_1.doubleCsrf)({
    getSecret: () => process.env.CSRF_SECRET || 'csrf-secret-change-in-production',
    cookieName: 'x-csrf-token',
    cookieOptions: {
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax', // 'none' pour cross-origin avec HTTPS
        secure: isProduction, // HTTPS uniquement en production
        path: '/'
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getSessionIdentifier: (req) => {
        // Utiliser l'adresse IP comme identifiant de session
        return req.ip || req.socket.remoteAddress || 'unknown';
    }
});
exports.csrfProtection = doubleCsrfProtection;
// -----------------------------------------------------------------------------
// Rate Limiting (Protection contre les attaques par force brute)
// Limite le nombre de requêtes par IP pour prévenir les abus
// -----------------------------------------------------------------------------
// Limiter général pour toutes les routes API
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Maximum 100 requêtes par IP
    message: 'Trop de requêtes depuis cette adresse IP, veuillez réessayer plus tard.',
    standardHeaders: true, // Retourne les headers RateLimit-*
    legacyHeaders: false,
    // Exclure les endpoints de polling de statut et les endpoints de profil utilisateur
    skip: (req) => /\/api\/cg\/user\/status\//.test(req.originalUrl) ||
        /\/api\/auth\/me/.test(req.originalUrl) ||
        /\/api\/policies\/central-cg\/[^/]+\/vectorization-status/.test(req.originalUrl) ||
        /\/api\/policies\/central-cg\/[^/]+\/reprocess/.test(req.originalUrl) ||
        /\/api\/masterdata\//.test(req.originalUrl)
});
// Limiter strict pour les routes IA (prévention des coûts API Gemini incontrôlés)
const aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Max 10 requêtes IA par minute par IP
    message: 'Limite d\'analyse IA atteinte, veuillez réessayer dans 1 minute.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Limiter dédié pour masterdata (données de référence, appelées fréquemment)
const masterdataLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 req/15min par IP (données statiques)
    message: 'Trop de requêtes masterdata, veuillez réessayer plus tard.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Application des middlewares
app.use((0, cors_1.default)(corsOptions)); // Gestion CORS
app.use(body_parser_1.default.json({ limit: '50mb' })); // Parse JSON (max 50MB pour documents base64)
app.use(body_parser_1.default.urlencoded({ limit: '50mb', extended: true })); // Parse form data
app.use('/api/', apiLimiter); // 🔒 Rate limiting général sur toutes les routes API
// -----------------------------------------------------------------------------
// Routes de l'API
// -----------------------------------------------------------------------------
/**
 * Route GET /
 * Endpoint de santé (health check) pour vérifier que le serveur est opérationnel.
 * Utile pour les systèmes de monitoring et les load balancers.
 */
app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));
/**
 * Route GET /api/csrf-token
 * Génère et retourne un token CSRF pour les requêtes mutantes (POST, PUT, DELETE).
 * Le frontend doit appeler cette route avant toute modification de données.
 */
app.get('/api/csrf-token', (req, res) => {
    // Générer un nouveau token CSRF (la fonction modifie req et res)
    const csrfToken = generateCsrfToken(req, res);
    res.json({
        csrfToken,
        message: 'Include this token in X-CSRF-Token header for POST/PUT/DELETE requests'
    });
});
// Montage des routes principales de l'API
// 🔒 authLimiter est appliqué directement sur les routes /login et /register (dans auth.ts)
// login et register sont exclus du CSRF : déjà protégés par rate limiting + bcrypt + JWT
// Les autres routes auth (logout, reset-password, etc.) gardent la protection CSRF
app.use('/api/auth/login', auth_1.default); // 🔓 Login sans CSRF (mobile-friendly)
app.use('/api/auth/register', auth_1.default); // 🔓 Register sans CSRF (mobile-friendly)
app.use('/api/auth/forgot-password', auth_1.default); // 🔓 Forgot password sans CSRF
app.use('/api/auth', doubleCsrfProtection, auth_1.default); // 🔒 Autres routes auth avec CSRF
app.use('/api/policies', doubleCsrfProtection, policies_1.default); // 🔒 Policies avec CSRF
app.use('/api/ai', aiLimiter, doubleCsrfProtection, ai_1.default); // 🔒 AI avec CSRF + rate limit strict
app.use('/api/masterdata', masterdataLimiter, masterdata_1.default); // 📊 Master Data (lecture seule, pas de CSRF)
app.use('/api/cg', doubleCsrfProtection, cg_1.default); // 📄 Conditions Générales avec CSRF
app.use('/api/contact', doubleCsrfProtection, contact_1.default); // 📧 Prise de RDV avec CSRF
app.use('/api/partner', doubleCsrfProtection, partner_1.default); // 🤝 Vue partenaire
app.use('/api/sinistre', doubleCsrfProtection, sinistre_1.default); // 🛡️ Assistant Sinistre
// ─── Métriques Gemini (admin) ──────────────────────────────────────────────────
/**
 * GET /api/admin/token-stats
 * Retourne les statistiques de tokens Gemini pour la session en cours.
 * Accès restreint : endpoint admin uniquement (pas exposé publiquement).
 */
app.get('/api/admin/token-stats', (req, res) => {
    res.json((0, geminiMetrics_1.getTokenStats)());
});
/**
 * POST /api/admin/token-stats/reset
 * Remet à zéro les compteurs en mémoire (ne remet pas à zéro les métriques OTel).
 */
app.post('/api/admin/token-stats/reset', (req, res) => {
    (0, geminiMetrics_1.resetTokenStats)();
    res.json({ ok: true, message: 'Compteurs remis à zéro' });
});
// -----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '4000', 10); // Port configurable via variable d'environnement
// Initialisation de la table d'audit au démarrage
(0, auditService_1.initAuditTable)().then(async () => {
    // Tables authentification et contact
    await (0, dbInitService_1.initPasswordResetsTable)();
    await (0, dbInitService_1.initEmailVerificationsTable)();
    await (0, dbInitService_1.initRdvRequestsTable)();
    await (0, dbInitService_1.initPartnerTables)();
    // Vérification connexion SMTP (non bloquante)
    (0, emailService_1.verifySmtpConnection)();
    // Purge quotidienne des tokens expirés
    (0, dbInitService_1.purgeExpiredTokens)();
    setInterval(dbInitService_1.purgeExpiredTokens, 24 * 60 * 60 * 1000);
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`AssurClair backend listening on 0.0.0.0:${PORT}`);
    });
}).catch(err => {
    console.error('❌ Erreur initialisation:', err);
    process.exit(1);
});
