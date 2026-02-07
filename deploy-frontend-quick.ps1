# Déploiement rapide du frontend seulement (après npm run build)

Write-Host "=== Déploiement Frontend ===" -ForegroundColor Cyan

# 1. Supprimer l'ancien frontend sur la VM
Write-Host "`n1. Nettoyage ancien frontend..." -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "rm -rf /var/www/assurclair/frontend/*"

# 2. Copier le nouveau build
Write-Host "`n2. Copie du nouveau build..." -ForegroundColor Yellow
scp -r FrontEnd/dist/* VMRemi19821982@52.143.159.51:/var/www/assurclair/frontend/

Write-Host "`n✓ Frontend déployé ! Testez maintenant." -ForegroundColor Green
Write-Host "   URL: https://52.143.159.51" -ForegroundColor Gray
