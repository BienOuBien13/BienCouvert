# 🎯 GUIDE DE COHÉRENCE - BienCouvert

## Types d'assurance standardisés

**Tous les types utilisent des IDs en minuscules dans toute l'application :**

| ID           | Nom d'affichage          | Utilisation                              |
|--------------|--------------------------|------------------------------------------|
| `auto`       | Auto                     | Base de données, API, Frontend          |
| `habitation` | Habitation               | Base de données, API, Frontend          |
| `sante`      | Santé                    | Base de données, API, Frontend          |
| `prevoyance` | Prévoyance               | Base de données, API, Frontend          |
| `pro`        | Professionnelle          | Base de données, API, Frontend          |
| `emprunteur` | Emprunteur/Crédit        | Base de données, API, Frontend          |
| `bancaire`   | Carte Bancaire           | Base de données, API, Frontend          |
| `appareils`  | Appareils Électroniques  | Base de données, API, Frontend          |
| `juridique`  | Juridique                | Base de données, API, Frontend          |
| `voyage`     | Voyage                   | Base de données, API, Frontend          |
| `animaux`    | Animaux                  | Base de données, API, Frontend          |
| `autre`      | Autre                    | Base de données, API, Frontend          |

## Structure de données

### Base de données PostgreSQL

**Table: `users`**
```sql
- id: INTEGER (PK, auto-increment)
- email: VARCHAR (NOT NULL, UNIQUE)
- first_name: TEXT (NOT NULL)
- last_name: TEXT (NOT NULL)
- password: VARCHAR (NOT NULL, hashed with bcrypt)
- profile: TEXT (JSON)
- is_admin: BOOLEAN (default false)
- name: VARCHAR (nullable, legacy, à ne plus utiliser)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**Table: `policies`**
```sql
- id: INTEGER (PK, auto-increment)
- user_id: INTEGER (FK → users.id)
- insurer: VARCHAR (nom de l'assureur, ex: "AXA", "MAIF")
- type: VARCHAR (type standardisé en minuscules, ex: "auto", "habitation")
- document_url: TEXT
- document_data: TEXT (PDF en base64)
- metadata: TEXT (JSON contenant: name, fileName, coverageDetail, options, etc.)
- created_at: TIMESTAMP
```

**Table: `central_cg`**
```sql
- id: INTEGER (PK, auto-increment)
- insurer: VARCHAR (nom de l'assureur)
- metadata: TEXT (JSON contenant:
    - type: string (type standardisé en minuscules)
    - indexedFormulas: string[]
    - indexedOptions: string[]
    - lastVerified: number (timestamp)
  )
- embedding: VECTOR(768) (pour recherche sémantique)
- created_at: TIMESTAMP
```

### API Backend

**Routes principales:**
- `GET /api/policies/central-cg?type=auto&insurer=AXA`
  - Filtre sur `metadata.type` (minuscules)
  - Filtre sur `insurer` (case-insensitive)

- `POST /api/policies/central-cg`
  - Body: `{ insurer, metadata: { type, indexedFormulas, indexedOptions } }`
  - Le type DOIT être en minuscules

- `GET /api/auth/me`
  - Retourne: `{ id, email, firstName, lastName, profile, isAdmin }`

- `PUT /api/auth/me`
  - Body: `{ firstName, lastName, email, password?, profile? }`

### Frontend TypeScript

**Interface User:**
```typescript
interface User {
  id: string;
  email: string;
  firstName: string;  // ✅ Prénom
  lastName: string;   // ✅ Nom de famille
  profile?: UserProfileData;
  isAdmin?: boolean;
}
```

**Interface Policy:**
```typescript
interface Policy {
  id: string;
  userId: string;
  name: string;           // Nom du contrat (ex: "Ma MAIF Auto")
  provider: string;       // = insurer
  type: string;           // Type en minuscules (auto, habitation, etc.)
  coverageDetail?: string;
  options?: string[];
  fileData?: string;      // Base64
  fileName?: string;
  sourceUrl?: string;
  // ...
}
```

**SmartChatAssistant - Types:**
```typescript
const TYPES = [
  { id: 'auto', name: 'Auto', icon: Car },
  { id: 'bancaire', name: 'Carte Bancaire', icon: CreditCard },
  // etc.
];
```

## Règles de cohérence

### ✅ À FAIRE
1. **Toujours utiliser les IDs en minuscules** pour les types dans la base de données
2. **Utiliser firstName/lastName** au lieu de name pour les utilisateurs
3. **Comparaisons insensibles à la casse** pour les noms d'assureurs
4. **Valider les types** avant insertion (doivent être dans la liste des 12 types)
5. **Logs clairs** : toujours afficher l'assureur ET le type dans les logs

### ❌ À NE PAS FAIRE
1. ❌ Ne jamais utiliser "Auto" avec majuscule dans la base
2. ❌ Ne jamais utiliser user.name, toujours firstName + lastName
3. ❌ Ne pas mélanger les conventions (camelCase pour code, minuscules pour data)
4. ❌ Ne pas stocker de données sensibles en clair (toujours hasher les mots de passe)

## Scripts de maintenance

**Normalisation des types:**
```bash
node normalize-types.js          # Pour central_cg
node normalize-policies-types.js # Pour policies
```

**Test de la structure:**
```bash
node test-register.js            # Test création utilisateur
node test-central-cg-query.js    # Test requête central_cg
```

## Checklist avant commit

- [ ] Tous les types en base sont en minuscules
- [ ] Les APIs utilisent firstName/lastName
- [ ] Les comparaisons sont case-insensitive
- [ ] Les tests passent (npm test)
- [ ] Le build backend réussit (npm run build)
- [ ] Le build frontend réussit (npm run build)
- [ ] Pas de "name" utilisé pour les users (sauf legacy nullable)
