import { Router } from 'express';
import { storage } from '../storage';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserProfileData } from '../types';

// -----------------------------------------------------------------------------
// Routes d'authentification
// - Inscription, connexion, réinitialisation de mot de passe, lecture/mise à jour
//   du profil utilisateur. Les mots de passe sont hachés avec bcrypt et les
//   tokens d'accès sont des JWT signés avec `JWT_SECRET`.
// -----------------------------------------------------------------------------

const router = Router();
// Clé secrète pour signer les tokens JWT (à configurer via variable d'environnement en production)
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

/**
 * Génère un token JWT pour un utilisateur authentifié.
 * Le token contient l'ID, l'email et le nom de l'utilisateur.
 * Durée de validité : 7 jours.
 * @param user - Objet utilisateur contenant les informations à encoder
 * @returns Token JWT signé
 */
function signToken(user: User) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
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
function authMiddleware(req: any, res: any, next: any) {
  // Récupération du header Authorization
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing authorization' });
  
  // Vérification du format "Bearer <token>"
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid auth' });
  
  try {
    // Vérification de la signature du JWT et extraction du payload
    const payload = jwt.verify(parts[1], JWT_SECRET) as any;
    // Injection des données utilisateur dans la requête pour les routes suivantes
    req.user = payload;
    next();
  } catch (e) {
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
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  try {
    // Vérification de l'unicité de l'email (insensible à la casse)
    const users = await storage.readUsers();
    if (users.find((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ message: 'Email is already used' });
    }

    // Hachage sécurisé du mot de passe avec bcrypt (coût facteur 10)
    const hashed = await bcrypt.hash(password, 10);
    
    // Génération automatique d'un nom d'affichage à partir de l'email
    // Ex: "jean.dupont@email.com" -> "Jean Dupont"
    const displayName = email.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    
    // Création du nouvel utilisateur avec profil vide et accès non-admin par défaut
    const newUser: any = { 
      email, 
      name: displayName, 
      password: hashed,            // Mot de passe haché (jamais stocké en clair)
      profile: {},                 // Profil initialisé vide (à compléter ultérieurement)
      isAdmin: false               // Par défaut, les nouveaux utilisateurs ne sont pas admin
    };
    
    // Insertion dans PostgreSQL et récupération de l'ID généré
    const userId = await storage.writeUser(newUser);
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
  } catch (err) {
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
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  
  try {
    // Recherche de l'utilisateur par email (insensible à la casse)
    const users = await storage.readUsers();
    const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return res.status(400).json({ message: 'Invalid credentials' });
    
    // Vérification du mot de passe avec bcrypt (compare le hash stocké avec le mot de passe fourni)
    const ok = await bcrypt.compare(password, found.password);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
    
    // Génération d'un token JWT pour la session
    const token = signToken(found);
    res.json({ 
      token, 
      user: { 
        id: found.id, 
        email: found.email, 
        name: found.name,
        profile: found.profile || {},       // Retourne un objet vide si pas de profil
        isAdmin: found.isAdmin || false     // Retourne false si pas défini
      } 
    });
  } catch (err) {
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
  if (!email || !newPassword) return res.status(400).json({ message: 'Invalid' });
  
  try {
    // Recherche de l'utilisateur par email
    const users = await storage.readUsers();
    const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Hachage du nouveau mot de passe et mise à jour
    user.password = await bcrypt.hash(newPassword, 10);
    await storage.writeUser(user);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Route GET /api/auth/me (protégée)
 * Récupération des informations de l'utilisateur actuellement connecté.
 * Nécessite un token JWT valide dans le header Authorization.
 */
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const users = await storage.readUsers();
    // Recherche de l'utilisateur par ID extrait du token JWT
    const u = users.find((x: any) => x.id === req.user.id);
    if (!u) return res.status(404).json({ message: 'User not found' });
    
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
  } catch (err) {
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
router.put('/me', authMiddleware, async (req: any, res) => {
  try {
    const users = await storage.readUsers();
    // Recherche de l'utilisateur par ID extrait du token JWT
    const user = users.find((x: any) => x.id === req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const { name, email, password, profile } = req.body;
    
    // Mise à jour des champs fournis (ne modifie que les champs présents dans la requête)
    user.name = name || user.name;
    user.email = email || user.email;
    user.profile = profile !== undefined ? profile : (user.profile || {});
    
    // Si un nouveau mot de passe est fourni, le hache avant de le stocker
    if (password) user.password = await bcrypt.hash(password, 10);
    
    await storage.writeUser(user);
    
    // Retourne les données mises à jour (sans le mot de passe) avec la structure attendue
    res.json({ 
      user: {
        id: user.id, 
        email: user.email, 
        name: user.name,
        profile: user.profile,
        isAdmin: user.isAdmin || false
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Génère un identifiant unique pour un utilisateur.
 * Utilise crypto.randomUUID() si disponible (Node.js 15+),
 * sinon génère un ID basé sur le timestamp et un nombre aléatoire.
 * @returns Identifiant unique sous forme de chaîne
 */
function cryptoId() {
  return (globalThis as any).crypto?.randomUUID 
    ? (globalThis as any).crypto.randomUUID()  // UUID v4 standard
    : Date.now().toString(36) + Math.random().toString(36).slice(2,8);  // Fallback pour anciennes versions
}

export default router;