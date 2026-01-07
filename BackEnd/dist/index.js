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
dotenv_1.default.config();
const app = (0, express_1.default)();
// -----------------------------------------------------------------------------
// Configuration CORS & Middleware
// - FRONTEND_ORIGIN peut être une origine unique (ex: https://localhost:3000) ou
//   une liste séparée par des virgules. Lorsqu'il est configuré, seules les
//   origines listées sont autorisées; sinon, '*' autorise toutes les origines.
// - On autorise aussi les requêtes sans `Origin` (ex: curl, Postman) pour les
//   appels en ligne de commande en développement.
// -----------------------------------------------------------------------------
// Support a single origin or a comma-separated list in FRONTEND_ORIGIN
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
let corsOptions = { origin: '*' };
if (frontendOrigin && frontendOrigin !== '*') {
    const allowed = frontendOrigin.split(',').map(s => s.trim()).filter(Boolean);
    corsOptions = {
        origin: (origin, callback) => {
            // Les requêtes sans origin (ex: curl/postman) sont autorisées en dev.
            if (!origin)
                return callback(null, true);
            if (allowed.includes(origin))
                return callback(null, true);
            return callback(new Error('Not allowed by CORS'), false);
        }
    };
}
app.use((0, cors_1.default)(corsOptions));
app.use(body_parser_1.default.json({ limit: '10mb' }));
app.use(body_parser_1.default.urlencoded({ extended: true }));
// Point de santé simple pour vérifier que le service est up
app.get('/', (req, res) => res.json({ ok: true, version: 'back-end-v0.1' }));
// Routes principales
app.use('/api/auth', auth_1.default);
app.use('/api/policies', policies_1.default);
app.use('/api/ai', ai_1.default);
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AssurClair backend listening on port ${PORT}`));
