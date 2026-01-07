import { Router } from 'express';
import { storage } from '../storage';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../types';

// -----------------------------------------------------------------------------
// Routes d'authentification
// - Inscription, connexion, réinitialisation de mot de passe, lecture/mise à jour
//   du profil utilisateur. Les mots de passe sont hachés avec bcrypt et les
//   tokens d'accès sont des JWT signés avec `JWT_SECRET`.
// -----------------------------------------------------------------------------

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function signToken(user: User) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req: any, res: any, next: any) {
  // Middleware qui vérifie la présence d'un header Authorization: Bearer <token>
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid auth' });
  try {
    // Vérification du JWT et injection du payload dans req.user
    const payload = jwt.verify(parts[1], JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  // On vérifie que l'email n'est pas déjà utilisé (comparaison case-insensitive)
  const users = storage.readUsers();
  if (users.find((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ message: 'Email is already used' });
  }

  // Hachage du mot de passe et insertion dans users.json
  const hashed = await bcrypt.hash(password, 10);
  const displayName = email.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const newUser = { id: cryptoId(), email, name: displayName, password: hashed };
  users.push(newUser);
  storage.writeUsers(users);

  // Retourne un token JWT au client pour simplifier la démo
  const token = signToken(newUser);
  res.json({ token, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const users = storage.readUsers();
  const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (!found) return res.status(400).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, found.password);
  if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
  const token = signToken(found);
  res.json({ token, user: { id: found.id, email: found.email, name: found.name } });
});

router.post('/reset', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ message: 'Invalid' });
  const users = storage.readUsers();
  const idx = users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ message: 'User not found' });
  users[idx].password = await bcrypt.hash(newPassword, 10);
  storage.writeUsers(users);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req: any, res) => {
  const users = storage.readUsers();
  const u = users.find((x: any) => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: 'User not found' });
  res.json({ id: u.id, email: u.email, name: u.name });
});

router.put('/me', authMiddleware, (req: any, res) => {
  const users = storage.readUsers();
  const idx = users.findIndex((x: any) => x.id === req.user.id);
  if (idx === -1) return res.status(404).json({ message: 'User not found' });
  const { name, email, password } = req.body;
  users[idx].name = name || users[idx].name;
  users[idx].email = email || users[idx].email;
  if (password) users[idx].password = bcrypt.hashSync(password, 10);
  storage.writeUsers(users);
  res.json({ id: users[idx].id, email: users[idx].email, name: users[idx].name });
});

function cryptoId() {
  return (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

export default router;