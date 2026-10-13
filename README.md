# AssurClair

Application de gestion d'assurances personnelles avec analyse intelligente et comparaison automatique des conditions générales.

## 🚀 Installation rapide

### Prérequis
- Node.js (v18+)
- npm ou yarn
- Docker & Docker Compose (optionnel)

### Configuration

1. **Cloner le dépôt** :
   ```bash
   git clone https://github.com/RemiJolivalt/AssurClair.git
   cd AssurClair
   ```

2. **Configurer les variables d'environnement** :
   
   📖 **Voir [ENV_VARIABLES.md](./ENV_VARIABLES.md) pour la documentation complète**
   
   ```bash
   # Racine
   cp .env.example .env
   
   # Backend
   cd BackEnd
   cp .env.example .env
   
   # Frontend
   cd ../FrontEnd
   cp .env.example .env
   ```

3. **Éditer les fichiers `.env`** avec vos valeurs (JWT_SECRET, GEMINI_API_KEY, etc.)

### Lancement

#### Avec Docker Compose (recommandé)
```bash
docker-compose up -d
```

#### En développement local

**Backend** :
```bash
cd BackEnd
npm install
npm run dev
```

**Frontend** :
```bash
cd FrontEnd
npm install
npm run dev
```

## 📖 Documentation

- **[ENV_VARIABLES.md](./ENV_VARIABLES.md)** - Configuration des variables d'environnement
- **[QUICK_ADD_GUIDE.md](./QUICK_ADD_GUIDE.md)** - Guide d'utilisation de l'interface rapide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture du projet

## 🔑 Variables d'environnement

Les variables d'environnement essentielles :
- `JWT_SECRET` : Clé secrète pour les tokens d'authentification
- `GEMINI_API_KEY` : Clé API pour les fonctionnalités IA
- `VITE_API_URL` : URL du backend API
- `FRONTEND_ORIGIN` : Origines autorisées pour CORS

👉 **Consultez [ENV_VARIABLES.md](./ENV_VARIABLES.md) pour les détails complets**

## 🛠️ Technologies

- **Frontend** : React, TypeScript, Vite, TailwindCSS
- **Backend** : Node.js, Express, TypeScript
- **Base de données** : PostgreSQL
- **IA** : Google Gemini API
- **Déploiement** : Docker, Azure

## 📝 License

Propriétaire