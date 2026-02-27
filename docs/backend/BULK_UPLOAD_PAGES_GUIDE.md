# Guide : Chargement en Masse avec Vectorisation Page par Page

## Vue d'ensemble

Le script `bulk-upload-with-pages.js` est une version améliorée du chargement en masse qui :

1. **Vectorise le document complet** → table `central_cg`
2. **Vectorise chaque page individuellement** → table `central_cg_pages`
3. **Extrait les tableaux de garanties avec Vision** → analyse d'images
4. **Crée des faits structurés** → table `coverage_facts`

## Architecture

```
PDF → [Document complet]     → central_cg (embedding global)
   ↓
   → [Page 1] → texte + image → central_cg_pages (embedding page)
   →            ↓ Vision
   →            → Tableau détecté → coverage_facts (garantie × formule)
   ↓
   → [Page 2] → texte + image → central_cg_pages
   ↓
   → [Page N] ...
```

## Tables alimentées

### 1. `central_cg`
- Document complet avec texte et embedding global
- Métadonnées (assureur, type, version)
- Status: `vectorisé+pages`

### 2. `central_cg_pages`
- Chaque page du PDF
- Texte extrait de la page
- Image PNG en base64
- Embedding spécifique à la page
- Flag `has_table` si tableau détecté
- JSON du tableau extrait avec confidence score

### 3. `coverage_facts`
- Faits structurés : garantie × formule → statut
- Exemple : `bris_de_glaces × tiers_essentiel → optional`
- Montants et franchises extraits
- Traçabilité : `source_page_id` et `source_page_number`

## Prérequis

### Dépendances Node.js
```bash
npm install canvas pdf-lib pdfjs-dist
```

### Bibliothèques système (Linux/VM)
```bash
sudo apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev
```

## Utilisation

### 1. Préparer le fichier Excel

Le fichier `liste_pdf.xlsx` doit contenir :

| Insurer | Insurance_type | Insurer_name | Insurance_type_name | Type | Détail | URL | nom fichier cible | Status |
|---------|---------------|--------------|---------------------|------|--------|-----|-------------------|--------|
| MAAF | AUT | MAAF | Auto | CG | | | MAAF_AUT_001.pdf | téléchargé |

**Colonnes requises :**
- `Insurer` : code assureur (ex: MAAF, AES, AXA)
- `Insurance_type` : code type (ex: AUT, HAB, SAN)
- `nom fichier cible` : nom du fichier PDF
- `Status` : doit être "téléchargé" pour être traité

### 2. Placer les PDFs

**Sur VM Linux :**
```bash
/home/VMRemi19821982/AssurClair/pdfs/
  ├── MAAF_AUT_001.pdf
  ├── AES_HAB_001.pdf
  └── ...
```

**Sur Windows :**
```
C:\biencouvert\cdg\
  ├── MAAF_AUT_001.pdf
  └── ...
```

### 3. Lancer le script

```bash
cd BackEnd
node bulk-upload-with-pages.js
```

## Processus détaillé

### Étape 1 : Document complet (central_cg)
```javascript
1. Lire le PDF complet
2. Extraire texte avec Gemini Flash
3. Générer embedding text-embedding-004
4. Insérer dans central_cg → retourne cgId
```

### Étape 2 : Pages individuelles (central_cg_pages)
```javascript
Pour chaque page du PDF :
  1. Extraire texte avec pdf.js
  2. Rendre en image PNG avec canvas
  3. Générer embedding de la page
  4. Détecter si tableau présent (heuristique mots-clés)
  5. Si tableau → extraire avec Gemini Vision
  6. Insérer dans central_cg_pages → retourne pageId
```

### Étape 3 : Extraction des tableaux (Vision)
```javascript
Si has_table:
  1. Envoyer image PNG à Gemini 2.0 Flash (Vision)
  2. Demander extraction JSON : headers + rows + confidence
  3. Valider confidence ≥ 0.5
  4. Stocker JSON dans table_json
```

### Étape 4 : Faits de couverture (coverage_facts)
```javascript
Pour chaque tableau extrait :
  1. Headers = formules (Tiers, Tous Risques...)
  2. Rows = garanties (RC, Bris de glaces...)
  3. Pour chaque cellule :
     - Normaliser garantie_key et formula_key (snake_case)
     - Parser statut : ✓=included, ○=optional, -=excluded
     - Extraire montants et franchises
     - Créer fact avec traçabilité (page_id, page_number)
  4. Insérer avec ON CONFLICT DO UPDATE
```

## Format des données

### Table JSON extrait (table_json)
```json
{
  "headers": ["Garantie", "Tiers", "Intermédiaire", "Tous Risques"],
  "rows": [
    ["Responsabilité civile", "✓", "✓", "✓"],
    ["Bris de glaces", "-", "○ 200€", "✓ illimité"],
    ["Vol", "-", "-", "✓ franchise 300€"]
  ],
  "confidence": 0.85
}
```

### Coverage fact créé
```javascript
{
  insurer_code: 'MAAF',
  insurance_type_code: 'AUT',
  central_cg_id: 100,
  guarantee_key: 'bris_de_glaces',
  guarantee_label: 'Bris de glaces',
  formula_key: 'intermediaire',
  formula_label: 'Intermédiaire',
  coverage_status: 'optional',
  coverage_amount: '200',
  franchise: null,
  source_page_id: 42,
  source_page_number: 12,
  extraction_confidence: 0.85
}
```

## Logs

Le script génère `bulk-upload-pages.log` avec :

```
[2026-02-08T14:30:00.000Z] 🚀 Chargement en masse avec vectorisation page par page
[2026-02-08T14:30:01.000Z] 📋 Lecture du fichier Excel: /path/to/liste_pdf.xlsx
[2026-02-08T14:30:02.000Z] 📊 3 document(s) à vectoriser

[2026-02-08T14:30:03.000Z] [1/3] ────────────────────────────────
[2026-02-08T14:30:03.000Z] 📥 Traitement de MAAF_AUT_001.pdf...
[2026-02-08T14:30:05.000Z]   📄 Extraction du texte complet...
[2026-02-08T14:30:15.000Z]   ✅ 224531 caractères extraits
[2026-02-08T14:30:16.000Z]   🔮 Génération de l'embedding du document...
[2026-02-08T14:30:17.000Z]   ✅ Embedding généré (768 dimensions)
[2026-02-08T14:30:18.000Z]   💾 Insertion dans central_cg...
[2026-02-08T14:30:19.000Z]   ✅ Document central_cg créé avec ID 100
[2026-02-08T14:30:20.000Z]   📄 58 pages à traiter
[2026-02-08T14:30:21.000Z]     Page 1/58...
[2026-02-08T14:30:25.000Z]     Page 2/58...
[2026-02-08T14:30:30.000Z]     Page 12/58...
[2026-02-08T14:30:31.000Z]       🔍 Tableau détecté, extraction Vision...
[2026-02-08T14:30:45.000Z]       ✅ Tableau extrait (confidence: 0.87)
[2026-02-08T14:30:46.000Z]       ✅ 24 faits de couverture créés
[2026-02-08T14:35:00.000Z]   ✅ Vectorisation page par page terminée:
[2026-02-08T14:35:00.000Z]      - 58 pages traitées
[2026-02-08T14:35:00.000Z]      - 3 tableaux extraits
[2026-02-08T14:35:00.000Z]      - 72 faits de couverture créés
```

## Statuts Excel

Après traitement, le fichier Excel est mis à jour :

| Status | Signification |
|--------|---------------|
| `téléchargé` | Prêt à être vectorisé (statut de départ) |
| `vectorisé+pages` | Traitement réussi (document + pages + facts) |
| `erreur vectorisation` | Échec du traitement |
| `fichier manquant` | PDF introuvable dans le dossier |

## Performances

### Temps de traitement (estimation)

**Document de 60 pages avec 3 tableaux :**
- Extraction texte complet : ~10s
- Embedding document : ~2s
- Par page (sans tableau) : ~5s
  * Extraction texte : ~1s
  * Rendu PNG : ~1s
  * Embedding : ~2s
- Par page (avec tableau) : ~15s
  * + Vision extraction : ~10s
  * + Création facts : ~2s

**Total pour 60 pages avec 3 tableaux :**
- 60 pages × 5s = 300s (5 min)
- 3 tableaux × 10s = 30s
- **Total ≈ 6-7 minutes par document**

### Optimisations possibles

1. **Parallélisation des pages** : traiter plusieurs pages simultanément
2. **Cache des embeddings** : éviter de recalculer si texte identique
3. **Détection précoce** : ignorer pages vides ou sans intérêt
4. **Batch Vision** : envoyer plusieurs images à Vision en parallèle

## Vérification des résultats

### 1. Vérifier central_cg
```sql
SELECT id, insurer_code, insurance_type_code, 
       LENGTH(content_text) as text_length,
       status, created_at
FROM central_cg
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 5;
```

### 2. Vérifier central_cg_pages
```sql
SELECT central_cg_id, page_number, has_table, confidence,
       LENGTH(content_text) as text_length
FROM central_cg_pages
WHERE central_cg_id = 100
ORDER BY page_number;
```

### 3. Vérifier coverage_facts
```sql
SELECT guarantee_label, formula_label, coverage_status, 
       coverage_amount, source_page_number
FROM coverage_facts
WHERE central_cg_id = 100
ORDER BY guarantee_label, formula_label;
```

### 4. Voir la matrice complète
```sql
SELECT * FROM v_coverage_matrix
WHERE central_cg_id = 100
ORDER BY guarantee_label, formula_label;
```

## Dépannage

### Erreur : "Cannot find module 'canvas'"
```bash
# Installer les dépendances système
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev

# Réinstaller canvas
npm install canvas
```

### Erreur : "Python not found" (dans Docker)
Le Dockerfile doit inclure :
```dockerfile
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev
```

### Tableaux non détectés
Ajuster la fonction `detectTableInPage()` pour inclure plus de mots-clés spécifiques à vos documents.

### Confidence trop faible
Modifier le seuil dans `extractTableFromPageImage()` :
```javascript
if (tableData.confidence < 0.3) { // au lieu de 0.5
  return null;
}
```

## Différences avec bulk-upload-from-excel.js

| Aspect | Ancien script | Nouveau script |
|--------|--------------|----------------|
| Vectorisation | Document complet seulement | Document + pages individuelles |
| Tableaux | Non extraits | Extraction Vision + JSON |
| Coverage facts | Non créés | Créés automatiquement |
| Traçabilité | Limitée | Complète (page source) |
| Temps | ~30s/doc | ~6min/doc |
| Précision garanties | Moyenne (RAG texte) | Haute (faits structurés) |

## Utilisation recommandée

1. **Premier chargement** : utiliser `bulk-upload-with-pages.js` pour créer la base complète
2. **Mises à jour ponctuelles** : utiliser `vectorize-cg-pages.js <cgId>` pour un document spécifique
3. **Tests rapides** : utiliser l'ancien `bulk-upload-from-excel.js` si pas besoin de coverage_facts

## Prochaines étapes

Après le chargement, intégrer les coverage_facts dans les réponses de l'assistant :

```typescript
// Dans geminiService.ts
async function getCoverageForUser(userId: string, guaranteeKey: string) {
  const result = await pool.query(`
    SELECT cf.* 
    FROM coverage_facts cf
    JOIN policies p ON p.insurer_code = cf.insurer_code 
      AND p.insurance_type_code = cf.insurance_type_code
    WHERE p.user_id = $1 
      AND cf.guarantee_key = $2
  `, [userId, guaranteeKey]);
  
  return result.rows[0];
}
```

## Support

Pour toute question ou problème :
1. Vérifier les logs : `bulk-upload-pages.log`
2. Tester avec un seul document d'abord
3. Vérifier les tables avec les requêtes SQL ci-dessus
