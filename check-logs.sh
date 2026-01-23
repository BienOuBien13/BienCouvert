#!/bin/bash

echo "=== Vérification des containers ==="
docker ps -a

echo ""
echo "=== Logs du Backend ==="
docker logs assurclair-back --tail 50

echo ""
echo "=== Logs du Frontend ==="
docker logs assurclair-front --tail 50

echo ""
echo "=== Logs du Proxy (si existe) ==="
docker logs assurclair-proxy --tail 50 2>/dev/null || echo "Pas de container proxy"

echo ""
echo "=== Test de connexion au backend ==="
curl -v http://localhost:4000/api/health 2>&1 || echo "Backend non accessible"
