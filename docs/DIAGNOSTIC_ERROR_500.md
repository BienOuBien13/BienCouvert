# 🔍 Guide de diagnostic de l'erreur 500

## Étape 1: Vérifier les logs du backend

Sur votre VM, exécutez :

```bash
# Voir les logs en temps réel
docker logs -f assurclair-back

# Ou voir les dernières lignes
docker logs --tail 50 assurclair-back
```

## Étape 2: Tester l'inscription manuellement

Depuis votre VM ou votre PC :

```bash
curl -X POST http://52.143.159.51/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234"}'
```

## Étape 3: Vérifier la connexion PostgreSQL

```bash
# Se connecter au conteneur
docker exec -it assurclair-back sh

# Vérifier les variables d'environnement
env | grep POSTGRES

# Tester une requête SQL simple
node -e "const {query} = require('./dist/db'); query('SELECT NOW()').then(r => console.log(r.rows))"
```

## Erreurs possibles et solutions

### Erreur: "Cannot read property 'id' of undefined"
**Cause:** `storage.writeUser()` ne retourne pas l'ID correctement

**Solution:** Vérifier que la fonction retourne bien `result.rows[0].id`

### Erreur: "relation 'users' does not exist"
**Cause:** Les tables ne sont pas créées dans le conteneur

**Solution:** 
```bash
docker exec -it assurclair-back node create-schema.js
```

### Erreur: "password authentication failed"
**Cause:** Mauvaises credentials PostgreSQL

**Solution:** Vérifier les variables d'environnement dans docker-compose.yml

## Vérification rapide

Envoyez-moi le résultat de ces commandes pour diagnostic :

```bash
# 1. Logs backend
docker logs --tail 100 assurclair-back

# 2. État du conteneur
docker inspect assurclair-back | grep -A 10 "Env"

# 3. Test de connexion
docker exec assurclair-back wget -O- http://localhost:4000/
```
