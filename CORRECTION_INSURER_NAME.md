# Corrections Architecture Master Data

## Problème résolu

**Erreur initiale :**
```
POST https://52.143.159.51/api/policies/central-cg 500 (Internal Server Error)
"error": "column \"insurer_name\" of relation \"central_cg\" does not exist"
```

## Cause

Le code backend utilisait `insurer_name` pour la table `central_cg`, alors que la colonne s'appelle `insurer` dans le schéma SQL.

## Corrections appliquées dans `BackEnd/src/storage.ts`

### 1. Fonction `writeCentralCgEntry` - UPDATE
**Avant :**
```sql
UPDATE central_cg 
SET insurer_name = $1, insurer_code = $2, ...
```

**Après :**
```sql
UPDATE central_cg 
SET insurer = $1, insurer_code = $2, ...
```

### 2. Fonction `writeCentralCgEntry` - INSERT
**Avant :**
```sql
INSERT INTO central_cg 
(insurer_name, insurer_code, ...)
```

**Après :**
```sql
INSERT INTO central_cg 
(insurer, insurer_code, ...)
```

### 3. Fonction `searchCentralCg` - SELECT
**Avant :**
```sql
SELECT 
  cg.insurer_name,
  ...
  COALESCE(i.label, cg.insurer_name) as insurer,
  ...
WHERE ... AND cg.insurer_name = ANY($...)
```

**Après :**
```sql
SELECT 
  cg.insurer,
  ...
  COALESCE(i.name, cg.insurer) as insurer_label,
  ...
WHERE ... AND cg.insurer = ANY($...)
```

### 4. Fonction `readPolicies`
**Avant :**
```typescript
insurer: row.insurer_label || row.insurer_name || 'Non spécifié'
```

**Après :**
```typescript
insurer: row.insurer_label || row.insurer || 'Non spécifié'
```

## Schéma de la table `central_cg`

```sql
CREATE TABLE central_cg (
    id SERIAL PRIMARY KEY,
    insurer VARCHAR(255) NOT NULL,              -- ✅ Nom de la colonne
    insurer_code VARCHAR(20),                    -- Code normalisé
    product_name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    document_url TEXT,
    document_hash VARCHAR(64),
    content_text TEXT,
    embedding vector(768),
    metadata JSONB,
    type_code VARCHAR(20),                       -- Code normalisé du type
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_central_cg_insurer_code 
        FOREIGN KEY (insurer_code) REFERENCES insurers(code),
    CONSTRAINT fk_central_cg_type 
        FOREIGN KEY (type_code) REFERENCES insurance_types(code)
);
```

## Validation

✅ **Compilation TypeScript** : Aucune erreur  
✅ **Contraintes FK** : Toutes les 4 FK sont en place  
✅ **Test de cohérence** : Tous les tests passés  

## Prochaines étapes

1. Redéployer le backend sur la VM Azure
2. Tester l'ajout de CG depuis le frontend
3. Vérifier que les données sont correctement sauvegardées avec les codes normalisés

---

**Date :** 2 février 2026  
**Status :** ✅ Corrigé et validé
