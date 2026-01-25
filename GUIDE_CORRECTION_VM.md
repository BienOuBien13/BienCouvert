# 🚨 CORRECTION URGENTE - Erreur 500 biencouvert.fr

## 📊 Diagnostic

**Symptômes** :
- ✅ Frontend accessible (HTML servi)
- ❌ `/api/auth/register` → 500 Internal Server Error
- ❌ `/api/auth/login` → 403 Forbidden
- ❌ OPTIONS (CORS) → 500

**Cause**: Backend crashé ou mal configuré sur VM Azure

---

## 🔧 ÉTAPES DE CORRECTION (SSH sur VM)

### 1. Vérifier statut backend

```bash
ssh azureuser@52.143.159.51

# Vérifier containers Docker
docker ps -a | grep backend

# Vérifier logs backend
docker logs backend --tail 100
# OU si nom différent
docker logs assurclair-backend --tail 100

# Vérifier si port 4000 ouvert
docker ps | grep 4000
```

**Si backend crashé** : Lire le message d'erreur et passer à l'étape 2

---

### 2. Corriger .env sur la VM

```bash
cd /home/azureuser/AssurClair/BackEnd
nano .env
```

**Modifier** :
```env
# Changer de http:// vers https://
FRONTEND_ORIGIN=https://biencouvert.fr,https://www.biencouvert.fr
```

**Vérifier aussi** :
```env
PORT=4000
JWT_SECRET=change_this_in_production
GEMINI_API_KEY=AIzaSyCPV3dky8oIny2ZYClo6lOi4V-BIlYvaqY

POSTGRES_HOST=52.143.159.51
POSTGRES_PORT=5432
POSTGRES_DB=assurclair
POSTGRES_USER=remijolivalt
POSTGRES_PASSWORD=Remi1982
POSTGRES_SSL=true

NODE_ENV=production
CSRF_SECRET=csrf-secret-change-in-production-use-crypto-random-string
```

**Sauvegarder** : `Ctrl+O`, `Enter`, `Ctrl+X`

---

### 3. Vérifier connexion PostgreSQL

```bash
psql -h 52.143.159.51 -U remijolivalt -d assurclair -c "SELECT COUNT(*) FROM users;"
```

**Si connexion échoue** :
- Vérifier que PostgreSQL écoute sur 0.0.0.0:5432
- Vérifier firewall Azure : port 5432 ouvert pour 52.143.159.51

---

### 4. Redémarrer backend Docker

```bash
cd /home/azureuser/AssurClair

# Redémarrer le container backend
docker-compose restart backend

# OU rebuild si code modifié
docker-compose up -d --build backend

# Vérifier démarrage
sleep 3
docker ps | grep backend

# Suivre les logs
docker logs -f backend
```

**Attendre le log** : `✅ Connexion PostgreSQL établie` et `Server running on port 4000`

**Arrêter les logs** : `Ctrl+C`

---

### 5. Tester depuis la VM

```bash
# Test health
curl http://localhost:4000/

# Test register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
```

**Si fonctionne** → Le problème est dans NGINX

---

### 6. Vérifier configuration NGINX

```bash
sudo nano /etc/nginx/sites-available/biencouvert.fr
```

**Configuration attendue** :

```nginx
server {
    listen 80;
    server_name biencouvert.fr www.biencouvert.fr;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name biencouvert.fr www.biencouvert.fr;

    # Let's Encrypt SSL
    ssl_certificate /etc/letsencrypt/live/biencouvert.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/biencouvert.fr/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Root pour frontend statique
    root /home/azureuser/AssurClair/FrontEnd/dist;
    index index.html;

    # Proxy backend API
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend SPA (toutes routes vers index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Si différent** → Corriger et recharger NGINX :
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7. Vérifier certificat Let's Encrypt

```bash
sudo certbot certificates

# Si expiré ou manquant
sudo certbot --nginx -d biencouvert.fr -d www.biencouvert.fr
```

---

### 8. Logs à surveiller

```bash
# Logs backend Docker (en temps réel)
docker logs -f backend

# Logs backend (dernières 100 lignes)
docker logs backend --tail 100

# Logs NGINX
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Tous les containers
docker-compose logs -f
```

---

## 🎯 CHECKLIST RAPIDE

- [ ] Backend Docker tourne : `docker ps | grep backend` → UP
- [ ] .env correct : FRONTEND_ORIGIN=https://biencouvert.fr
- [ ] PostgreSQL accessible : `psql -h 52.143.159.51 -U remijolivalt -d assurclair -c "SELECT 1;"`
- [ ] Backend répond localement : `curl http://localhost:4000/`
- [ ] NGINX proxy configuré : `/api/` → `http://localhost:4000`
- [ ] SSL Let's Encrypt valide : `sudo certbot certificates`
- [ ] NGINX rechargé : `sudo systemctl reload nginx`
- [ ] Backend redémarré : `docker-compose restart backend`

---

## 🚀 TEST FINAL

```bash
# Depuis machine locale (Windows)
cd BackEnd
node diagnose-biencouvert.js
```

**Attendu** :
- ✅ Health Check: 200
- ✅ Register: 201 ou 400 (validation)
- ✅ CORS: Headers présents
- ✅ Login: 200 ou 400

---

## ⚠️ PROBLÈMES COURANTS

### Erreur "ECONNREFUSED" dans logs
→ PostgreSQL non accessible depuis backend
```bash
sudo ufw allow 5432/tcp
# OU configurer pg_hba.conf pour accepter 127.0.0.1
```

### Erreur "Invalid credentials" PostgreSQL
→ Vérifier mot de passe dans .env :
```bash
POSTGRES_PASSWORD=Remi1982  # (pas Allianz2024!)
```

### 502 Bad Gateway NGINX
→ Backend pas démarré ou sur mauvais port
```bash
# Vérifier container Docker
docker ps | grep backend

# Vérifier port exposé
docker port backend

# Redémarrer
cd /home/azureuser/AssurClair
docker-compose restart backend
```

### CORS toujours bloqué
→ NGINX ne passe pas headers, ajouter :
```nginx
location /api/ {
    # ... existing config ...
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' 'https://biencouvert.fr' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
    
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}
```

---

## 📞 CONTACT SI BLOQUÉ

Si toujours erreur 500 après ces étapes :

1. Capturer logs complets :
```bash
# Logs backend Docker
docker logs backend --tail 200 > /tmp/backend-logs.txt

# Logs NGINX
sudo cat /var/log/nginx/error.log > /tmp/nginx-logs.txt

# Config .env
cat /home/azureuser/AssurClair/BackEnd/.env > /tmp/env-config.txt

# Info container
docker inspect backend > /tmp/docker-inspect.txt
```

2. Envoyer les 3 fichiers pour diagnostic approfondi

---

## 🎉 SUCCÈS

Une fois corrigé, tester :
1. https://biencouvert.fr → Frontend charge ✅
2. Register depuis frontend → Crée compte ✅
3. Login depuis frontend → Connecte ✅
4. Console browser F12 → Aucune erreur CORS ✅
