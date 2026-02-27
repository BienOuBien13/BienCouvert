# 🔗 SYSTÈME DE LIAISON POLICIES ↔ CENTRAL_CG

## 📊 Architecture

### Tables impliquées

1. **`policies`** : Contrats d'assurance des utilisateurs
   - Contient les documents uploadés par l'utilisateur
   - **Nouveau champ** : `central_cg_id` (référence vers central_cg)

2. **`central_cg`** : Référentiel des Conditions Générales officielles
   - Contient les CG officielles des produits d'assurance
   - Un produit = un document CG officiel avec son URL

### Relation

```
policies.central_cg_id → central_cg.id
```

**Avantages** :
- ✅ Lien direct entre le contrat utilisateur et les CG officielles
- ✅ Accès rapide à l'URL du document CG pour comparaison
- ✅ Recherche vectorielle possible (si embedding rempli)
- ✅ Suivi des versions des CG

---

## 🚀 Migration effectuée

### 1. Ajout de la colonne `central_cg_id`

```sql
ALTER TABLE policies 
ADD COLUMN IF NOT EXISTS central_cg_id INTEGER REFERENCES central_cg(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_policies_central_cg_id ON policies(central_cg_id);
```

### 2. Population du référentiel central_cg

8 produits ajoutés :
- **Habitation** : Allianz Essentielle, AXA Confort, MAIF Rythme
- **Auto** : Allianz Tous Risques, AXA Premium, MAIF Protection Juridique
- **Santé** : Harmonie Mutuelle Modulaire, MGEN Active

### 3. Liaison automatique des policies existantes

Toutes les policies ont été liées automatiquement en fonction de :
- `policies.insurer` ≈ `central_cg.insurer`
- `policies.type` ≈ `central_cg.metadata->>'type'`

**Résultat** : POL-1769196850479 (MAIF Auto) → Produit #7 (MAIF Auto Protection Juridique)

---

## 💻 Utilisation dans le code

### Backend (déjà implémenté)

#### Lecture des policies avec lien CG

```typescript
// Dans storage.ts
const policies = await storage.readPolicies(userId);
// Retourne : { ..., centralCgId: 7 }
```

#### Création d'une policy avec lien CG

```typescript
const newPolicy = {
  userId: 1,
  insurer: 'MAIF',
  type: 'Auto',
  centralCgId: 7,  // Lien vers le produit MAIF Auto Protection Juridique
  // ... autres champs
};

await storage.writePolicy(newPolicy);
```

#### Route API pour récupérer les produits disponibles

```http
GET /api/policies/central-cg
GET /api/policies/central-cg?type=habitation
GET /api/policies/central-cg?insurer=MAIF
```

### Frontend (à implémenter)

#### Afficher l'URL des CG officielles

```typescript
// Dans PolicyList.tsx ou PolicyDetails.tsx
const policy = { ..., centralCgId: 7 };

// Récupérer le produit central_cg
const cgProduct = await fetch(`/api/policies/central-cg/${policy.centralCgId}`);
// Afficher le lien : cgProduct.document_url
```

#### Lors de la création d'une policy

```typescript
// Dans PolicyForm.tsx
// 1. Récupérer les produits disponibles
const products = await fetch('/api/policies/central-cg?type=habitation');

// 2. Permettre à l'utilisateur de sélectionner un produit
<select onChange={(e) => setCentralCgId(e.target.value)}>
  {products.map(p => (
    <option value={p.id}>{p.insurer} - {p.product_name}</option>
  ))}
</select>

// 3. Envoyer centralCgId lors de la création
const newPolicy = {
  ...policyData,
  centralCgId: selectedCentralCgId
};
```

---

## 📋 Requêtes SQL utiles

### Récupérer une policy avec ses CG officielles

```sql
SELECT 
  p.id,
  p.policy_number,
  p.insurer as user_insurer,
  p.type,
  c.product_name as official_product,
  c.document_url as cg_url,
  c.version as cg_version
FROM policies p
LEFT JOIN central_cg c ON p.central_cg_id = c.id
WHERE p.policy_number = 'POL-1769196850479';
```

**Résultat** :
```
id | policy_number      | user_insurer | type | official_product          | cg_url                           | cg_version
---|--------------------|--------------+------+---------------------------+----------------------------------+----------
3  | POL-1769196850479  | MAIF         | Auto | Auto Protection Juridique | https://www.maif.fr/cg-auto.pdf | 2024
```

### Trouver toutes les policies d'un produit

```sql
SELECT 
  p.policy_number,
  u.name as user_name,
  u.email
FROM policies p
JOIN users u ON p.user_id = u.id
WHERE p.central_cg_id = 7;
```

### Ajouter un nouveau produit au référentiel

```sql
INSERT INTO central_cg (insurer, product_name, version, document_url, metadata)
VALUES (
  'Groupama',
  'Habitation Sérénité',
  '2024',
  'https://www.groupama.fr/cg-habitation-serenite.pdf',
  '{"type": "habitation", "validFrom": "2024-01-01"}'::jsonb
);
```

### Lier manuellement une policy à un produit

```sql
-- Récupérer l'ID du produit
SELECT id FROM central_cg 
WHERE insurer = 'MAIF' 
AND product_name = 'Auto Protection Juridique';

-- Lier la policy
UPDATE policies 
SET central_cg_id = 7 
WHERE policy_number = 'POL-1769196850479';
```

---

## 🎯 Prochaines étapes

### 1. Interface utilisateur
- [ ] Dropdown pour sélectionner un produit lors de la création
- [ ] Bouton "Voir les CG officielles" dans les détails d'une policy
- [ ] Auto-suggestion basée sur l'assureur et le type

### 2. Amélioration du matching automatique
- [ ] Utiliser pgvector pour matcher sémantiquement
- [ ] Analyser le document uploadé pour détecter le produit exact
- [ ] Score de confiance du matching

### 3. Administration
- [ ] Interface pour gérer le référentiel central_cg
- [ ] Import/export CSV des produits
- [ ] Vérification des URLs (liens morts)

### 4. Analyse comparative
- [ ] Comparer automatiquement policy vs CG officielle
- [ ] Détecter les écarts de couverture
- [ ] Alerter l'utilisateur si CG officielles différentes

---

## ✅ État actuel

- ✅ Schéma de base de données mis à jour
- ✅ 8 produits de référence ajoutés
- ✅ 3 policies liées automatiquement
- ✅ Backend adapté (storage.ts + routes)
- ✅ Scripts de migration disponibles
- ⏳ Frontend à adapter pour exploiter le lien
- ⏳ API GET /api/policies/central-cg/:id à créer

**POL-1769196850479** est maintenant liée au produit **MAIF Auto Protection Juridique** (ID: 7) avec l'URL : https://www.maif.fr/cg-auto.pdf
