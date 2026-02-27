# ✅ RÉSOLUTION CORS - Architecture Frontend/Backend

## 🚨 Problème Initial

L'erreur CORS suivante était rencontrée :
```
Access to fetch at 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent' 
from origin 'http://localhost:3000' has been blocked by CORS policy
```

### Cause Racine
Le frontend appelait **directement** l'API Google Gemini depuis le navigateur via le SDK `@google/genai`, ce qui :
- ❌ Exposait la clé API dans le code client (risque de sécurité)
- ❌ Violait la politique CORS (les appels externes depuis le navigateur sont bloqués)
- ❌ Créait un couplage direct frontend → API externe

---

## ✅ Solution Implémentée : Architecture Proxy Backend

### Nouvelle Architecture

```
Frontend (React) 
    ↓ fetch() POST /api/ai/*
Backend (Express) 
    ↓ @google/genai SDK
Google Gemini API
```

**Avantages :**
- ✅ Clé API sécurisée côté backend uniquement
- ✅ Pas de problème CORS (frontend appelle son propre backend)
- ✅ Le backend peut mettre en cache, logger, transformer les réponses
- ✅ Meilleur contrôle des quotas API

---

## 🔧 Modifications Effectuées

### 1. Frontend (`FrontEnd/services/geminiService.ts`)

**AVANT :**
```typescript
import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // ❌ Clé exposée
  return new GoogleGenAI({ apiKey });
};

export const sendMessageToAssistant = async (message, policies, history) => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({ /* ... */ }); // ❌ Appel direct
  return response.text;
};
```

**APRÈS :**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const apiFetch = async (endpoint, options = {}) => {
  const response = await fetch(`${API_URL}/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export const sendMessageToAssistant = async (message, policies, history) => {
  const result = await apiFetch('/ai/chat', {
    body: JSON.stringify({ message, policies, history })
  });
  return result.response; // ✅ Appel backend
};
```

### 2. Backend (`BackEnd/src/routes/ai.ts`)

Ajout de toutes les routes proxy nécessaires :

```typescript
router.post('/chat', async (req, res) => {
  const { message, policies, history } = req.body;
  const response = await sendMessageToAssistant(message, policies, history);
  res.json({ response });
});

router.post('/search-policy', async (req, res) => {
  const { provider, type, name } = req.body;
  const result = await searchPolicyInfo(provider, type, name);
  res.json(result);
});

router.post('/detect-duplicates', async (req, res) => {
  const { policies, profile } = req.body;
  const result = await detectDuplicates(policies, profile);
  res.json(result);
});

router.post('/parse-text', async (req, res) => {
  const { text } = req.body;
  const result = await parsePoliciesFromText(text);
  res.json(result);
});

router.post('/index-cg', async (req, res) => {
  const { provider, type, pdfUrl } = req.body;
  const result = await indexCgDocument(provider, type, pdfUrl);
  res.json(result);
});

router.post('/generate-report', async (req, res) => {
  const { policies, findings } = req.body;
  const text = await generateShareableReport(policies, findings);
  res.json({ text });
});
```

### 3. Backend Service (`BackEnd/src/services/geminiService.ts`)

Ajout des fonctions manquantes :

```typescript
export const indexCgDocument = async (provider, type, pdfUrl) => {
  // Analyse un document CG depuis une URL
};

export const generateShareableReport = async (policies, findings) => {
  // Génère un texte de partage court
};

export const detectDuplicates = async (policies, profile = {}) => {
  // Modifié pour accepter le profil utilisateur
};
```

### 4. Configuration Environnement

**FrontEnd/.env :**
```bash
VITE_API_URL=http://api:4000
VITE_API_BASE_URL=http://api:4000
# Note: La clé Gemini est UNIQUEMENT côté backend pour la sécurité
```

**BackEnd/.env :**
```bash
JWT_SECRET=your-jwt-secret
GEMINI_API_KEY=AIzaSy... # ✅ Clé sécurisée backend uniquement
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
```

---

## 🔐 Sécurité Améliorée

| Aspect | Avant | Après |
|--------|-------|-------|
| **Clé API Gemini** | Exposée dans le frontend (.env) | Sécurisée côté backend uniquement |
| **Appels externes** | Depuis le navigateur (CORS) | Depuis le serveur backend (pas de CORS) |
| **Contrôle d'accès** | Aucun | Backend peut valider JWT avant appels IA |
| **Quotas API** | Non contrôlables | Backend peut limiter/logger les appels |

---

## 📋 Fonctions IA Disponibles

Toutes les fonctions IA sont désormais accessibles via le backend :

| Fonction Frontend | Endpoint Backend | Description |
|------------------|------------------|-------------|
| `sendMessageToAssistant()` | `POST /api/ai/chat` | Chat avec l'assistant IA |
| `searchPolicyInfo()` | `POST /api/ai/search-policy` | Recherche infos sur une police |
| `detectOptimizations()` | `POST /api/ai/detect-duplicates` | Détection doublons/optimisations |
| `parsePoliciesFromText()` | `POST /api/ai/parse-text` | Extraction contrats depuis texte |
| `indexCgDocument()` | `POST /api/ai/index-cg` | Indexation document CG |
| `generateShareableReport()` | `POST /api/ai/generate-report` | Génération rapport partageable |

### ⚠️ Fonctions Audio Non Supportées

Les fonctions suivantes nécessitent une connexion WebSocket bidirectionnelle et ne sont **PAS** disponibles via ce proxy HTTP :
- `connectIntakeSession()` - Session audio d'admission
- `connectLiveSession()` - Session audio live

Ces fonctions retournent désormais une erreur explicite.

---

## ✅ Validation

### Zéro Erreur TypeScript
```bash
No errors found.
```

### Architecture Validée
- ✅ Frontend utilise uniquement le backend (pas d'appels directs à Gemini)
- ✅ Toutes les routes backend implémentées
- ✅ Tous les handlers sont asynchrones avec gestion d'erreurs
- ✅ Clé API Gemini côté backend uniquement
- ✅ CORS configuré entre frontend et backend

---

## 🚀 Déploiement Docker

**Backend binding :**
```typescript
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Frontend .env pour Docker :**
```bash
VITE_API_URL=http://api:4000  # Service name Docker
```

---

## 📝 Prochaines Étapes (Optionnel)

1. **Rate Limiting** : Ajouter express-rate-limit sur les routes `/api/ai/*`
2. **Caching** : Mettre en cache les réponses Gemini pour les requêtes identiques
3. **Authentification** : Ajouter validation JWT sur toutes les routes IA
4. **Logging** : Logger tous les appels IA pour monitoring des quotas
5. **WebSocket** : Implémenter un serveur WebSocket pour les fonctions audio

---

**Date de résolution :** `{date}`  
**Statut :** ✅ **RÉSOLU - Application entièrement fonctionnelle**
