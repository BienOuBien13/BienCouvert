"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = __importDefault(require("body-parser"));
const auth_1 = __importDefault(require("./routes/auth"));
const policies_1 = __importDefault(require("./routes/policies"));
const ai_1 = __importDefault(require("./routes/ai"));
require("./db"); // Initialisation de la connexion PostgreSQL
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
        }
    };
}
// Application des middlewares
app.use((0, cors_1.default)(corsOptions)); // Gestion CORS
app.use(body_parser_1.default.json({ limit: '10mb' })); // Parse JSON (max 10MB pour documents base64)
app.use(body_parser_1.default.urlencoded({ extended: true })); // Parse form data
// -----------------------------------------------------------------------------
// Routes de l'API
// -----------------------------------------------------------------------------
/**
 * Route GET /
 * Endpoint de santé (health check) pour vérifier que le serveur est opérationnel.
 * Utile pour les systèmes de monitoring et les load balancers.
 */
app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));
// Montage des routes principales de l'API
app.use('/api/auth', auth_1.default); // Routes d'authentification (login, register, profile)
app.use('/api/policies', policies_1.default); // Routes de gestion des polices et du référentiel CG
app.use('/api/ai', ai_1.default); // Routes d'interaction avec l'IA (chat, analyse)
// -----------------------------------------------------------------------------
// Démarrage du serveur
// -----------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '4000', 10); // Port configurable via variable d'environnement
app.listen(PORT, '0.0.0.0', () => {
    console.log(`AssurClair backend listening on 0.0.0.0:${PORT}`);
});
