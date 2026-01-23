"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const storage_1 = require("../storage");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// -----------------------------------------------------------------------------
// Routes d'authentification
// - Inscription, connexion, réinitialisation de mot de passe, lecture/mise à jour
//   du profil utilisateur. Les mots de passe sont hachés avec bcrypt et les
//   tokens d'accès sont des JWT signés avec `JWT_SECRET`.
// -----------------------------------------------------------------------------
const router = (0, express_1.Router)();
// Clé secrète pour signer les tokens JWT (à configurer via variable d'environnement en production)
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
/**
 * Génère un token JWT pour un utilisateur authentifié.
 * Le token contient l'ID, l'email et le nom de l'utilisateur.
 * Durée de validité : 7 jours.
 * @param user - Objet utilisateur contenant les informations à encoder
 * @returns Token JWT signé
 */
function signToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
/**
 * Middleware d'authentification qui vérifie la validité du token JWT.
 * Extrait le token depuis le header "Authorization: Bearer <token>" et vérifie sa signature.
 * Si valide, injecte les données utilisateur dans req.user et passe au middleware suivant.
 * Sinon, retourne une erreur 401 Unauthorized.
 * @param req - Requête Express
 * @param res - Réponse Express
 * @param next - Fonction de passage au middleware suivant
 */
function authMiddleware(req, res, next) {
    // Récupération du header Authorization
    const auth = req.headers.authorization;
    if (!auth)
        return res.status(401).json({ message: 'Missing authorization' });
    // Vérification du format "Bearer <token>"
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
        return res.status(401).json({ message: 'Invalid auth' });
    try {
        // Vérification de la signature du JWT et extraction du payload
        const payload = jsonwebtoken_1.default.verify(parts[1], JWT_SECRET);
        // Injection des données utilisateur dans la requête pour les routes suivantes
        req.user = payload;
        next();
    }
    catch (e) {
        // Token invalide ou expiré
        return res.status(401).json({ message: 'Invalid token' });
    }
}
/**
 * Route POST /api/auth/register
 * Inscription d'un nouvel utilisateur dans l'application.
 * Vérifie l'unicité de l'email, hache le mot de passe avec bcrypt,
 * crée le compte et retourne un token JWT pour connexion immédiate.
 */
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    // Validation des champs requis
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required' });
    try {
        // Vérification de l'unicité de l'email (insensible à la casse)
        const users = await storage_1.storage.readUsers();
        if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({ message: 'Email is already used' });
        }
        // Hachage sécurisé du mot de passe avec bcrypt (coût facteur 10)
        const hashed = await bcryptjs_1.default.hash(password, 10);
        // Génération automatique d'un nom d'affichage à partir de l'email
        // Ex: "jean.dupont@email.com" -> "Jean Dupont"
        const displayName = email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        // Création du nouvel utilisateur avec profil vide et accès non-admin par défaut
        const newUser = {
            email,
            name: displayName,
            password: hashed, // Mot de passe haché (jamais stocké en clair)
            profile: {}, // Profil initialisé vide (à compléter ultérieurement)
            isAdmin: false // Par défaut, les nouveaux utilisateurs ne sont pas admin
        };
        // Insertion dans PostgreSQL et récupération de l'ID généré
        const userId = await storage_1.storage.writeUser(newUser);
        newUser.id = userId;
        // Génération d'un token JWT pour connexion automatique après inscription
        const token = signToken(newUser);
        res.json({
            token,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                profile: newUser.profile,
                isAdmin: newUser.isAdmin
            }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * Route POST /api/auth/login
 * Connexion d'un utilisateur existant.
 * Vérifie les identifiants (email/mot de passe) et retourne un token JWT si valides.
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    // Validation des champs requis
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required' });
    try {
        // Recherche de l'utilisateur par email (insensible à la casse)
        const users = await storage_1.storage.readUsers();
        const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!found)
            return res.status(400).json({ message: 'Invalid credentials' });
        // Vérification du mot de passe avec bcrypt (compare le hash stocké avec le mot de passe fourni)
        const ok = await bcryptjs_1.default.compare(password, found.password);
        if (!ok)
            return res.status(400).json({ message: 'Invalid credentials' });
        // Génération d'un token JWT pour la session
        const token = signToken(found);
        res.json({
            token,
            user: {
                id: found.id,
                email: found.email,
                name: found.name,
                profile: found.profile || {}, // Retourne un objet vide si pas de profil
                isAdmin: found.isAdmin || false // Retourne false si pas défini
            }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * Route POST /api/auth/reset
 * Réinitialisation du mot de passe d'un utilisateur.
 * En production, cette route devrait être sécurisée par un token de réinitialisation
 * envoyé par email. Ici, version simplifiée pour démonstration.
 */
router.post('/reset', async (req, res) => {
    const { email, newPassword } = req.body;
    // Validation des champs requis
    if (!email || !newPassword)
        return res.status(400).json({ message: 'Invalid' });
    try {
        // Recherche de l'utilisateur par email
        const users = await storage_1.storage.readUsers();
        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // Hachage du nouveau mot de passe et mise à jour
        user.password = await bcryptjs_1.default.hash(newPassword, 10);
        await storage_1.storage.writeUser(user);
        res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * Route GET /api/auth/me (protégée)
 * Récupération des informations de l'utilisateur actuellement connecté.
 * Nécessite un token JWT valide dans le header Authorization.
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const users = await storage_1.storage.readUsers();
        // Recherche de l'utilisateur par ID extrait du token JWT
        const u = users.find((x) => x.id === req.user.id);
        if (!u)
            return res.status(404).json({ message: 'User not found' });
        // Retourne les données utilisateur (sans le mot de passe) avec structure cohérente
        res.json({
            user: {
                id: u.id,
                email: u.email,
                name: u.name,
                profile: u.profile || {},
                isAdmin: u.isAdmin || false
            }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * Route PUT /api/auth/me (protégée)
 * Mise à jour des informations de l'utilisateur connecté.
 * Permet de modifier le nom, l'email, le mot de passe et le profil détaillé.
 * Nécessite un token JWT valide dans le header Authorization.
 */
router.put('/me', authMiddleware, async (req, res) => {
    try {
        console.log('📝 PUT /me - User ID:', req.user.id);
        console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
        const users = await storage_1.storage.readUsers();
        // Recherche de l'utilisateur par ID extrait du token JWT
        const user = users.find((x) => x.id === req.user.id);
        if (!user) {
            console.error('❌ User not found:', req.user.id);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('👤 Current user:', { id: user.id, name: user.name, email: user.email });
        const { name, email, password, profile } = req.body;
        // Mise à jour des champs fournis (ne modifie que les champs présents dans la requête)
        // ⚠️ L'email est une clé unique et ne peut pas être modifié après création du compte
        if (name !== undefined) {
            console.log(`📝 Updating name: "${user.name}" -> "${name}"`);
            user.name = name;
        }
        if (email !== undefined && email !== user.email) {
            console.warn('⚠️ Email modification blocked - email is a unique key');
            return res.status(400).json({ message: 'Email cannot be changed' });
        }
        if (profile !== undefined)
            user.profile = profile;
        console.log('📝 Updated user data:', { id: user.id, name: user.name, email: user.email, profile: user.profile });
        // Si un nouveau mot de passe est fourni, le hache avant de le stocker
        if (password) {
            console.log('🔒 Hashing new password...');
            user.password = await bcryptjs_1.default.hash(password, 10);
        }
        // Sauvegarder dans la base de données
        console.log('💾 Saving to database...');
        await storage_1.storage.writeUser(user);
        console.log('✅ User saved successfully');
        // Relire les données depuis la base pour être sûr d'avoir les valeurs à jour
        const updatedUsers = await storage_1.storage.readUsers();
        const updatedUser = updatedUsers.find((x) => x.id === req.user.id);
        if (!updatedUser) {
            console.error('❌ Updated user not found after save!');
            return res.status(500).json({ message: 'Failed to retrieve updated user' });
        }
        console.log('✅ Updated user retrieved:', { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email });
        // Retourne les données mises à jour (sans le mot de passe) avec la structure attendue
        res.json({
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                profile: updatedUser.profile,
                isAdmin: updatedUser.isAdmin || false
            }
        });
    }
    catch (err) {
        console.error('❌ Error in PUT /me:', err);
        res.status(500).json({ message: 'Server error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
/**
 * Génère un identifiant unique pour un utilisateur.
 * Utilise crypto.randomUUID() si disponible (Node.js 15+),
 * sinon génère un ID basé sur le timestamp et un nombre aléatoire.
 * @returns Identifiant unique sous forme de chaîne
 */
function cryptoId() {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID() // UUID v4 standard
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // Fallback pour anciennes versions
}
exports.default = router;
