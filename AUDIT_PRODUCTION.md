# Audit Production — AssurClair
> Contrôle global avant mise en usage public / publication sur store (Google Play / App Store)

---

## Résumé global

| Catégorie | Statut | Priorité |
|-----------|--------|----------|
| Secrets & Variables d'env | ⚠️ À corriger | 🔴 CRITIQUE |
| Rate Limiting API | ✅ Corrigé (cette session) | — |
| HTTPS / TLS | ✅ Géré par nginx Azure | ✅ OK |
| Authentification JWT | ⚠️ Durée à réduire | 🟡 |
| CSRF Protection | ✅ Activé | ✅ OK |
| Helmet / HTTP Headers | ✅ Activé | ✅ OK |
| Mots de passe (hash bcrypt) | ✅ Implémenté | ✅ OK |
| RGPD / Droit à l'effacement | ⚠️ Partiel | 🔴 OBLIGATOIRE |
| Politique de confidentialité | ❌ Absente | 🔴 OBLIGATOIRE STORE |
| Suppression de compte | ❌ Non implémentée | 🔴 OBLIGATOIRE STORE |
| Injection SQL | ✅ Requêtes paramétrées | ✅ OK |
| Upload de fichiers | ⚠️ Validation MIME manquante | 🟡 |
| Dépendances vulnérables | ⚠️ Versions `latest` non fixées | 🟡 |
| Logs / Audit | ✅ auditService présent | ✅ OK |
| Variables env non committées | ✅ .env exclu | ✅ OK |

---

## 🔴 CRITIQUES (blocants pour la production)

### 1. Secrets par défaut en dur

**Fichiers concernés :** `BackEnd/src/routes/auth.ts`, `BackEnd/src/index.ts`

```typescript
// DANGEREUX si JWT_SECRET n'est pas défini dans .env
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret-change-in-production';
```

**Risque :** Si les variables d'environnement ne sont pas définies sur la VM, les tokens JWT et CSRF seront signés avec des secrets publics → falsification possible de tokens.

**Correction :**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');

const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET) throw new Error('CSRF_SECRET is not set');
```
Ajouter aussi une vérification au démarrage du serveur dans `src/index.ts` :
```typescript
const REQUIRED_ENV = ['JWT_SECRET', 'CSRF_SECRET', 'DATABASE_URL'];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
});
```

---

### 2. Durée JWT trop longue

**Fichier :** `BackEnd/src/routes/auth.ts` ligne 39

```typescript
return jwt.sign({ ... }, JWT_SECRET, { expiresIn: '7d' });
```

**Risque :** Un token volé est valide 7 jours sans possibilité de révocation (pas de blacklist).

**Correction recommandée :**
- Réduire à `'24h'` ou `'2h'` + implémenter un refresh token avec rotation
- Ou à minima ajouter une table `revoked_tokens` pour la déconnexion

---

### 3. Suppression de compte (OBLIGATOIRE Google Play / App Store)

**État :** Non implémentée

**Obligation :** Google Play Policy (Data Deletion) et Apple App Store Guidelines exigent qu'une application permettant la création de compte offre un moyen de **supprimer son compte et ses données**. Sans cela, le compte développeur risque d'être suspendu.

**À implémenter :**

Backend — ajouter dans `auth.ts` :
```typescript
// DELETE /api/auth/account
router.delete('/account', csrfProtection, requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  await pool.query('DELETE FROM user_analysis_profile WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM policies WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  res.json({ message: 'Compte et données supprimés.' });
});
```

Frontend — ajouter dans les paramètres utilisateur un bouton "Supprimer mon compte" avec confirmation modale.

---

### 4. Politique de confidentialité (OBLIGATOIRE store)

**État :** Aucune page / URL de politique de confidentialité

**Obligation :** Les deux stores (Google Play + Apple App Store) exigent une URL de politique de confidentialité lors de la soumission, et celle-ci doit être accessible depuis l'application.

**À créer :**
- Une page `/privacy` dans le frontend React
- Ou héberger un PDF/page HTML accessible publiquement
- Mentionner : données collectées, durée de conservation, droits RGPD, contact DPO
- Lien visible dans la page de connexion et dans les paramètres

---

## 🟡 IMPORTANTS (à corriger avant publication)

### 5. Validation MIME côté serveur pour l'upload de PDF

**Fichier :** `BackEnd/src/routes/policies.ts` (multer upload)

```typescript
const upload = multer({ storage: multer.memoryStorage() });
```

Multer accepte actuellement tout type de fichier. Un attaquant peut uploader un fichier exécutable malveillant.

**Correction :**
```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max
});
```

---

### 6. Rate limiting sur les endpoints IA

**Fichier :** `BackEnd/src/routes/ai.ts`

Les appels IA (Gemini) ne sont pas rate-limités spécifiquement. Un utilisateur malveillant peut générer des milliers de requêtes et engendrer des coûts importants sur votre clé API.

**Correction :** Ajouter un rate limiter strict sur `/api/ai/` :
```typescript
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 5,                 // Max 5 requêtes IA par minute par IP
  message: 'Limite d'analyse IA atteinte, réessayez dans une minute.',
});
app.use('/api/ai', aiLimiter, doubleCsrfProtection, aiRoutes);
```

---

### 7. Dépendances non épinglées

**Fichier :** `BackEnd/package.json`

```json
"@google/generative-ai": "latest"
```

Utiliser `latest` sans version fixe peut introduire des breaking changes à chaque `npm install`.

**Correction :**
```bash
npm install @google/generative-ai@0.21.0
```
Épingler toutes les dépendances avec des versions exactes ou utiliser `npm ci` en production.

---

### 8. Headers de sécurité — `connectSrc` trop restrictif en production

**Fichier :** `BackEnd/src/index.ts` (CSP Helmet)

```typescript
connectSrc: ["'self'"],
```

Si le frontend tourne sur un domaine différent du backend (ex: app.assurclair.fr → api.assurclair.fr), la CSP bloquera les requêtes fetch. Adapter selon votre architecture :
```typescript
connectSrc: ["'self'", process.env.FRONTEND_ORIGIN || "'self'"],
```

---

### 9. Confirmation email à la création de compte

**État :** Non implémentée

Un utilisateur peut s'inscrire avec n'importe quelle adresse email sans vérification. Cela expose à des inscriptions frauduleuses et à des violations de compte.

**À implémenter :** Envoi d'un email de confirmation avec un lien tokenisé (nodemailer ou service transactionnel comme SendGrid/Brevo).

---

## 🟢 DÉJÀ EN PLACE (bonnes pratiques confirmées)

| Bonne pratique | Implémentation |
|----------------|---------------|
| bcrypt pour les mots de passe | `bcryptjs` avec salt rounds |
| Validation du mot de passe (complexité) | `passwordValidator.ts` |
| Requêtes SQL paramétrées (anti-injection) | `pg` avec placeholders `$1, $2` |
| CSRF Protection (double submit) | `csrf-csrf` activé sur toutes les routes mutantes |
| HTTP Security Headers | `helmet` activé avec CSP, HSTS, frameguard |
| Rate Limiting général | `express-rate-limit` 100 req/15min |
| Rate Limiting masterdata | 500 req/15min (ajouté cette session) |
| Polling vectorisation sécurisé | Skip du rate limiter + intervalle 8s (corrigé cette session) |
| Cache masterdata backend | TTL 5 min en mémoire (ajouté cette session) |
| Cache masterdata frontend | Module-level cache dans `useMasterData.ts` |
| HTTPS / TLS | Nginx Azure avec certificat |
| CORS restrictif | Configurable via `FRONTEND_ORIGIN` |
| Audit logs | `auditService.ts` initialisé au démarrage |
| Variables d'env séparées | `.env` non committé |
| Cookies httpOnly | JWT via cookie httpOnly en production |

---

## 📱 Spécifique Google Play Store

Avant soumission, vérifiez les points suivants dans la **Google Play Console** :

| Exigence | Statut |
|----------|--------|
| Politique de confidentialité (URL publique) | ❌ Manquante |
| Formulaire de sécurité des données (Data Safety) | ❌ À remplir |
| Suppression de compte depuis l'app | ❌ Non implémentée |
| Permissions justifiées (READ_EXTERNAL_STORAGE, INTERNET...) | 🟡 À auditer |
| targetSdkVersion ≥ 34 (Android 14) | 🟡 Vérifier dans la config React Native / WebView |
| Pas d'API key en clair dans le bundle JS | ✅ Via VITE_API_URL backend |
| Chiffrement des données sensibles en transit | ✅ HTTPS |

---

## 📋 Plan d'action prioritaire

```
Semaine 1 — Critique
  [ ] 1. Ajouter vérification des ENV au démarrage (exit si manquant)
  [ ] 2. Implémenter DELETE /api/auth/account
  [ ] 3. Créer la page / URL politique de confidentialité
  [ ] 4. Ajouter bouton "Supprimer mon compte" dans le profil utilisateur

Semaine 2 — Important
  [ ] 5. Rate limiting sur /api/ai/*
  [ ] 6. Validation MIME multer pour les uploads PDF
  [ ] 7. Réduire JWT expiresIn de '7d' à '24h'
  [ ] 8. Épingler les versions de dépendances dans package.json
  [ ] 9. Remplir le formulaire Data Safety Google Play

Avant publication app store
  [ ] 10. Test de pénétration basique (Burp Suite / OWASP ZAP)
  [ ] 11. Vérification de toutes les routes avec un utilisateur non authentifié
  [ ] 12. Test de charge pour valider le rate limiting
```

---

*Rapport généré lors de la session de développement — AssurClair v0.1.0*
