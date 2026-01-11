# MODE BACKEND ACTIVÉ ✅

L'application **AssurClair** fonctionne maintenant en mode **Backend complet** avec authentification JWT et API REST.

---

## 🔄 CHANGEMENTS APPLIQUÉS

### **1. Services Frontend**
Les services ont été convertis pour communiquer avec le backend :

- **authService.ts** : Appels API vers `/api/auth/*`
  - `login()` → POST `/api/auth/login`
  - `register()` → POST `/api/auth/register`
  - `resetPassword()` → POST `/api/auth/reset`
  - `getCurrentUser()` → GET `/api/auth/me`
  - `updateUser()` → PUT `/api/auth/me`

- **storageService.ts** : Appels API vers `/api/policies/*`
  - `getPolicies(userId)` → GET `/api/policies?userId=xxx`
  - `savePolicy()` → POST `/api/policies`
  - `updatePolicy()` → PUT `/api/policies/:id`
  - `deletePolicy()` → DELETE `/api/policies/:id`
  - `getCentralCgRepo()` → GET `/api/policies/central-cg`
  - `saveCgEntry()` → POST `/api/policies/central-cg`
  - `deleteCgEntry()` → DELETE `/api/policies/central-cg/:id`

### **2. Authentification JWT**
- Le token JWT est stocké dans `localStorage` sous la clé `assurclair_token`
- Toutes les requêtes API incluent le header : `Authorization: Bearer <token>`
- Durée de validité du token : **7 jours**

### **3. Composants adaptés**
Tous les composants ont été modifiés pour gérer les appels asynchrones :
- `App.tsx` : Gestion async de l'initialisation utilisateur
- `AuthScreen.tsx` : Login/Register/Reset async
- `UserProfile.tsx` : Mise à jour profil async
- `PolicyForm.tsx` : Recherche CG async
- `AdminView.tsx` : Gestion référentiel async

### **4. Configuration CORS**
Backend configuré pour accepter les requêtes de :
- `http://localhost:3000`
- `http://localhost:3001`

---

## 🚀 DÉMARRAGE DE L'APPLICATION

### **Prérequis**
- Backend et Frontend doivent tourner simultanément
- Ports : Backend sur 4000, Frontend sur 3000/3001

### **1. Démarrer le Backend**
```powershell
cd BackEnd
npm run dev
```
✅ Backend lancé sur http://localhost:4000

### **2. Démarrer le Frontend**
```powershell
cd FrontEnd
npm run dev
```
✅ Frontend lancé sur http://localhost:3000 (ou 3001 si port occupé)

### **3. Tester l'application**
Ouvrir http://localhost:3000 dans le navigateur

---

## 📊 DIFFÉRENCES LOCALSTORAGE vs BACKEND

| Fonctionnalité | Mode LocalStorage (ancien) | Mode Backend (actuel) |
|---------------|---------------------------|----------------------|
| **Authentification** | Données en clair dans localStorage | JWT sécurisé + bcrypt |
| **Persistance** | Navigateur uniquement | Base de données backend (JSON) |
| **Multi-utilisateur** | Limité au même navigateur | Partagé entre appareils |
| **Sécurité** | ⚠️ Faible (sans chiffrement) | ✅ Élevée (JWT + hashing) |
| **APIs externes** | Appelées depuis le navigateur | Peuvent être appelées depuis le backend |

---

## 🔧 RETOUR AU MODE LOCALSTORAGE (si besoin)

Si vous voulez revenir au mode localStorage :

```powershell
cd FrontEnd/services
Move-Item authService.ts authService.backend.ts -Force
Move-Item authService.localStorage.ts authService.ts -Force
Move-Item storageService.ts storageService.backend.ts -Force
Move-Item storageService.localStorage.ts storageService.ts -Force
```

---

## 📁 FICHIERS MODIFIÉS

### Frontend
- `services/authService.ts` (nouvelle version backend)
- `services/storageService.ts` (nouvelle version backend)
- `services/authService.localStorage.ts` (ancienne version sauvegardée)
- `services/storageService.localStorage.ts` (ancienne version sauvegardée)
- `vite-env.d.ts` (types TypeScript pour import.meta.env)
- `App.tsx` (appels async)
- `components/AuthScreen.tsx` (appels async)
- `components/UserProfile.tsx` (appels async)
- `components/PolicyForm.tsx` (appels async)
- `components/AdminView.tsx` (appels async)

### Backend
- `.env` : FRONTEND_ORIGIN mis à jour pour localhost:3000,3001

---

## ⚠️ NOTES IMPORTANTES

1. **Première connexion** : Les utilisateurs localStorage existants ne seront pas reconnus. Ils doivent se réinscrire via l'API backend.

2. **Données localStorage** : Les polices/utilisateurs créés en mode localStorage ne sont pas automatiquement transférés au backend. Pour migrer les données :
   - Exporter depuis localStorage (console navigateur)
   - Importer via l'API backend

3. **Gemini AI** : Les modèles ont été corrigés (gemini-1.5-flash, gemini-1.5-pro) pour assurer le bon fonctionnement des boutons IA.

4. **Production** : Changer `JWT_SECRET` et activer HTTPS avant déploiement.

---

## ✅ VALIDATION

Pour vérifier que le mode backend fonctionne :

1. **Ouvrir la console du navigateur (F12)**
2. **Onglet Network** : Vérifier les requêtes vers `http://localhost:4000/api/*`
3. **Tester l'inscription** : Créer un nouveau compte
4. **Vérifier** : Le token JWT devrait être dans localStorage (`assurclair_token`)

---

**Status** : ✅ Mode Backend ACTIF et FONCTIONNEL
