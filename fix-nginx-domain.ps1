# fix-nginx-domain.ps1
# Corrige l'accès à biencouvert.fr : le serveur_name de la config nginx
# ne contenait que l'IP. Ce script :
#  1. Diagnostique l'état actuel de nginx + certbot sur la VM
#  2. Déploie la nouvelle config (qui inclut biencouvert.fr)
#  3. Lance/renouvelle certbot si les certificats manquent
#  4. Recharge nginx

$VM_HOST = "vm-1"
$VM_USER = "Remi19821982"
$CONF_SRC = Join-Path $PSScriptRoot "nginx-azure.conf"
$CONF_DEST = "/etc/nginx/conf.d/assurclair.conf"

Write-Host "=== Fix biencouvert.fr — Nginx domain config ===" -ForegroundColor Cyan

# ── Étape 1 : Diagnostic ──────────────────────────────────────────────────────
Write-Host "`n[1/5] Diagnostic nginx + certbot sur la VM..." -ForegroundColor Yellow
ssh "${VM_USER}@${VM_HOST}" @"
echo '--- server_name dans les configs nginx ---'
sudo grep -rn 'server_name' /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null || echo '(aucun fichier)'

echo ''
echo '--- Certifs Let Encrypt ---'
sudo ls -la /etc/letsencrypt/live/ 2>/dev/null || echo '(certbot non configuré ou aucun cert)'

echo ''
echo '--- Port 80 ouvert ? ---'
sudo ss -tlnp | grep ':80 '

echo ''
echo '--- Port 443 ouvert ? ---'
sudo ss -tlnp | grep ':443 '
"@

# ── Étape 2 : Déploiement de la nouvelle config nginx ────────────────────────
Write-Host "`n[2/5] Déploiement nginx-azure.conf → $CONF_DEST ..." -ForegroundColor Yellow
scp $CONF_SRC "${VM_USER}@${VM_HOST}:/tmp/assurclair-nginx.conf"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ scp échoué — vérifiez la connexion SSH" -ForegroundColor Red
    exit 1
}
ssh "${VM_USER}@${VM_HOST}" "sudo cp /tmp/assurclair-nginx.conf $CONF_DEST && echo '✅ Config copiée'"

# ── Étape 3 : Vérifier si les certs Let's Encrypt existent ───────────────────
Write-Host "`n[3/5] Vérification des certificats SSL..." -ForegroundColor Yellow
$certStatus = ssh "${VM_USER}@${VM_HOST}" "sudo test -f /etc/letsencrypt/live/biencouvert.fr/fullchain.pem && echo 'EXISTS' || echo 'MISSING'"

if ($certStatus -match "MISSING") {
    Write-Host "⚠️  Certificats SSL absents — lancement de certbot..." -ForegroundColor Yellow

    # Commenter temporairement le bloc 443 pour que nginx -t passe sans les certs
    ssh "${VM_USER}@${VM_HOST}" @"
sudo cp $CONF_DEST ${CONF_DEST}.bak
# Décommente si besoin : supprime le bloc 443 jusqu'à ce que certbot l'ajoute
sudo sed -i '/^# ── Bloc HTTPS/,/^}/{ s/^/# / }' $CONF_DEST 2>/dev/null || true

# Test sans le bloc 443
sudo nginx -t && sudo nginx -s reload || true

# Obtenir les certificats via certbot
sudo apt-get install -y certbot python3-certbot-nginx -q 2>/dev/null || \
  sudo snap install --classic certbot 2>/dev/null || true

sudo certbot --nginx -d biencouvert.fr -d www.biencouvert.fr \
  --non-interactive --agree-tos --email admin@biencouvert.fr \
  --redirect && echo '✅ Certbot OK'
"@
} else {
    Write-Host "✅ Certificats SSL présents" -ForegroundColor Green
    # Vérifier l'expiration
    ssh "${VM_USER}@${VM_HOST}" @"
EXPIRY=`$(sudo openssl x509 -noout -enddate -in /etc/letsencrypt/live/biencouvert.fr/fullchain.pem 2>/dev/null | cut -d= -f2)
echo "  Expiration : `$EXPIRY"
"@
}

# ── Étape 4 : Test + reload nginx ─────────────────────────────────────────────
Write-Host "`n[4/5] Test et reload nginx..." -ForegroundColor Yellow
ssh "${VM_USER}@${VM_HOST}" @"
sudo nginx -t
if [ `$? -eq 0 ]; then
    sudo nginx -s reload
    echo '✅ Nginx rechargé'
else
    echo '❌ Config nginx invalide — rollback'
    sudo cp ${CONF_DEST}.bak $CONF_DEST 2>/dev/null || true
    sudo nginx -s reload
fi
"@

# ── Étape 5 : Test d'accès ────────────────────────────────────────────────────
Write-Host "`n[5/5] Test accès biencouvert.fr..." -ForegroundColor Yellow
ssh "${VM_USER}@${VM_HOST}" @"
echo 'Test HTTP (doit rediriger vers HTTPS) :'
curl -sI http://biencouvert.fr | head -5 || echo '(curl non installé ou DNS non résolu depuis VM)'

echo ''
echo 'Test HTTPS :'
curl -sI https://biencouvert.fr | head -5 || echo '(HTTPS inaccessible)'
"@

Write-Host "`n=== Terminé ===" -ForegroundColor Green
Write-Host "Si le problème persiste, vérifiez que le DNS de biencouvert.fr pointe bien vers 52.143.159.51" -ForegroundColor Cyan
Write-Host "   nslookup biencouvert.fr  (depuis votre machine)" -ForegroundColor White
