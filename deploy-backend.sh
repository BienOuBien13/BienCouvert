#!/bin/bash
echo "🔄 Déploiement backend sur VM..."

cd ~/AssurClair || exit 1

echo "📥 Git pull..."
git pull

echo "🔨 Build backend..."
cd BackEnd
npm run build

echo "🐳 Restart Docker backend..."
cd ..
docker compose restart backend

echo "✅ Déploiement terminé!"
docker compose logs backend --tail 20
