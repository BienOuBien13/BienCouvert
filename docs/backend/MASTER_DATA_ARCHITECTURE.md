# Architecture Master Data - Types d'Assurances

## 📊 Vue d'ensemble

Ce document décrit l'architecture normalisée des types d'assurances avec des codes de référence.

## 🎯 Objectif

Remplacer les chaînes de caractères libres (ex: "Auto", "Automobile", "auto") par des **codes normalisés** (ex: "AUTO") pour garantir :
- ✅ Cohérence des données
- ✅ Facilité de maintenance
- ✅ Performance des requêtes
- ✅ Internationalisation
- ✅ Évolutivité

## 📁 Structure

### Table `insurance_types`

```sql
CREATE TABLE insurance_types (
  code VARCHAR(20) PRIMARY KEY,      -- Ex: AUTO, HABITATION
  label_fr VARCHAR(100) NOT NULL,    -- Libellé français
  label_en VARCHAR(100),              -- Libellé anglais
  description TEXT,
  icon VARCHAR(50),                   -- Icône Lucide React
  color VARCHAR(50),                  -- Classe Tailwind
  display_order INTEGER,              -- Ordre d'affichage
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Table `insurers`

```sql
CREATE TABLE insurers (
  code VARCHAR(50) PRIMARY KEY,      -- Ex: CENTRAL_GENERALI, AXA
  label VARCHAR(150) NOT NULL,       -- Nom commercial court
  full_name VARCHAR(250),             -- Raison sociale complète
  description TEXT,
  logo_url VARCHAR(500),              -- URL du logo
  website_url VARCHAR(250),
  phone VARCHAR(20),
  email VARCHAR(150),
  color VARCHAR(50),                  -- Couleur de la marque
  display_order INTEGER,              -- Ordre d'affichage
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Codes disponibles

#### Types d'assurance

| Code | Label FR | Label EN | Description |
|------|----------|----------|-------------|
| `AUTO` | Automobile | Auto | Assurance automobile et deux-roues |
| `HABITATION` | Habitation | Home | Assurance habitation, logement |
| `SANTE` | Santé | Health | Mutuelle santé |
| `PREVOYANCE` | Prévoyance | Provident | Prévoyance individuelle |
| `PRO` | Professionnelle | Professional | RC Pro, multirisque |
| `EMPRUNTEUR` | Emprunteur | Borrower | Assurance crédit |
| `BANCAIRE` | Carte Bancaire | Banking | Assurances bancaires |
| `APPAREILS` | Appareils Électroniques | Electronics | Assurance équipements |
| `JURIDIQUE` | Protection Juridique | Legal | Défense juridique |
| `VOYAGE` | Voyage | Travel | Assurance voyage |
| `ANIMAUX` | Animaux | Pets | Assurance animaux |
| `VIE` | Assurance Vie | Life | Assurance vie, épargne |
| `AUTRE` | Autre | Other | Autre type |

#### Assureurs

| Code | Label | Description |
|------|-------|-------------|
| `CENTRAL_GENERALI` | Générali Central | Assureur historique, leader européen |
| `GENERALI` | Générali | Groupe Générali |
| `AXA` | AXA | Leader mondial de l'assurance |
| `ALLIANZ` | Allianz | Groupe allemand, leader européen |
| `GROUPAMA` | Groupama | Groupe mutualiste français |types + données
2. `002_migrate_to_insurance_codes.sql` - Migration des types existants
3. `003_create_insurers.sql` - Création de la table assureurs + données
4. `004_migrate_to_insurer_codes.sql` - Migration des assureurs existant
| `MACIF` | MACIF | Mutuelle française |
| `MAIF` | MAIF | Mutuelle française |
| `MAAF` | MAAF | Membre du groupe Covéa |
| `GMF` | GMF | Membre du groupe Covéa |
| `MMA` | MMA | Membre du groupe Covéa |
| `MATMUT` | Matmut | Mutuelle française |
| `AVIVA` | Aviva | Groupe britannique |
| `SWISS_LIFE` | Swiss Life | Assurance vie et prévoyance |
| `CNP` | CNP Assurances | Leader français assurance de personnes |
| `AG2R` | AG2R La Mondiale | Protection sociale |
| `MALAKOFF` | Malakoff Humanis | Protection sociale et santé |
| `HARMONIE` | Harmonie Mutuelle | Mutuelle santé |
| `MGEN` | MGEN | Mutuelle des enseignants |
| `APRIL` | April | Courtage et assurance |
| `DIRECT_ASSURANCE` | Direct Assurance | Assurance en ligne (groupe AXA) |
| `AMAGUIZ` | Amaguiz | Assurance en ligne (groupe Groupama) |
| `LUKO` | Luko | Néo-assureur digital |
| `FRIDAY` | Friday | Néo-assureur digital |
| `ACHEEL` | Acheel | Néo-assureur digital |
| `AUTRE` | Autre | Assureur non référencé |

## 🔄 Migration

### Étape 1 : Création des tables
```bash
node run-migrations.js
```

Exécute :
1. `001_create_insurance_types.sql` - Création de la table + données
2. `002_migrate_to_insurance_codes.sql` - Migration des données existantes

### Étape 2 : Vérification
```sql
-- Vérifier les types
SELECT * FROMes assureurs
SELECT * FROM insurers ORDER BY display_order;

-- Vérifier la migration des types
SELECT type, type_code, COUNT(*) 
FROM policies 
GROUP BY type, type_code;

-- Vérifier la migration des assureurs
SELECT insurer, insurer_code, COUNT(*) 
FROM policies 
GROUP BY insurer, insurerode, COUNT(*) 
FROM policies 
GROUP BY type, type_code;
```

## 💻 Utilisation dans le code

### Backend (TypeScript)

```typescript
import { 
  INSURANCE_TYPE_CODES, 
  INSURER_CODES,
  normalizeInsuranceType,
  normalizeInsurer 
} from './types/masterData';

// Utilisation des codes de types
const typeCode = INSURANCE_TYPE_CODES.AUTO;  // 'AUTO'
const normalized = normalizeInsuranceType('automobile');  // 'AUTO'

// Utilisation des codes d'assureurs
const insurerCode = INSURER_CODES.CENTRAL_GENERALI;  // 'CENTRAL_GENERALI'
const normalizedInsurer = normalizeInsurer('generali');  // 'CENTRAL_GENERALI'
```

### Frontend (Service)

```typescript
// Récupérer tous les types
const types = await masterDataService.getInsuranceTypes();

// Récupérer un type spécifique
const autoType = await masterDataService.getInsuranceTypeByCode('AUTO');

// Récupérer tous les assureurs
const insurers = await masterDataService.getInsurers();

// Récupérer un assureur spécifique
const generali = await masterDataService.getInsurerByCode('CENTRAL_GENERALI');
```

### API REST

```bash
# Types d'assurance
GET /api/masterdata/insurance-types          # Liste tous les types
GET /api/masterdata/insurance-types/AUTO     # Détail d'un type
x] Table master data des types d'assurance
- [x] Table master data des assureurs
- [ ] Table master data des formules (Essentiel, Intégrale, etc.)
- [ ] Gestion multilingue complète (EN, ES, etc.)
- [ ] Interface d'administration des référentiels
- [ ] Historisation des modifications
- [ ] Import/Export des référentiels

## 🚨 Important

- Les colonnes `type` et `insurer` existantes sont **conservées** pour la rétrocompatibilité
- De nouvelles colonnes `type_code` et `insurer_code` ont été ajoutées avec clés étrangères
- À terme, les anciennes colonnes pourront être supprimées
- Les migrations incluent toutes les variantes connues de noms d'assureurs
3. **Mapper les types textuels** vers les codes lors de l'import
4. **Afficher les labels** dans l'UI selon la langue

## 🔮 Évolutions futures

- [ ] Ajouter d'autres tables master data (assureurs, formules)
- [ ] Gestion multilingue complète
- [ ] Interface d'administration des référentiels
- [ ] Historisation des modifications

## 🚨 Important

- Les colonnes `type` existantes sont **conservées** pour la rétrocompatibilité
- Une nouvelle colonne `type_code` a été ajoutée avec une clé étrangère
- À terme, `type` pourra être supprimée et `type_code` renommée en `type`
