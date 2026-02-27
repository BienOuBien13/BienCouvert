# Vectorisation Page par Page - Documentation Complète

## 🎯 Objectif

Améliorer la précision du RAG en vectorisant les CG page par page avec extraction structurée des tableaux de garanties, éliminant ainsi les hallucinations sur les couvertures.

## 📊 Architecture

### Avant (Problème)
```
CG entier (224k chars) → 1 embedding → Extraction approximative → Hallucinations
```

### Après (Solution)
```
CG → Pages individuelles → Embeddings par page → Tableaux extraits → Faits requêtables
                                                 ↓
                                          Gemini Vision
                                                 ↓
                                    Garantie × Formule = Status
```

## 🗄️ Tables Créées

### 1. `central_cg_pages`
**Une ligne par page de PDF**

```sql
- id, central_cg_id, page_number
- content_text (texte OCR)
- layout_text (avec structure)
- embedding VECTOR(768)
- page_image_base64 (PNG pour Vision)
- has_table, table_json
```

**Bénéfice**: RAG granulaire avec embeddings par page = meilleure précision sémantique

### 2. `coverage_facts`
**Une ligne par cellule garantie × formule**

```sql
- insurer_code, insurance_type_code
- guarantee_key (ex: 'bris_de_glaces')
- formula_key (ex: 'tiers_essentiel')
- coverage_status: 'included' | 'optional' | 'excluded'
- source_page_id, source_page_number
```

**Bénéfice**: Requêtage SQL direct = 0 hallucination

### 3. `guarantee_catalog` & `formula_catalog`
Référentiels de normalisation

## 🔄 Workflow

### 1. Migration (une fois)
```bash
node run-migration-007.js
```

### 2. Installation dépendances
```bash
cd BackEnd
npm install canvas pdf-lib pdfjs-dist
npm run build
```

### 3. Vectorisation d'un CG
```bash
node vectorize-cg-pages.js 100
```

**Process**:
1. Découpe PDF en pages
2. Extrait texte + image par page
3. Génère embedding par page
4. Détecte tableaux (heuristiques)
5. Si tableau → Gemini Vision extrait structure
6. Convertit tableau → faits requêtables
7. Sauvegarde pages + faits

### 4. Utilisation dans le RAG

#### Cas 1: Question avec formule connue
```typescript
// L'utilisateur a "TIERS ESSENTIEL" dans ses CP
const fact = await queryCoverageFact(
  pool,
  'MAA01',
  'AUTO',
  'bris_de_glaces',
  'tiers_essentiel'
);

// Réponse: { coverage_status: 'optional', page_number: 3 }
→ "Le bris de glaces est en option sur votre formule TIERS ESSENTIEL"
```

#### Cas 2: Question sans formule
```typescript
// L'utilisateur n'a pas fourni ses CP
const facts = await queryCoverageByGuarantee(
  pool,
  'MAA01',
  'AUTO',
  'bris_de_glaces'
);

// Réponse: [
//   { formula: 'tiers_eco', status: 'optional' },
//   { formula: 'tiers_essentiel', status: 'included' },
//   { formula: 'tous_risques_confort', status: 'included' }
// ]
→ "Le bris de glaces est: en option sur TIERS ECO, inclus sur TIERS ESSENTIEL et TOUS RISQUES"
```

## 🎨 Extraction Vision

### Prompt pour Gemini 2.0 Flash

```
Analyse cette image de CG et extrait le tableau garanties × formules.

Format JSON:
{
  "has_table": true,
  "headers": ["Garanties", "TIERS ECO", "TIERS ESSENTIEL", ...],
  "rows": [
    {
      "guarantee": "Bris de glaces",
      "formulas": {
        "tiers_eco": "○",
        "tiers_essentiel": "✓"
      }
    }
  ]
}

Symboles:
- ✓ = inclus
- ○ = option
- - = exclu
```

### Normalisation
```typescript
"Bris de glaces" → "bris_de_glaces"
"TIERS ESSENTIEL" → "tiers_essentiel"
"✓" → "included"
"○" → "optional"
```

## 📈 Métriques & Monitoring

### Vérifier l'extraction
```sql
-- Nombre de pages vectorisées
SELECT central_cg_id, COUNT(*) as pages
FROM central_cg_pages
GROUP BY central_cg_id;

-- Nombre de tableaux détectés
SELECT central_cg_id, COUNT(*) as tables
FROM central_cg_pages
WHERE has_table = TRUE
GROUP BY central_cg_id;

-- Nombre de faits créés
SELECT 
  insurer_code,
  insurance_type_code,
  COUNT(DISTINCT guarantee_key) as guarantees,
  COUNT(DISTINCT formula_key) as formulas,
  COUNT(*) as total_facts
FROM coverage_facts
GROUP BY insurer_code, insurance_type_code;

-- Vue matrice complète
SELECT * FROM v_coverage_matrix
WHERE central_cg_id = 100
ORDER BY guarantee_label, formula_label;
```

### Confiance extraction
```sql
SELECT 
  AVG(table_extraction_confidence) as avg_confidence,
  MIN(table_extraction_confidence) as min_confidence,
  COUNT(*) as tables_extracted
FROM central_cg_pages
WHERE has_table = TRUE;
```

## 🚀 Déploiement

### Sur la VM

```bash
ssh VMRemi19821982@52.143.159.51
cd AssurClair
git pull

# Migration
cd BackEnd
node run-migration-007.js

# Installation
npm install

# Build
npm run build

# Vectoriser tous les CG existants
node vectorize-cg-pages.js 100  # MAAF AUTO
node vectorize-cg-pages.js 101  # etc.

# Redémarrer services
cd ..
docker-compose down
docker-compose build backend
docker-compose up -d
```

## ✅ Tests

### 1. Test extraction page
```sql
SELECT page_number, has_table, 
       LENGTH(content_text) as text_len,
       SUBSTRING(content_text, 1, 100) as preview
FROM central_cg_pages
WHERE central_cg_id = 100
ORDER BY page_number;
```

### 2. Test faits de couverture
```sql
SELECT 
  guarantee_label,
  formula_label,
  coverage_status,
  source_page_number
FROM coverage_facts
WHERE insurer_code = 'MAA01'
  AND insurance_type_code = 'AUTO'
  AND guarantee_key = 'bris_de_glaces';
```

### 3. Test RAG avec faits
```bash
# Question utilisateur: "ai-je le bris de glace ?"
# Formule: TIERS ESSENTIEL
# → Requête SQL directe sur coverage_facts
# → Réponse précise sans hallucination
```

## 🔧 Maintenance

### Revectoriser un CG
```bash
# Supprimer l'ancien
DELETE FROM central_cg_pages WHERE central_cg_id = 100;
DELETE FROM coverage_facts WHERE central_cg_id = 100;

# Revectoriser
node vectorize-cg-pages.js 100
```

### Ajouter garanties au catalog
```sql
INSERT INTO guarantee_catalog (
  guarantee_key, guarantee_label, 
  insurance_type_code, keywords
) VALUES (
  'assistance_vehicule',
  'Assistance véhicule',
  'AUTO',
  ARRAY['assistance', 'dépannage', 'remorquage']
);
```

## 📝 Prochaines Étapes

1. ✅ Migration tables
2. ✅ Service extraction tableaux
3. ✅ Service vectorisation pages
4. ⏳ Intégration au RAG (modifier geminiService.ts)
5. ⏳ API endpoints pour consultation faits
6. ⏳ UI affichage matrice garanties
7. ⏳ Vectoriser tous les CG existants
8. ⏳ Monitoring qualité extractions

## 🎯 KPIs Succès

- **Précision garanties**: 0 hallucination sur questions "ai-je X ?"
- **Temps réponse**: < 500ms requête SQL vs 2-5s RAG textuel
- **Couverture**: 100% tableaux détectés et extraits
- **Confiance**: > 0.9 sur extraction Vision
