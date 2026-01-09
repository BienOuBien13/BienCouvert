# 📐 ARCHITECTURE ASSURCLAIR

## 🎯 Vue d'ensemble

**AssurClair** est une application d'analyse et d'optimisation d'assurances utilisant l'intelligence artificielle. L'application permet aux utilisateurs de gérer leurs polices d'assurance, d'obtenir des conseils personnalisés via un chat IA, et de détecter des opportunités d'optimisation.

### Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + TypeScript)           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Components  │  │   Services   │  │    Types     │     │
│  │  (UI/UX)     │  │  (Business)  │  │  (Shared)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ REST API (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Express)               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    Routes    │  │   Services   │  │   Storage    │     │
│  │  (API REST)  │  │   (IA/AI)    │  │   (JSON)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ API Gemini
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE GEMINI AI                          │
│         (Analyse de documents, Chat, Recommandations)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔙 BACKEND - Architecture détaillée

### 📂 Structure des fichiers

```
BackEnd/
├── src/
│   ├── index.ts              # Point d'entrée, configuration Express
│   ├── types.ts              # Types TypeScript partagés
│   ├── storage.ts            # Gestion du stockage JSON
│   ├── routes/
│   │   ├── auth.ts           # Routes d'authentification
│   │   ├── policies.ts       # Routes de gestion des polices
│   │   └── ai.ts             # Routes d'interaction IA
│   └── services/
│       └── geminiService.ts  # Intégration API Google Gemini
└── data/
    ├── users.json            # Base de données utilisateurs
    ├── policies.json         # Base de données polices
    └── central_cg.json       # Référentiel central des CG
```

### 🔑 Fichiers clés du Backend

#### **1. `index.ts` - Point d'entrée**
- **Rôle** : Configure et démarre le serveur Express
- **Responsabilités** :
  - Configuration CORS pour autoriser le frontend
  - Montage des routes API (`/api/auth`, `/api/policies`, `/api/ai`)
  - Configuration du body parser (limite 10MB pour documents base64)
  - Endpoint de santé `/` pour monitoring

```typescript
// Exemple de structure
app.use('/api/auth', authRoutes);       // Routes authentification
app.use('/api/policies', policyRoutes); // Routes polices
app.use('/api/ai', aiRoutes);           // Routes IA
```

#### **2. `types.ts` - Contrat de données**
- **Rôle** : Définit toutes les interfaces TypeScript partagées
- **Types principaux** :
  - `User` : Utilisateur avec profil détaillé
  - `Policy` : Police d'assurance avec document
  - `UserProfileData` : Profil détaillé (foyer, habitat, finances, etc.)
  - `CentralCgEntry` : Entrée du référentiel de Conditions Générales
  - `PolicyType` : Enum des types d'assurance

#### **3. `storage.ts` - Couche de persistance**
- **Rôle** : Abstraction du stockage fichier JSON
- **Fonctions** :
  - `readUsers()` / `writeUsers()` : Gestion des utilisateurs
  - `readPolicies()` / `writePolicies()` : Gestion des polices
  - `readCentralCg()` / `writeCentralCg()` : Référentiel CG
- **⚠️ Important** : Stockage fichier simple pour démo, remplacer par vraie DB en production

#### **4. `routes/auth.ts` - Authentification**
- **Endpoints** :
  - `POST /api/auth/register` : Inscription nouvel utilisateur
  - `POST /api/auth/login` : Connexion (retourne JWT)
  - `POST /api/auth/reset` : Réinitialisation mot de passe
  - `GET /api/auth/me` : Récupération profil (protégé)
  - `PUT /api/auth/me` : Mise à jour profil (protégé)
- **Sécurité** :
  - Hachage bcrypt pour mots de passe
  - Tokens JWT pour sessions (validité 7 jours)
  - Middleware `authMiddleware` pour routes protégées

#### **5. `routes/policies.ts` - Gestion des polices**
- **Endpoints CRUD** :
  - `GET /api/policies` : Liste polices (filtre par userId)
  - `POST /api/policies` : Création police (multipart ou JSON)
  - `PUT /api/policies/:id` : Mise à jour police
  - `DELETE /api/policies/:id` : Suppression police
- **Endpoints services** :
  - `POST /api/policies/search` : Recherche web d'infos assurance
  - `POST /api/policies/summarize` : Génération résumé IA
  - `POST /api/policies/detect-duplicates` : Détection doublons
- **Endpoints référentiel CG** :
  - `GET /api/policies/central-cg` : Liste CG
  - `POST /api/policies/central-cg` : Ajout CG
  - `GET /api/policies/central-cg/search` : Recherche CG
  - `DELETE /api/policies/central-cg/:id` : Suppression CG

#### **6. `services/geminiService.ts` - Intelligence artificielle**
- **Rôle** : Interface avec l'API Google Gemini
- **Fonctions principales** :
  - Analyse de documents PDF/images
  - Génération de résumés de polices
  - Chat contextuel avec historique
  - Détection d'optimisations possibles
  - Recherche web d'informations assurance

---

## 🎨 FRONTEND - Architecture détaillée

### 📂 Structure des fichiers

```
FrontEnd/
├── App.tsx                   # Composant racine, orchestration
├── types.ts                  # Types partagés (sync avec backend)
├── components/
│   ├── AuthScreen.tsx        # Écran connexion/inscription
│   ├── LandingPage.tsx       # Page d'accueil non connecté
│   ├── Sidebar.tsx           # Navigation principale
│   ├── PolicyForm.tsx        # Formulaire ajout/édition police
│   ├── PolicyList.tsx        # Liste des polices
│   ├── ChatInterface.tsx     # Interface chat IA
│   ├── AnalysisView.tsx      # Vue analyse et optimisations
│   ├── UserProfile.tsx       # Gestion profil utilisateur
│   ├── ExpertContact.tsx     # Contact expert humain
│   └── AdminView.tsx         # Administration référentiel CG
├── services/
│   ├── authService.ts        # Service authentification
│   ├── storageService.ts     # Service stockage local
│   ├── geminiService.ts      # Service IA (appels directs)
│   └── pdfService.ts         # Génération PDF rapports
└── utils/
    └── uuid.ts               # Générateur UUID
```

### 🔑 Fichiers clés du Frontend

#### **1. `App.tsx` - Orchestrateur principal**
- **Rôle** : Composant racine gérant l'état global
- **États principaux** :
  - `user` : Utilisateur connecté
  - `policies` : Liste des polices
  - `messages` : Historique chat IA
  - `activeView` : Vue active (policies, chat, analysis, etc.)
  - `userProfile` : Profil détaillé utilisateur
- **Responsabilités** :
  - Gestion authentification (login/logout)
  - Routage entre vues
  - Synchronisation état ↔ localStorage
  - Propagation des handlers aux composants enfants

#### **2. `types.ts` - Contrat frontend**
- **Rôle** : Définit les types TypeScript
- **⚠️ Important** : Doit rester synchronisé avec `BackEnd/src/types.ts`
- **Types spécifiques frontend** :
  - `Message` : Message chat avec horodatage
  - `OptimizationFinding` : Recommandation d'optimisation
  - `WebSearchResult` : Résultat recherche web

#### **3. `components/` - Composants UI**

##### **AuthScreen.tsx**
- Modes : login, register, forgot, reset
- Gestion formulaires avec validation
- Simulation email réinitialisation (démo)

##### **PolicyForm.tsx**
- 3 modes de saisie :
  1. **Manuel** : Formulaire complet
  2. **Import document** : Upload PDF/image + extraction IA
  3. **Voix** : Reconnaissance vocale + extraction IA
- Validation multi-étapes
- Détection automatique de doublons

##### **PolicyList.tsx**
- Affichage cartes polices avec statistiques
- Filtrage par type, recherche
- Actions : éditer, supprimer, voir détails

##### **ChatInterface.tsx**
- Interface conversationnelle avec IA
- Contexte : polices + profil utilisateur
- Historique persistant
- Suggestions de questions

##### **AnalysisView.tsx**
- Analyse globale du portefeuille
- Détection optimisations (doublons, sur-assurance, sous-assurance)
- Statistiques et graphiques
- Export PDF rapport

##### **UserProfile.tsx**
- Édition profil détaillé multi-sections
- Sections : Foyer, Habitat, Finances, Travail, Santé
- Impact sur recommandations IA

##### **AdminView.tsx**
- Gestion référentiel central CG (admin uniquement)
- Indexation documents avec IA
- Recherche et édition entrées

#### **4. `services/` - Services métier**

##### **authService.ts**
- `login()` : Authentification utilisateur
- `register()` : Création compte
- `resetPassword()` : Changement mot de passe
- `updateUser()` : Mise à jour profil
- `getCurrentUser()` : Récupération session localStorage

##### **storageService.ts**
- `getPolicies()` : Récupération polices utilisateur
- `savePolicy()` : Sauvegarde nouvelle police
- `updatePolicy()` : Mise à jour police existante
- `deletePolicy()` : Suppression police
- `getCentralCgRepo()` : Accès référentiel CG
- `findCgInRepo()` : Recherche CG par critères

##### **geminiService.ts**
- `parsePoliciesFromText()` : Extraction polices depuis texte/voix
- `summarizePolicy()` : Génération résumé document
- `chatWithContext()` : Chat avec contexte polices + profil
- `detectDuplicates()` : Détection doublons
- `analyzeOptimization()` : Recommandations optimisation
- `indexCgDocument()` : Indexation CG pour référentiel

##### **pdfService.ts**
- `generateOptimizationPDF()` : Rapport d'audit complet
- Mise en page professionnelle avec jsPDF
- Sections : profil, contrats, recommandations, économies

---

## 🔄 FLUX DE DONNÉES PRINCIPAUX

### 1️⃣ Flux d'authentification

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │ 1. user, password
       ▼
┌─────────────────┐
│ authService.ts  │  ← localStorage (démo)
│  - login()      │
└──────┬──────────┘
       │ 2. User object
       ▼
┌─────────────┐
│   App.tsx   │  ← setUser(), setPolicies()
│  (État)     │
└─────────────┘
```

**En production avec backend** :
```
React → authService → POST /api/auth/login → Backend → JWT
                                                ↓
React ← Session + JWT Token ← Backend Response ←
```

### 2️⃣ Flux de création de police

```
┌──────────────────┐
│  PolicyForm.tsx  │
│  - user input    │
│  - file upload   │
│  - voice input   │
└────────┬─────────┘
         │
         ├─ Mode Manuel → validation → savePolicy()
         │
         ├─ Mode Document → geminiService.parsePoliciesFromText()
         │                  ↓ extraction IA
         │                  → savePolicy()
         │
         └─ Mode Voix → recognition API
                        ↓ transcription
                        → geminiService.parsePoliciesFromText()
                        ↓ extraction IA
                        → savePolicy()
                        
                        
┌─────────────────────┐
│ storageService.ts   │
│ - savePolicy()      │
└──────┬──────────────┘
       │
       ├─ localStorage (démo)
       └─ POST /api/policies (production)
              ↓
       ┌──────────────────┐
       │ Backend storage  │
       └──────────────────┘
```

### 3️⃣ Flux de chat avec IA

```
┌──────────────────────┐
│  ChatInterface.tsx   │
│  - user message      │
└──────┬───────────────┘
       │ message + context
       ▼
┌──────────────────────────────┐
│  geminiService.ts            │
│  - chatWithContext()         │
│                              │
│  Context includes:           │
│  • All user policies         │
│  • User profile data         │
│  • Chat history              │
└──────┬───────────────────────┘
       │ API call
       ▼
┌──────────────────────────────┐
│  Google Gemini API           │
│  - Analyse contextuelle      │
│  - Génération réponse        │
└──────┬───────────────────────┘
       │ AI response
       ▼
┌──────────────────────────────┐
│  ChatInterface.tsx           │
│  - Display message           │
│  - Update history            │
└──────────────────────────────┘
```

### 4️⃣ Flux d'analyse et optimisation

```
┌──────────────────────┐
│  AnalysisView.tsx    │
│  - Trigger analysis  │
└──────┬───────────────┘
       │ policies[] + profile
       ▼
┌────────────────────────────────────┐
│  geminiService.ts                  │
│  - detectDuplicates()              │
│  - analyzeOptimization()           │
│                                    │
│  IA analyse:                       │
│  • Couvertures redondantes         │
│  • Sur-assurance / Sous-assurance  │
│  • Inadéquations profil            │
│  • Opportunités économies          │
└──────┬─────────────────────────────┘
       │ OptimizationFinding[]
       ▼
┌──────────────────────────────────┐
│  AnalysisView.tsx                │
│  - Display findings by severity  │
│  - Show potential savings        │
│  - Export PDF report             │
└──────────────────────────────────┘
```

---

## 🔐 SÉCURITÉ ET AUTHENTIFICATION

### Mode actuel (Démo - localStorage)

```
Frontend localStorage:
├── assurclair_users    → [{id, email, name, password, profile}]
├── assurclair_session  → {id, email, name, profile}
└── assurclair_policies → [{id, userId, name, provider, ...}]
```

**⚠️ Limitations** :
- Mots de passe en clair
- Aucune protection CSRF/XSS
- Données visibles dans DevTools
- Pas de multi-device sync

### Mode production (avec Backend)

```
┌──────────────┐
│   Frontend   │
└──────┬───────┘
       │ 1. POST /api/auth/login {email, password}
       ▼
┌──────────────────────────────┐
│   Backend - auth.ts          │
│   • bcrypt.compare()         │
│   • jwt.sign() → JWT token   │
└──────┬───────────────────────┘
       │ 2. {token: "eyJ...", user: {...}}
       ▼
┌──────────────────────────────┐
│   Frontend - localStorage    │
│   Save JWT token             │
└──────┬───────────────────────┘
       │
       │ 3. Subsequent requests
       │    Header: Authorization: Bearer <token>
       ▼
┌──────────────────────────────┐
│   Backend - authMiddleware   │
│   • jwt.verify()             │
│   • inject req.user          │
└──────────────────────────────┘
```

---

## 📊 STOCKAGE DES DONNÉES

### Structure des données

#### **users.json**
```json
[
  {
    "id": "uuid-v4",
    "email": "jean.dupont@email.com",
    "name": "Jean Dupont",
    "password": "$2a$10$...",  // bcrypt hash
    "isAdmin": false,
    "profile": {
      "adultsCount": 2,
      "childrenCount": 1,
      "housingStatus": "owner",
      "monthlyIncome": 3500,
      ...
    }
  }
]
```

#### **policies.json**
```json
[
  {
    "id": "uuid-v4",
    "userId": "uuid-user",
    "name": "Auto Confort Plus",
    "provider": "MAIF",
    "type": "Automobile",
    "coverageDetail": "Tous Risques",
    "options": ["Assistance 0km", "Bris de glace"],
    "fileData": "base64...",     // PDF/Image encodé
    "fileName": "contrat.pdf",
    "mimeType": "application/pdf",
    "summary": "Résumé IA...",
    "annualPremium": 850,
    "addedAt": 1704844800000
  }
]
```

#### **central_cg.json** (Référentiel admin)
```json
[
  {
    "id": "uuid-v4",
    "provider": "MAIF",
    "policyName": "Rythme Auto",
    "type": "Automobile",
    "pdfUrl": "https://...",
    "lastVerified": 1704844800000,
    "indexedFormulas": ["Tiers", "Tiers+", "Tous Risques"],
    "indexedOptions": ["Assistance", "Véhicule remplacement"],
    "semanticSummary": "Résumé pour recherche IA..."
  }
]
```

---

## 🤖 INTÉGRATION GOOGLE GEMINI

### Modèles utilisés

1. **`gemini-2.0-flash-exp`** (Chat & Analyse temps réel)
   - Conversations contextuelles
   - Analyse rapide de documents
   - Recommandations personnalisées

2. **`gemini-2.0-flash-thinking-exp-01-21`** (Raisonnement)
   - Détection de doublons complexes
   - Analyse approfondie d'optimisation
   - Comparaisons multi-polices

### Prompts structurés

#### Extraction de polices
```typescript
const prompt = `
Extrais les contrats d'assurance du texte suivant : "${text}".

CONSIGNES :
1. NORMALISATION : Corrige les noms d'assureurs
   (MAIFFE → MAIF, AXAXA → AXA, etc.)
2. DÉTECTION : Type, nom, assureur, formule, options
3. VALIDATION : Marque isComplete si infos suffisantes
4. QUESTIONS : Génère clarifications si incomplet
`;
```

#### Chat contextuel
```typescript
const context = {
  policies: [...],    // Toutes les polices
  profile: {...},     // Profil utilisateur
  history: [...]      // Messages précédents
};

const systemPrompt = `
Tu es un expert en assurance français.
Contexte utilisateur : ${JSON.stringify(context)}
Réponds de manière personnalisée, claire et pédagogique.
`;
```

### Configuration API

```typescript
const ai = new GoogleGenAI({ 
  apiKey: process.env.API_KEY 
});

const config = {
  model: 'gemini-2.0-flash-exp',
  tools: [{ googleSearch: {} }],  // Recherche web activée
  responseMimeType: "application/json",
  responseSchema: {...},           // Validation réponse
  temperature: 0.7,
  maxOutputTokens: 2048
};
```

---

## 🚀 DÉPLOIEMENT ET ENVIRONNEMENT

### Variables d'environnement

#### Backend `.env`
```env
PORT=4000
API_KEY=your_gemini_api_key_here
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
```

#### Frontend (Vite)
```env
VITE_API_URL=http://localhost:4000
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Scripts NPM

#### Backend
```bash
npm run dev      # Développement avec nodemon
npm run build    # Compilation TypeScript
npm start        # Production (nécessite build)
```

#### Frontend
```bash
npm run dev      # Serveur développement Vite
npm run build    # Build production
npm run preview  # Preview build local
```

---

## 🎯 POINTS D'ATTENTION

### Pour le développement

1. **Synchronisation des types**
   - `BackEnd/src/types.ts` ↔ `FrontEnd/types.ts`
   - Maintenir cohérence stricte

2. **Gestion des erreurs**
   - Try/catch sur tous les appels IA
   - Messages d'erreur utilisateur friendly
   - Fallbacks si IA indisponible

3. **Performance**
   - Documents encodés base64 → 10MB limit
   - Pagination si >50 polices
   - Debounce recherches/filtres

4. **Accessibilité**
   - Labels ARIA sur composants
   - Navigation clavier
   - Contraste couleurs WCAG AA

### Pour la production

1. **Sécurité**
   - ✅ Remplacer localStorage par backend
   - ✅ Implémenter rate limiting
   - ✅ Validation côté serveur stricte
   - ✅ Sanitization XSS
   - ✅ HTTPS uniquement

2. **Base de données**
   - ✅ Migrer de JSON vers PostgreSQL/MongoDB
   - ✅ Indexation (userId, type, provider)
   - ✅ Backups automatiques
   - ✅ Transactions pour cohérence

3. **Scalabilité**
   - ✅ Cache Redis (sessions, résultats IA)
   - ✅ CDN pour assets statiques
   - ✅ Load balancing backend
   - ✅ Queue système (BullMQ) pour jobs IA

4. **Monitoring**
   - ✅ Logging centralisé (Winston/Pino)
   - ✅ APM (New Relic, Datadog)
   - ✅ Alertes erreurs (Sentry)
   - ✅ Métriques usage IA

---

## 📚 RESSOURCES COMPLÉMENTAIRES

### Documentation technique

- **Google Gemini** : https://ai.google.dev/docs
- **React** : https://react.dev
- **Express** : https://expressjs.com
- **TypeScript** : https://www.typescriptlang.org

### Dépendances clés

**Backend** :
- `express` : Framework web
- `bcryptjs` : Hachage mots de passe
- `jsonwebtoken` : Gestion JWT
- `multer` : Upload fichiers
- `@google/genai` : SDK Gemini

**Frontend** :
- `react` : Bibliothèque UI
- `lucide-react` : Icônes
- `jspdf` : Génération PDF
- `@google/genai` : SDK Gemini

---

## 🎓 GUIDE RAPIDE POUR NOUVEAUX DÉVELOPPEURS

### Je veux...

#### ...ajouter un nouveau type d'assurance
1. Ajouter enum dans `types.ts` (backend + frontend)
2. Mettre à jour prompts IA dans `geminiService.ts`
3. Tester extraction avec ce type

#### ...ajouter un champ au profil utilisateur
1. Modifier interface `UserProfileData` dans `types.ts`
2. Ajouter champ dans `UserProfile.tsx`
3. Mettre à jour logique sauvegarde `authService.ts`
4. Inclure dans contexte IA si pertinent

#### ...créer une nouvelle vue
1. Créer composant dans `FrontEnd/components/`
2. Ajouter type dans `AppView` (`types.ts`)
3. Ajouter case dans `App.tsx` pour affichage
4. Ajouter entrée sidebar dans `Sidebar.tsx`

#### ...ajouter un nouvel endpoint API
1. Créer route dans `BackEnd/src/routes/`
2. Implémenter handlers avec validation
3. Documenter dans ce fichier
4. Créer fonction correspondante dans service frontend

#### ...modifier le prompt IA
1. Localiser fonction dans `geminiService.ts`
2. Modifier le template de prompt
3. Ajuster `responseSchema` si structure change
4. Tester avec cas variés (voir console AI Studio)

---

**📝 Note** : Cette architecture est conçue pour une démonstration et un prototypage rapide. Pour un déploiement en production, suivre les recommandations de la section "Pour la production".

**👤 Auteur** : AssurClair Team  
**📅 Dernière mise à jour** : Janvier 2026  
**📧 Contact** : support@assurclair.ia
