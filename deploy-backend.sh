#!/bin/bash
echo "🔄 Déploiement backend sur VM..."

cd ~/AssurClair || exit 1

echo "📥 Git pull..."
git pull

echo "� Build + redémarrage Docker backend..."
docker compose build backend
docker compose up -d backend

echo "✅ Déploiement terminé!"
docker compose logs backend --tail 20
