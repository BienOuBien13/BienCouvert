# Script pour vérifier que la route /ai/chat/stream est déployée

Write-Host "=== Vérification route streaming ===" -ForegroundColor Cyan

# 1. Vérifier le fichier local compilé
Write-Host "`n1. Fichier local ai.js contient 'chat/stream':" -ForegroundColor Yellow
$localFile = "BackEnd\dist\routes\ai.js"
if (Test-Path $localFile) {
    $content = Get-Content $localFile -Raw
    if ($content -match "chat/stream") {
        Write-Host "   OK - Route trouvée dans fichier local" -ForegroundColor Green
    } else {
        Write-Host "   ERREUR - Route ABSENTE du fichier local" -ForegroundColor Red
    }
} else {
    Write-Host "   ERREUR - Fichier local introuvable" -ForegroundColor Red
}

# 2. Vérifier sur la VM
Write-Host "`n2. Fichier sur VM contient 'chat/stream':" -ForegroundColor Yellow
$vmCheck = ssh VMRemi19821982@52.143.159.51 "grep -c 'chat/stream' AssurClair/BackEnd/dist/routes/ai.js 2>&1"
if ($vmCheck -match "^\d+$" -and [int]$vmCheck -gt 0) {
    Write-Host "   OK - Route trouvée sur VM ($vmCheck occurrences)" -ForegroundColor Green
} else {
    Write-Host "   ERREUR - Route ABSENTE de la VM" -ForegroundColor Red
    Write-Host "   -> Il faut copier le fichier" -ForegroundColor Yellow
}

# 3. Vérifier l'état du service backend
Write-Host "`n3. État du service backend:" -ForegroundColor Yellow
ssh VMRemi19821982@52.143.159.51 "pm2 list | grep backend || docker ps | grep backend"

# 4. Tester l'endpoint
Write-Host "`n4. Test de l'endpoint (doit retourner 400 'Missing message', pas 404):" -ForegroundColor Yellow
Write-Host "   curl -X POST https://52.143.159.51/ai/chat/stream" -ForegroundColor Gray
