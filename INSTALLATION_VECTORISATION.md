# Installation - Vectorisation Page par Page

## Prérequis

Les dépendances suivantes doivent être installées:

```bash
cd BackEnd
npm install canvas pdf-lib pdfjs-dist@3.11.174
```

**Note sur `canvas`**: Ce package nécessite des dépendances système natives:

### Sur Ubuntu/Debian (VM Azure)
```bash
sudo apt-get update
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Sur Windows (développement local)
- Installer Windows Build Tools: `npm install --global windows-build-tools`
- Ou utiliser Docker

## Installation Complète

```bash
# 1. Cloner/pull le code
git pull

# 2. Installer dépendances système (VM)
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# 3. Installer packages Node.js
cd BackEnd
npm install

# 4. Build TypeScript
npm run build

# 5. Appliquer migration
node run-migration-007.js

# 6. Vectoriser un CG test
node vectorize-cg-pages.js 100

# 7. Vérifier résultats
psql $DATABASE_URL -c "SELECT COUNT(*) FROM central_cg_pages WHERE central_cg_id = 100;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM coverage_facts WHERE central_cg_id = 100;"
```

## En cas d'erreur canvas

Si `npm install canvas` échoue:

### Option 1: Utiliser Docker
Le Dockerfile inclut déjà les dépendances:
```bash
docker-compose build backend
docker-compose up -d
```

### Option 2: Skip canvas temporairement
Commentez temporairement l'import dans `pageVectorizationService.ts`:
```typescript
// import { createCanvas } from 'canvas';
```

Et retournez `null` pour l'image:
```typescript
const imageBase64 = ''; // Pas d'image pour le moment
```

Cela permet de tester la logique sans images (Vision ne fonctionnera pas).

## Vérification Installation

```bash
# Test import
node -e "require('canvas'); require('pdf-lib'); require('pdfjs-dist/legacy/build/pdf'); console.log('✅ OK')"

# Test TypeScript
npm run build

# Test migration
node run-migration-007.js
```

## Ordre de Déploiement

1. **Local** (développement):
   - Installer dépendances
   - Tester migration
   - Tester vectorisation sur 1 CG

2. **VM** (production):
   - Installer dépendances système
   - `git pull`
   - `npm install`
   - `npm run build`
   - Appliquer migration
   - Vectoriser tous les CG existants
   - Redémarrer Docker

```bash
ssh VMRemi19821982@52.143.159.51
cd AssurClair/BackEnd

# Dépendances système
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Node packages
npm install

# Build
npm run build

# Migration
node run-migration-007.js

# Vectorisation
node vectorize-cg-pages.js 100

# Redémarrage
cd ..
docker-compose down
docker-compose build backend
docker-compose up -d
```
