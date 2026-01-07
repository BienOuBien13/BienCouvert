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
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
function signToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
    // Middleware qui vérifie la présence d'un header Authorization: Bearer <token>
    const auth = req.headers.authorization;
    if (!auth)
        return res.status(401).json({ message: 'Missing authorization' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
        return res.status(401).json({ message: 'Invalid auth' });
    try {
        // Vérification du JWT et injection du payload dans req.user
        const payload = jsonwebtoken_1.default.verify(parts[1], JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (e) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required' });
    // On vérifie que l'email n'est pas déjà utilisé (comparaison case-insensitive)
    const users = storage_1.storage.readUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ message: 'Email is already used' });
    }
    // Hachage du mot de passe et insertion dans users.json
    const hashed = await bcryptjs_1.default.hash(password, 10);
    const displayName = email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    const newUser = { id: cryptoId(), email, name: displayName, password: hashed };
    users.push(newUser);
    storage_1.storage.writeUsers(users);
    // Retourne un token JWT au client pour simplifier la démo
    const token = signToken(newUser);
    res.json({ token, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required' });
    const users = storage_1.storage.readUsers();
    const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!found)
        return res.status(400).json({ message: 'Invalid credentials' });
    const ok = await bcryptjs_1.default.compare(password, found.password);
    if (!ok)
        return res.status(400).json({ message: 'Invalid credentials' });
    const token = signToken(found);
    res.json({ token, user: { id: found.id, email: found.email, name: found.name } });
});
router.post('/reset', async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
        return res.status(400).json({ message: 'Invalid' });
    const users = storage_1.storage.readUsers();
    const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1)
        return res.status(404).json({ message: 'User not found' });
    users[idx].password = await bcryptjs_1.default.hash(newPassword, 10);
    storage_1.storage.writeUsers(users);
    res.json({ ok: true });
});
router.get('/me', authMiddleware, (req, res) => {
    const users = storage_1.storage.readUsers();
    const u = users.find((x) => x.id === req.user.id);
    if (!u)
        return res.status(404).json({ message: 'User not found' });
    res.json({ id: u.id, email: u.email, name: u.name });
});
router.put('/me', authMiddleware, (req, res) => {
    const users = storage_1.storage.readUsers();
    const idx = users.findIndex((x) => x.id === req.user.id);
    if (idx === -1)
        return res.status(404).json({ message: 'User not found' });
    const { name, email, password } = req.body;
    users[idx].name = name || users[idx].name;
    users[idx].email = email || users[idx].email;
    if (password)
        users[idx].password = bcryptjs_1.default.hashSync(password, 10);
    storage_1.storage.writeUsers(users);
    res.json({ id: users[idx].id, email: users[idx].email, name: users[idx].name });
});
function cryptoId() {
    return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
exports.default = router;
