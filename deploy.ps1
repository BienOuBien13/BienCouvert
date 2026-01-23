# Script pour déployer sur la VM
# Exécuter depuis Windows

Write-Host "=== Déploiement AssurClair vers VM ===" -ForegroundColor Cyan

# Chemins
$localPath = "c:\Users\RJOLIVAL\OneDrive - Capgemini\Desktop\Developpement\Git1\AssurClair"
$vmUser = "VMRemi19821982"
$vmHost = "52.143.159.51"
$vmPath = "~/AssurClair"

Write-Host "`n1. Compilation du Frontend..." -ForegroundColor Yellow
Set-Location "$localPath\FrontEnd"
npm run build

Write-Host "`n2. Compilation du Backend..." -ForegroundColor Yellow
Set-Location "$localPath\BackEnd"
npm run build

Write-Host "`n3. Transfert des fichiers vers la VM..." -ForegroundColor Yellow
# Utiliser SCP ou rsync pour transférer
# scp -r "$localPath\FrontEnd\dist" ${vmUser}@${vmHost}:${vmPath}/FrontEnd/
# scp -r "$localPath\BackEnd\dist" ${vmUser}@${vmHost}:${vmPath}/BackEnd/

Write-Host "`nFichiers prêts à être transférés!" -ForegroundColor Green
Write-Host "`nCommandes à exécuter sur la VM:" -ForegroundColor Cyan
Write-Host "cd ~/AssurClair" -ForegroundColor White
Write-Host "docker compose build --no-cache" -ForegroundColor White
Write-Host "docker compose up -d" -ForegroundColor White
