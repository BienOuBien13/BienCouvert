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
require("./db"); // Initialisation de la connexion PostgreSQL
const auditService_1 = require("./services/auditService");
// -----------------------------------------------------------------------------
// Point d'entrée principal du serveur backend AssurClair
// Ce fichier configure Express avec les middlewares nécessaires et monte
// les différentes routes de l'API REST.
// Configuration PostgreSQL : connecté à la VM Azure
// -----------------------------------------------------------------------------
// Chargement des variables d'environnement depuis le fichier .env
dotenv_1.default.config();
const app = (0, express_1.default)();
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
const { invalidCsrfTokenError, // Erreur si token invalide
generateCsrfToken, // Fonction pour générer token
doubleCsrfProtection, // Middleware pour valider token CSRF
 } = (0, csrf_csrf_1.doubleCsrf)({
    getSecret: () => process.env.CSRF_SECRET || 'csrf-secret-change-in-production',
    cookieName: 'x-csrf-token',
    cookieOptions: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en prod
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
    legacyHeaders: false
});
// Limiter strict pour l'authentification (login, register)
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Maximum 5 tentatives par IP
    message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    skipSuccessfulRequests: true // Ne compte que les échecs
});
// Application des middlewares
app.use((0, cors_1.default)(corsOptions)); // Gestion CORS
app.use(body_parser_1.default.json({ limit: '10mb' })); // Parse JSON (max 10MB pour documents base64)
app.use(body_parser_1.default.urlencoded({ extended: true })); // Parse form data
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
app.use('/api/auth', authLimiter, doubleCsrfProtection, auth_1.default); // 🔒 Auth avec rate limiting + CSRF
app.use('/api/policies', doubleCsrfProtection, policies_1.default); // 🔒 Policies avec CSRF
app.use('/api/ai', doubleCsrfProtection, ai_1.default); // 🔒 AI avec CSRF
// -----------------------------------------------------------------------------
// Démarrage du serveur
// -----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '4000', 10); // Port configurable via variable d'environnement
// Initialisation de la table d'audit au démarrage
(0, auditService_1.initAuditTable)().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`AssurClair backend listening on 0.0.0.0:${PORT}`);
    });
}).catch(err => {
    console.error('❌ Erreur initialisation:', err);
    process.exit(1);
});
