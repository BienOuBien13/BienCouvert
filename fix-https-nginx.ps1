# Script PowerShell pour corriger la limite d'upload nginx HTTPS sur la VM
# Cible : ajouter client_max_body_size 50M au bloc HTTPS (port 443) géré par certbot
# Usage : .\fix-https-nginx.ps1

$VM_IP   = "vm-1"
$VM_USER = "Remi19821982"

Write-Host "=== Fix nginx client_max_body_size HTTPS ===" -ForegroundColor Cyan
Write-Host ""

# 1. Afficher les blocs serveur nginx actuels (pour diagnostic)
Write-Host "Config nginx actuelle (blocs server):" -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} @"
sudo grep -n "client_max_body_size\|listen 443\|server_name biencouvert" /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* 2>/dev/null || echo "(aucun fichier trouvé)"
sudo grep -n "client_max_body_size\|listen 443\|server_name biencouvert" /etc/nginx/nginx.conf 2>/dev/null
"@

Write-Host ""
Write-Host "Ajout client_max_body_size 50M dans le http{} global (nginx.conf)..." -ForegroundColor Yellow

# 2. Ajouter client_max_body_size dans le bloc http{} global de nginx.conf
#    C'est la méthode la plus fiable : s'applique à tous les server blocks (HTTP + HTTPS certbot)
ssh ${VM_USER}@${VM_IP} @"
# Backup nginx.conf
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.`$(date +%Y%m%d_%H%M%S)

# Vérifier si déjà présent
if sudo grep -q "client_max_body_size" /etc/nginx/nginx.conf; then
    echo "client_max_body_size déjà présent dans nginx.conf, mise à jour..."
    sudo sed -i 's/client_max_body_size[^;]*;/client_max_body_size 50M;/g' /etc/nginx/nginx.conf
else
    echo "Ajout de client_max_body_size 50M dans le bloc http{} ..."
    sudo sed -i '/http {/a\\    client_max_body_size 50M;' /etc/nginx/nginx.conf
fi
"@

Write-Host ""
Write-Host "Résultat dans nginx.conf:" -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "sudo grep 'client_max_body_size' /etc/nginx/nginx.conf"

# 3. Ajouter aussi dans le fichier conf.d de biencouvert s'il existe (bloc 443 certbot)
Write-Host ""
Write-Host "Ajout dans le fichier conf certbot (si existant)..." -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} @"
for f in /etc/nginx/conf.d/assurclair*.conf /etc/nginx/sites-enabled/biencouvert* /etc/nginx/sites-enabled/assurclair* 2>/dev/null; do
    [ -f "`$f" ] || continue
    if sudo grep -q "listen 443" "`$f"; then
        if ! sudo grep -q "client_max_body_size" "`$f"; then
            sudo cp "`$f" "`${f}.bak.`$(date +%Y%m%d_%H%M%S)"
            # Insérer après chaque "location /api/ {" dans les blocs SSL
            sudo sed -i '/location \/api\/ {/a\\        client_max_body_size 50M;' "`$f"
            echo "  Ajouté dans `$f"
        else
            echo "  Déjà présent dans `$f"
        fi
    fi
done
"@

# 4. Test config nginx
Write-Host ""
Write-Host "Test de la config nginx:" -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "sudo nginx -t"

# 5. Reload (si test OK)
Write-Host ""
Write-Host "Reload nginx..." -ForegroundColor Yellow
ssh ${VM_USER}@${VM_IP} "sudo nginx -s reload && echo 'Nginx rechargé avec succès' || echo 'ERREUR: reload failed'"

Write-Host ""
Write-Host "=== Terminé ===" -ForegroundColor Green
Write-Host "Testez à nouveau l'upload sur https://biencouvert.fr" -ForegroundColor Cyan
