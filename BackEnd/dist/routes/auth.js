"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const storage_1 = require("../storage");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_validator_1 = require("express-validator");
const passwordValidator_1 = require("../utils/passwordValidator");
const auditService_1 = require("../services/auditService");
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
 * Le token contient l'ID, l'email, le prénom et nom de l'utilisateur.
 * Durée de validité : 7 jours.
 * @param user - Objet utilisateur contenant les informations à encoder
 * @returns Token JWT signé
 */
function signToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }, JWT_SECRET, { expiresIn: '7d' });
}
/**
 * Middleware d'authentification qui vérifie la validité du token JWT.
 * Extrait le token depuis le cookie httpOnly OU le header "Authorization: Bearer <token>".
 * Si valide, injecte les données utilisateur dans req.user et passe au middleware suivant.
 * Sinon, retourne une erreur 401 Unauthorized.
 * @param req - Requête Express
 * @param res - Réponse Express
 * @param next - Fonction de passage au middleware suivant
 */
function authMiddleware(req, res, next) {
    // 🔒 Priorité 1: Cookie httpOnly (sécurisé)
    let token = req.cookies?.token;
    // 🔓 Fallback: Header Authorization (compatibilité ancienne version)
    if (!token) {
        const auth = req.headers.authorization;
        if (auth) {
            const parts = auth.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
            }
        }
    }
    if (!token) {
        return res.status(401).json({ message: 'Missing authentication token' });
    }
    try {
        // Vérification de la signature du JWT et extraction du payload
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
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
 * crée le compte et retourne un token JWT en cookie httpOnly.
 */
router.post('/register', [
    // 🔒 Validation des inputs avec express-validator
    (0, express_validator_1.body)('email')
        .isEmail().withMessage('Email invalide')
        .normalizeEmail(),
    (0, express_validator_1.body)('password')
        .isLength({ min: 12 }).withMessage('Le mot de passe doit contenir au moins 12 caractères'),
    (0, express_validator_1.body)('firstName')
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage('Prénom trop long (max 50 caractères)')
        .matches(/^[a-zA-ZÀ-ſ\s-']+$/).withMessage('Prénom contient des caractères invalides'),
    (0, express_validator_1.body)('lastName')
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage('Nom trop long (max 50 caractères)')
        .matches(/^[a-zA-ZÀ-ſ\s-']+$/).withMessage('Nom contient des caractères invalides')
], async (req, res) => {
    // Vérifier les erreurs de validation
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Données invalides',
            errors: errors.array()
        });
    }
    const { email, password } = req.body;
    // Validation des champs requis
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required' });
    // 🔒 Validation de la politique de mot de passe (ANSSI)
    const passwordCheck = (0, passwordValidator_1.validatePassword)(password);
    if (!passwordCheck.valid) {
        return res.status(400).json({
            message: 'Le mot de passe ne respecte pas les critères de sécurité',
            errors: passwordCheck.errors,
            requirements: (0, passwordValidator_1.getPasswordRequirements)()
        });
    }
    try {
        // Vérification de l'unicité de l'email (insensible à la casse)
        const users = await storage_1.storage.readUsers();
        if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({ message: 'Email is already used' });
        }
        // Hachage sécurisé du mot de passe avec bcrypt (coût facteur 10)
        const hashed = await bcryptjs_1.default.hash(password, 10);
        // Génération automatique d'un nom d'affichage à partir de l'email
        // Ex: "jean.dupont@email.com" -> firstName: "Jean", lastName: "Dupont"
        const nameParts = email.split('@')[0].split('.');
        const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Utilisateur';
        const lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : '';
        // CrÃ©ation du nouvel utilisateur avec profil vide et accÃ¨s non-admin par dÃ©faut
        const newUser = {
            email,
            firstName,
            lastName,
            password: hashed, // Mot de passe haché (jamais stocké en clair)
            profile: {}, // Profil initialisé vide (à compléter ultérieurement)
            isAdmin: false // Par défaut, les nouveaux utilisateurs ne sont pas admin
        };
        // Insertion dans PostgreSQL et récupération de l'ID généré
        const userId = await storage_1.storage.writeUser(newUser);
        newUser.id = userId;
        // 📝 Audit: Enregistrement nouveau compte
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_REGISTER,
            userId: newUser.id,
            userEmail: newUser.email,
            ...(0, auditService_1.getAuditContext)(req),
            details: { profile: req.body.profile || 'client' }
        });
        // Génération d'un token JWT pour connexion automatique après inscription
        const token = signToken(newUser);
        // 🔒 Envoi du token en cookie httpOnly (sécurisé contre XSS)
        res.cookie('token', token, {
            httpOnly: true, // Inaccessible depuis JavaScript (protection XSS)
            secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en production
            sameSite: 'strict', // Protection CSRF
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
            path: '/'
        });
        res.json({
            token, // 📑 DEPRECATED: Envoyé pour compatibilité, utiliser cookie en priorité
            user: {
                id: newUser.id,
                email: newUser.email,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                profile: newUser.profile,
                isAdmin: newUser.isAdmin,
                geminiAiConsent: newUser.geminiAiConsent || false
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
 * Vérifie les identifiants (email/mot de passe) et retourne un token JWT en cookie httpOnly.
 */
router.post('/login', [
    // 🔒 Validation des inputs
    (0, express_validator_1.body)('email')
        .isEmail().withMessage('Email invalide')
        .normalizeEmail(),
    (0, express_validator_1.body)('password')
        .notEmpty().withMessage('Mot de passe requis')
], async (req, res) => {
    // Vérifier les erreurs de validation
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Données invalides',
            errors: errors.array()
        });
    }
    const { email, password } = req.body;
    try {
        // Recherche de l'utilisateur par email (insensible à la casse)
        const users = await storage_1.storage.readUsers();
        const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!found) {
            // 📝 Audit: Tentative de connexion avec email inexistant
            await (0, auditService_1.logAudit)({
                action: auditService_1.AuditAction.USER_FAILED_LOGIN,
                userEmail: email,
                ...(0, auditService_1.getAuditContext)(req),
                details: { reason: 'User not found' }
            });
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        // Vérification du mot de passe avec bcrypt (compare le hash stocké avec le mot de passe fourni)
        const ok = await bcryptjs_1.default.compare(password, found.password);
        if (!ok) {
            // 📝 Audit: Tentative de connexion échouée
            await (0, auditService_1.logAudit)({
                action: auditService_1.AuditAction.USER_FAILED_LOGIN,
                userEmail: email,
                ...(0, auditService_1.getAuditContext)(req),
                details: { reason: 'Invalid password' }
            });
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        // 📝 Audit: Connexion réussie
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_LOGIN,
            userId: found.id,
            userEmail: found.email,
            ...(0, auditService_1.getAuditContext)(req)
        });
        // Génération d'un token JWT pour la session
        const token = signToken(found);
        // 🔒 Envoi du token en cookie httpOnly (sécurisé contre XSS)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        res.json({
            token, // 📑 DEPRECATED: Pour compatibilité
            user: {
                id: found.id,
                email: found.email,
                firstName: found.firstName,
                lastName: found.lastName,
                profile: found.profile || {}, // Retourne un objet vide si pas de profil
                isAdmin: found.isAdmin || false, // Retourne false si pas défini
                geminiAiConsent: found.geminiAiConsent || false
            }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
/**
 * Route POST /api/auth/logout
 * Déconnecte l'utilisateur en supprimant le cookie de session.
 */
router.post('/logout', authMiddleware, async (req, res) => {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    // 📝 Audit: Déconnexion
    if (userId) {
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_LOGOUT,
            userId,
            userEmail,
            ...(0, auditService_1.getAuditContext)(req)
        });
    }
    // 🔒 Suppression du cookie httpOnly
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });
    res.json({ ok: true, message: 'Logged out successfully' });
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
    // 🔒 Validation de la politique de mot de passe (ANSSI)
    const passwordCheck = (0, passwordValidator_1.validatePassword)(newPassword);
    if (!passwordCheck.valid) {
        return res.status(400).json({
            message: 'Le nouveau mot de passe ne respecte pas les critères de sécurité',
            errors: passwordCheck.errors,
            requirements: (0, passwordValidator_1.getPasswordRequirements)()
        });
    }
    try {
        // Recherche de l'utilisateur par email
        const users = await storage_1.storage.readUsers();
        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // Hachage du nouveau mot de passe et mise à jour
        user.password = await bcryptjs_1.default.hash(newPassword, 10);
        await storage_1.storage.writeUser(user);
        // 📝 Audit: Réinitialisation mot de passe
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_PASSWORD_RESET,
            userId: user.id,
            userEmail: user.email,
            ...(0, auditService_1.getAuditContext)(req)
        });
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
                firstName: u.firstName,
                lastName: u.lastName,
                profile: u.profile || {},
                isAdmin: u.isAdmin || false,
                geminiAiConsent: u.geminiAiConsent || false
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
        console.log('👤 Current user:', { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email });
        const { firstName, lastName, email, password, profile, geminiAiConsent } = req.body;
        // Mise Ã  jour des champs fournis (ne modifie que les champs prÃ©sents dans la requÃªte)
        // â ️ L'email est une clÃ© unique et ne peut pas Ãªtre modifiÃ© aprÃ¨s crÃ©ation du compte
        if (firstName !== undefined) {
            console.log(`📝 Updating firstName: "${user.firstName}" -> "${firstName}"`);
            user.firstName = firstName;
        }
        if (lastName !== undefined) {
            console.log(`📝 Updating lastName: "${user.lastName}" -> "${lastName}"`);
            user.lastName = lastName;
        }
        if (email !== undefined && email !== user.email) {
            console.warn('⚠️ Email modification blocked - email is a unique key');
            return res.status(400).json({ message: 'Email cannot be changed' });
        }
        if (profile !== undefined)
            user.profile = profile;
        if (geminiAiConsent !== undefined) {
            console.log(`📝 Updating geminiAiConsent: ${user.geminiAiConsent} -> ${geminiAiConsent}`);
            user.geminiAiConsent = geminiAiConsent;
        }
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
        // 📝 Audit: Modification des données utilisateur
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_DATA_MODIFIED,
            userId: user.id,
            userEmail: user.email,
            ...(0, auditService_1.getAuditContext)(req),
            details: {
                fields: Object.keys(req.body).filter(k => k !== 'password'),
                geminiAiConsentChanged: geminiAiConsent !== undefined
            }
        });
        // Relire les données depuis la base pour être sûr d'avoir les valeurs à jour
        const updatedUsers = await storage_1.storage.readUsers();
        const updatedUser = updatedUsers.find((x) => x.id === req.user.id);
        if (!updatedUser) {
            console.error('❌ Updated user not found after save!');
            return res.status(500).json({ message: 'Failed to retrieve updated user' });
        }
        console.log('â Updated user retrieved:', { id: updatedUser.id, firstName: updatedUser.firstName, lastName: updatedUser.lastName, email: updatedUser.email });
        // Retourne les donnÃ©es mises Ã  jour (sans le mot de passe) avec la structure attendue
        res.json({
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                profile: updatedUser.profile,
                isAdmin: updatedUser.isAdmin || false,
                geminiAiConsent: updatedUser.geminiAiConsent || false
            }
        });
    }
    catch (err) {
        console.error('❌ Error in PUT /me:', err);
        res.status(500).json({ message: 'Server error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
});
/**
 * Route DELETE /api/auth/account (protégée)
 * Suppression définitive et irréversible du compte utilisateur.
 * Supprime toutes les données associées : profil, contrats, embeddings.
 * Conforme RGPD Art. 17 (droit à l'effacement).
 */
router.delete('/account', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userEmail = req.user.email;
    try {
        console.log(`🗑️ Deleting account for user ${userId}`);
        // 1. Supprimer tous les contrats de l'utilisateur (cascade vers embeddings)
        const policies = await storage_1.storage.readPolicies();
        const userPolicies = policies.filter((p) => p.userId === userId);
        console.log(`📄 Deleting ${userPolicies.length} policies...`);
        for (const policy of userPolicies) {
            await storage_1.storage.deletePolicy(policy.id);
        }
        // 2. Supprimer l'utilisateur de la base
        console.log(`👤 Deleting user account...`);
        await storage_1.storage.deleteUser(userId);
        // 📝 Audit: Suppression du compte (RGPD Art. 17)
        await (0, auditService_1.logAudit)({
            action: auditService_1.AuditAction.USER_ACCOUNT_DELETED,
            userId: userId,
            userEmail: userEmail,
            ...(0, auditService_1.getAuditContext)(req),
            details: {
                deletionType: 'user_requested',
                policiesCount: userPolicies.length
            }
        });
        console.log(`✅ Account ${userId} successfully deleted`);
        res.json({
            ok: true,
            message: 'Account successfully deleted. All your data has been permanently removed.'
        });
    }
    catch (err) {
        console.error('❌ Error deleting account:', err);
        res.status(500).json({
            message: 'Failed to delete account',
            error: err instanceof Error ? err.message : 'Unknown error'
        });
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
