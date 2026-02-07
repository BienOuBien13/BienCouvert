# Rebuild et redémarrage des conteneurs Docker sur la VM

Write-Host "=== Rebuild et redémarrage Docker ===" -ForegroundColor Cyan

# Se connecter et rebuild
Write-Host "`n1. Arrêt des conteneurs..." -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "cd AssurClair && docker-compose down"

Write-Host "`n2. Rebuild de l'image backend..." -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "cd AssurClair && docker-compose build backend"

Write-Host "`n3. Redémarrage de tous les services..." -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "cd AssurClair && docker-compose up -d"

Write-Host "`n4. Vérification des logs backend..." -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "cd AssurClair && docker-compose logs backend --tail=20"

Write-Host "`n✓ Fait ! Testez maintenant le chat." -ForegroundColor Green
