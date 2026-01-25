# Script PowerShell pour corriger CORS sur VM
# Usage: .\fix-vm-cors.ps1

$VM_IP = "vm-1"
$VM_USER = "Remi19821982"
$PROJECT_PATH = "/opt/assurclair"

Write-Host "Correction CORS sur VM Azure..." -ForegroundColor Cyan
Write-Host ""

# 1. Backup .env actuel
Write-Host "Backup .env actuel..." -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "cd $PROJECT_PATH/BackEnd && cp .env .env.backup.$(date +%Y%m%d_%H%M%S)"

# 2. Afficher .env actuel
Write-Host ""
Write-Host "Contenu .env AVANT modification:" -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "cd $PROJECT_PATH/BackEnd && cat .env"

# 3. Corriger FRONTEND_ORIGIN
Write-Host ""
Write-Host "Correction FRONTEND_ORIGIN..." -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} @"
cd $PROJECT_PATH/BackEnd
sed -i 's|^FRONTEND_ORIGIN=.*|FRONTEND_ORIGIN=https://biencouvert.fr,https://www.biencouvert.fr,http://localhost:3000|' .env
"@

# 4. Afficher .env corrige
Write-Host ""
Write-Host "Contenu .env APRES modification:" -ForegroundColor Green
ssh ${VM_USER}@${VM_IP} "cd $PROJECT_PATH/BackEnd && cat .env"

# 5. Redemarrer backend Docker
Write-Host ""
Write-Host "Redemarrage backend Docker..." -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "cd $PROJECT_PATH && docker-compose restart assurclair-back"

# 6. Attendre demarrage
Write-Host ""
Write-Host "Attente demarrage (5 secondes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 7. Verifier logs
Write-Host ""
Write-Host "Logs backend (10 dernieres lignes):" -ForegroundColor Green
ssh ${VM_USER}@${VM_IP} "docker logs assurclair-back --tail 10"

Write-Host ""
Write-Host "Correction terminee !" -ForegroundColor Green
Write-Host ""
Write-Host "Tester maintenant avec:" -ForegroundColor Cyan
Write-Host "   cd BackEnd" -ForegroundColor White
Write-Host "   node diagnose-biencouvert.js" -ForegroundColor White
Write-Host ""
Write-Host "Ou ouvrir : https://biencouvert.fr" -ForegroundColor Cyan
