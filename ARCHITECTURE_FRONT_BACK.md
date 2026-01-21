# 🏗️ ARCHITECTURE FRONT/BACK - ASSURCLAIR

## 📋 Vue d'ensemble

AssurClair fonctionne en architecture **Client-Serveur** avec:

- **Frontend** : React + TypeScript (Vite)
- **Backend** : Express + TypeScript (Node.js)
- **Communication** : REST API (JSON) + JWT Authentication

```
┌─────────────────────────────────────┐
│     FRONTEND (Port 3000/3001)       │
│   React + TypeScript + Vite         │
│                                     │
│   Components → Services → API       │
└──────────────┬──────────────────────┘
               │ HTTP/JSON + JWT
               ▼
┌─────────────────────────────────────┐
│     BACKEND (Port 4000)             │
│   Express + TypeScript              │
│                                     │
│   Routes → Storage → JSON Files     │
└─────────────────────────────────────┘
```

---

## 📁 Structure des fichiers

### Frontend Services

```
FrontEnd/services/
├── authService.ts              → VERSION BACKEND (appels API)
├── authService.standalone.ts   → Version localStorage (démo)
├── storageService.ts           → VERSION BACKEND (appels API)
├── storageService.standalone.ts → Version localStorage (démo)
├── geminiService.ts            → Appels Gemini AI
└── pdfService.ts               → Gestion PDF
```

**Important** : Les fichiers `.ts` (sans suffix) sont les versions **backend** qui appellent l'API REST. Les fichiers `.standalone.ts` sont conservés pour référence mais ne sont pas utilisés en production.

---

## 🔐 Authentification

### Flow JWT

1. **Login/Register** → Backend génère un JWT token
2. Frontend stocke le token dans `localStorage` (`assurclair_token`)
3. Chaque requête API inclut le header : `Authorization: Bearer <token>`
4. Backend vérifie le token et autorise la requête

### Endpoints Auth

```
POST /api/auth/register  → Inscription
POST /api/auth/login     → Connexion
POST /api/auth/reset     → Réinitialisation mot de passe
GET  /api/auth/me        → Profil utilisateur (authentifié)
PUT  /api/auth/me        → Mise à jour profil (authentifié)
```

---

## 📦 Gestion des données

### Endpoints Policies

```
GET    /api/policies?userId=xxx    → Liste des polices
POST   /api/policies               → Créer une police
PUT    /api/policies/:id           → Modifier une police
DELETE /api/policies/:id           → Supprimer une police
```

### Endpoints Central CG

```
GET    /api/policies/central-cg     → Référentiel CG
POST   /api/policies/central-cg     → Ajouter au référentiel
DELETE /api/policies/central-cg/:id → Supprimer du référentiel
```

---

## 🚀 Démarrage

### 1. Backend

```bash
cd BackEnd
npm install
cp .env.example .env
# Éditer .env avec vos configurations
npm run dev
```

✅ Backend disponible sur http://localhost:4000

### 2. Frontend

```bash
cd FrontEnd
npm install
cp .env.example .env
# Éditer .env avec VITE_API_URL=http://localhost:4000
npm run dev
```

✅ Frontend disponible sur http://localhost:3000

---

## 🔍 Vérification de cohérence

### Checklist

- [ ] Backend démarré sur port 4000
- [ ] Frontend démarré sur port 3000/3001
- [ ] Variables d'environnement configurées (`.env`)
- [ ] `VITE_API_URL` pointe vers le backend
- [ ] Services frontend utilisent les versions `.ts` (backend)
- [ ] Appels API sont asynchrones (`async/await`)
- [ ] Token JWT stocké dans localStorage
- [ ] CORS configuré correctement côté backend

### Test rapide

```bash
# Test backend
curl http://localhost:4000/
# Réponse attendue: {"ok":true,"version":"back-end-v0.1"}

# Test frontend → backend
# Ouvrir http://localhost:3000
# S'inscrire/Se connecter
# Ajouter un contrat
# Vérifier dans BackEnd/data/policies.json
```

---

## 🔧 Mode Standalone (sans backend)

Pour tester le frontend **sans backend** :

1. Créer un fichier de configuration :

```bash
cd FrontEnd/services
```

2. Modifier les imports dans `App.tsx` :

```typescript
// Remplacer :
import { authService } from './services/authService';
import { storageService } from './services/storageService';

// Par :
import { authService } from './services/authService.standalone';
import { storageService } from './services/storageService.standalone';
```

⚠️ **Attention** : En mode standalone, les données ne sont pas partagées entre appareils et ne sont pas sécurisées.

---

## 📊 Différences Backend vs Standalone

| Critère | Backend (Production) | Standalone (Démo) |
|---------|----------------------|-------------------|
| **Authentification** | JWT + bcrypt | localStorage clair |
| **Persistance** | Fichiers JSON serveur | localStorage navigateur |
| **Multi-device** | ✅ Oui | ❌ Non |
| **Sécurité** | ✅ Élevée | ⚠️ Faible |
| **Scalabilité** | ✅ Élevée | ❌ Limitée |
| **Appels API** | async/await | synchrone |

---

## 🐛 Résolution de problèmes

### Erreur : "Network error"

- ✅ Vérifier que le backend est démarré
- ✅ Vérifier `VITE_API_URL` dans `.env`
- ✅ Vérifier CORS dans `BackEnd/src/index.ts`

### Erreur : "crypto.randomUUID is not a function"

- ✅ Utiliser la fonction `uuid()` de `utils/uuid.ts`
- ✅ Ne pas appeler directement `crypto.randomUUID()`

### Erreur : "Missing authorization"

- ✅ Se reconnecter pour obtenir un nouveau token
- ✅ Vérifier que le token est dans localStorage

---

## 📝 Notes importantes

1. **Tous les appels API sont asynchrones** : Toujours utiliser `async/await`
2. **Les services backend retournent des Promises** : Gérer avec `try/catch`
3. **Le token JWT expire après 7 jours** : L'utilisateur devra se reconnecter
4. **Les données sont stockées dans `BackEnd/data/`** : Fichiers JSON

---

✨ **Architecture cohérente et prête pour la production !**
