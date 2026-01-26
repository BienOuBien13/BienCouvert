# 🔐 Variables d'environnement AssurClair

Ce document décrit toutes les variables d'environnement utilisées dans le projet AssurClair.

## 📋 Table des matières

1. [Configuration initiale](#configuration-initiale)
2. [Variables racine (.env)](#variables-racine-env)
3. [Variables Backend (BackEnd/.env)](#variables-backend-backendenv)
4. [Variables Frontend (FrontEnd/.env)](#variables-frontend-frontendenv)
5. [Configuration pour Docker](#configuration-pour-docker)
6. [Environnements de déploiement](#environnements-de-déploiement)
7. [Sécurité](#sécurité)

---

## 🚀 Configuration initiale

### Installation rapide

1. **Racine du projet** :
   ```bash
   cp .env.example .env
   ```

2. **Backend** :
   ```bash
   cd BackEnd
   cp .env.example .env
   ```

3. **Frontend** :
   ```bash
   cd FrontEnd
   cp .env.example .env
   ```

4. **Éditer les fichiers .env** avec vos valeurs spécifiques (voir ci-dessous).

---

## 🗂️ Variables racine (.env)

Fichier : `.env` à la racine du projet

Ce fichier est utilisé par **docker-compose.yml** pour configurer les conteneurs.

### Variables requises

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `JWT_SECRET` | Clé secrète pour signer les tokens JWT d'authentification | `your_jwt_secret_here_change_in_production` | ✅ Oui |
| `GEMINI_API_KEY` | Clé API Google Gemini pour les fonctionnalités IA | `AIza...` | ⚠️ Optionnel* |

\* *Requis si vous utilisez les fonctionnalités IA (analyse de documents, suggestions intelligentes)*

### Exemple de fichier `.env` racine

```env
# Configuration pour docker-compose
# Copier ce fichier en .env et remplir les valeurs

# JWT Secret (générer une clé aléatoire forte)
JWT_SECRET=your_jwt_secret_here_change_in_production

# Clé API Gemini
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 🔧 Variables Backend (BackEnd/.env)

Fichier : `BackEnd/.env`

Utilisé par le serveur Node.js/Express pour la configuration de l'API REST.

### Variables disponibles

| Variable | Description | Valeur par défaut | Environnement | Requis |
|----------|-------------|-------------------|---------------|--------|
| `PORT` | Port sur lequel le serveur backend écoute | `4000` | Tous | ✅ Oui |
| `JWT_SECRET` | Clé secrète pour signer les tokens JWT | - | Tous | ✅ Oui |
| `FRONTEND_ORIGIN` | Origines autorisées pour CORS (séparées par des virgules) | `http://localhost:3000,http://localhost:3001` | Tous | ✅ Oui |
| `API_KEY` | Clé API Gemini (alias de GEMINI_API_KEY) | - | Tous | ⚠️ Optionnel* |

\* *Requis pour les fonctionnalités IA*

### Détails des variables

#### `PORT`
- **Type** : Number
- **Valeur recommandée** :
  - Développement : `4000`
  - Production : `4000` (ou selon votre infrastructure)
- **Utilisation** : Définit le port d'écoute du serveur Express

#### `JWT_SECRET`
- **Type** : String
- **Longueur recommandée** : Au moins 32 caractères
- **Génération** : Utilisez une clé aléatoire forte
  ```bash
  # Générer avec Node.js
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  
  # Ou avec OpenSSL
  openssl rand -hex 32
  ```
- **⚠️ IMPORTANT** : Cette clé doit être **identique** entre :
  - `.env` (racine)
  - `BackEnd/.env`
  - Configuration Docker Compose
- **Utilisation** : Signature et vérification des tokens d'authentification JWT

#### `FRONTEND_ORIGIN`
- **Type** : String (liste séparée par des virgules)
- **Format** : `http://domain1.com,https://domain2.com`
- **Valeurs recommandées** :
  - **Développement** :
    ```
    FRONTEND_ORIGIN=http://localhost:3000,http://localhost:3001
    ```
  - **Production** :
    ```
    FRONTEND_ORIGIN=https://app.assurclair.fr,https://assurclair.fr
    ```
  - **Tous domaines** (⚠️ NON recommandé en production) :
    ```
    FRONTEND_ORIGIN=*
    ```
- **Utilisation** : Configuration CORS pour autoriser les requêtes depuis le frontend

#### `API_KEY` (ou `GEMINI_API_KEY`)
- **Type** : String
- **Format** : Commence généralement par `AIza...`
- **Obtention** : [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Fonctionnalités concernées** :
  - Analyse intelligente de documents PDF
  - Suggestions de formules d'assurance
  - Chat assistant IA
  - Extraction automatique de données
  - Détection de doublons
- **⚠️ Sans cette clé** : Les fonctionnalités IA retourneront des valeurs simulées

### Exemple de fichier `BackEnd/.env`

```env
# ================================
# CONFIGURATION ASSURCLAIR BACKEND
# ================================

# Port du serveur
PORT=4000

# Secret JWT pour signer les tokens d'authentification
# En production, utiliser une clé forte et sécurisée
JWT_SECRET=your_secure_jwt_secret_here

# Origines autorisées pour CORS (séparées par des virgules)
# '*' = toutes les origines (développement seulement)
# Production : liste les domaines autorisés
FRONTEND_ORIGIN=http://localhost:3000,http://localhost:3001

# Clé API Gemini (si utilisée côté backend)
API_KEY=your_gemini_api_key_here
```

---

## 🎨 Variables Frontend (FrontEnd/.env)

Fichier : `FrontEnd/.env`

Utilisé par Vite lors du build de l'application React. Les variables doivent commencer par `VITE_` pour être accessibles dans le code frontend.

### Variables disponibles

| Variable | Description | Valeur par défaut | Environnement | Requis |
|----------|-------------|-------------------|---------------|--------|
| `VITE_API_URL` | URL de l'API backend | `http://localhost:4000` | Tous | ✅ Oui |
| `VITE_GEMINI_API_KEY` | Clé API Gemini pour les features frontend | - | Tous | ⚠️ Optionnel* |

\* *Requis pour les fonctionnalités IA côté frontend*

### Détails des variables

#### `VITE_API_URL`
- **Type** : String (URL)
- **Format** : URL complète avec protocole
- **Valeurs recommandées** :
  - **Développement local** :
    ```
    VITE_API_URL=http://localhost:4000
    ```
  - **Production** :
    ```
    VITE_API_URL=https://api.assurclair.fr
    ```
  - **Docker/VM** :
    ```
    VITE_API_URL=http://<your_server_ip>:4000
    ```
- **⚠️ IMPORTANT** : 
  - Ne pas mettre de `/` à la fin
  - Doit correspondre au serveur backend accessible
- **Utilisation** : Toutes les requêtes API du frontend sont préfixées par cette URL

#### `VITE_GEMINI_API_KEY`
- **Type** : String
- **Format** : Commence généralement par `AIza...`
- **Obtention** : [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Fonctionnalités concernées** :
  - SmartChatAssistant (assistant conversationnel)
  - Suggestions intelligentes dans les formulaires
  - Analyse de documents côté client
- **Note** : Peut être la même clé que celle du backend

### Exemple de fichier `FrontEnd/.env`

```env
# ================================
# CONFIGURATION ASSURCLAIR FRONTEND
# ================================

# URL du backend API
# En développement : http://localhost:4000
# En production : https://api.assurclair.fr
VITE_API_URL=http://localhost:4000

# Clé API Gemini (optionnelle pour certaines features)
# Nécessaire pour les fonctionnalités avancées IA
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 🐳 Configuration pour Docker

Le fichier `docker-compose.yml` utilise les variables définies dans `.env` (racine).

### Variables interpolées dans docker-compose.yml

```yaml
environment:
  - JWT_SECRET=${JWT_SECRET:-change_this_in_production}
  - GEMINI_API_KEY=${GEMINI_API_KEY}
```

La syntaxe `${VARIABLE:-default}` permet de définir une valeur par défaut si la variable n'est pas définie.

### Lancement avec Docker Compose

```bash
# S'assurer que .env existe à la racine
cp .env.example .env

# Éditer .env avec vos valeurs
nano .env  # ou vim, code, etc.

# Lancer les conteneurs
docker-compose up -d

# Vérifier les logs
docker-compose logs -f
```

---

## 🌍 Environnements de déploiement

### Développement local

**Backend** :
```env
PORT=4000
JWT_SECRET=dev_secret_key_change_me
FRONTEND_ORIGIN=http://localhost:3000,http://localhost:3001
API_KEY=your_gemini_api_key_here
```

**Frontend** :
```env
VITE_API_URL=http://localhost:4000
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Production

**Backend** :
```env
PORT=4000
JWT_SECRET=<clé forte générée aléatoirement>
FRONTEND_ORIGIN=https://app.assurclair.fr,https://www.assurclair.fr
API_KEY=<votre clé Gemini>
```

**Frontend** :
```env
VITE_API_URL=https://api.assurclair.fr
VITE_GEMINI_API_KEY=<votre clé Gemini>
```

### Variables supplémentaires (docker-compose.yml)

Le `docker-compose.yml` définit également :

```yaml
environment:
  - NODE_ENV=production
  - POSTGRES_HOST=<your_database_host>
  - POSTGRES_PORT=5432
  - POSTGRES_DB=<your_database_name>
  - POSTGRES_USER=<your_postgres_user>
  - POSTGRES_PASSWORD=<your_secure_password>
```

Ces variables sont spécifiques à la configuration PostgreSQL et doivent être adaptées à votre environnement de production.

---

## 🔒 Sécurité

### ⚠️ Bonnes pratiques

1. **Ne JAMAIS commiter les fichiers .env** :
   - Vérifier que `.env` est dans `.gitignore`
   - Seuls les fichiers `.env.example` doivent être versionnés

2. **Générer des clés JWT fortes** :
   ```bash
   # Au moins 32 caractères aléatoires
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Protéger les clés API** :
   - Ne pas partager vos clés Gemini
   - Utiliser des clés différentes pour dev/staging/prod si possible
   - Révoquer les clés compromises immédiatement

4. **Configuration CORS stricte en production** :
   ```env
   # ❌ MAUVAIS en production
   FRONTEND_ORIGIN=*
   
   # ✅ BON en production
   FRONTEND_ORIGIN=https://app.assurclair.fr,https://www.assurclair.fr
   ```

5. **Rotation des secrets** :
   - Changer le `JWT_SECRET` périodiquement
   - Documenter les changements pour l'équipe

6. **Variables sensibles** :
   - ⚠️ **Critique** : `JWT_SECRET`, `POSTGRES_PASSWORD`
   - ⚠️ **Sensible** : `GEMINI_API_KEY`, `API_KEY`
   - ℹ️ **Public** : `PORT`, `VITE_API_URL`, `FRONTEND_ORIGIN`

### 🛡️ Checklist de sécurité

- [ ] `.env` est dans `.gitignore`
- [ ] `JWT_SECRET` est une clé forte (>32 caractères)
- [ ] `FRONTEND_ORIGIN` liste uniquement les domaines autorisés (pas de `*` en prod)
- [ ] Les clés API Gemini sont valides et non révoquées
- [ ] Les fichiers `.env` ont les bonnes permissions (600 sous Linux)
- [ ] Les secrets sont documentés dans un gestionnaire de secrets sécurisé

### 🔐 Gestion des secrets en équipe

**Options recommandées** :

1. **Azure Key Vault** (si déployé sur Azure)
2. **HashiCorp Vault**
3. **AWS Secrets Manager**
4. **1Password** / **Bitwarden** pour l'équipe
5. **Fichier chiffré** partagé de manière sécurisée

**Ne JAMAIS** :
- Envoyer les `.env` par email
- Les stocker dans Slack/Teams
- Les commiter dans Git
- Les partager dans des documents non chiffrés

---

## 📝 Notes supplémentaires

### Fichiers .env.production

Les fichiers `BackEnd/.env.production` et `FrontEnd/.env.production` peuvent contenir des surcharges spécifiques à la production.

### Vérification de la configuration

Pour vérifier que vos variables sont bien chargées :

**Backend** :
```bash
cd BackEnd
npm run dev
# Le serveur affiche les origines CORS configurées au démarrage
```

**Frontend** :
```bash
cd FrontEnd
npm run dev
# Ouvrir la console du navigateur :
console.log(import.meta.env.VITE_API_URL)
```

### Dépannage

| Problème | Solution |
|----------|----------|
| CORS error en développement | Vérifier `FRONTEND_ORIGIN` dans `BackEnd/.env` |
| "Failed to fetch" dans le frontend | Vérifier `VITE_API_URL` dans `FrontEnd/.env` |
| Erreur JWT "invalid signature" | Vérifier que `JWT_SECRET` est identique partout |
| Fonctionnalités IA ne marchent pas | Vérifier `GEMINI_API_KEY` / `API_KEY` |

---

## 📚 Ressources

- [Documentation Vite (variables d'environnement)](https://vitejs.dev/guide/env-and-mode.html)
- [Documentation dotenv](https://github.com/motdotla/dotenv)
- [Google AI Studio (Gemini API Keys)](https://makersuite.google.com/app/apikey)
- [JWT.io (JWT tokens)](https://jwt.io/)

---

*Dernière mise à jour : Janvier 2025*
