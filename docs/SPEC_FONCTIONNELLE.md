# Spécification Fonctionnelle — AssurClair

> Document de référence — logique algorithmique et LLM

---

## Table des matières

1. [Pipelines d'ingestion PDF](#1-pipelines-dingestion-pdf)
   - 1.1 [Infrastructure commune](#11-infrastructure-commune)
   - 1.2 [Chargement en masse (Bulk)](#12-chargement-en-masse-bulk)
   - 1.3 [Chargement Admin](#13-chargement-admin)
   - 1.4 [Chargement Utilisateur](#14-chargement-utilisateur)
   - 1.5 [Boucle de vectorisation (cœur commun)](#15-boucle-de-vectorisation-cœur-commun)
   - 1.6 [Extraction Vision (tableaux de garanties)](#16-extraction-vision-tableaux-de-garanties)
2. [Affichage du détail des garanties](#2-affichage-du-détail-des-garanties)
3. [Réponses de l'assistant IA](#3-réponses-de-lassistant-ia)
4. [Optimisations techniques](#4-optimisations-techniques)

---

## 1. Pipelines d'ingestion PDF

### 1.1 Infrastructure commune

Les trois pipelines partagent les mêmes briques techniques :

| Composant | Outil | Rôle |
|---|---|---|
| Parsing PDF | `pdfjs-dist/legacy` | Extraction du texte brut, page par page |
| Rendu image | `canvas` (Node) | Rendu PNG à 2× de résolution pour Vision |
| Vision LLM | Gemini 2.5 Flash (multimodal) | Extraction des tableaux de garanties |
| Embeddings | Gemini Embedding API (REST) | Vectorisation du texte pour la recherche sémantique |
| Base de données | PostgreSQL (`pg.Pool`) | Stockage des pages, faits de couverture, vecteurs |

---

### 1.2 Chargement en masse (Bulk)

**Fichier :** `BackEnd/bulk-upload-with-pages.mjs`

**Déclencheur :** exécution manuelle en ligne de commande.

```
node bulk-upload-with-pages.mjs
```

**Entrée :** fichier Excel `liste_pdf.xlsx` contenant une ligne par document :
- chemin du PDF (local ou URL)
- `insurer_code`, `insurance_type_code`
- métadonnées complémentaires (version, formule, etc.)

**Algorithme :**

```
POUR chaque ligne de liste_pdf.xlsx :
  1. Lire les métadonnées de la ligne
  2. Ouvrir le PDF (chemin local ou fetch URL)
  3. Appeler vectorizeCgByPages(pool, centralCgId, url, base64)
  4. Journaliser les tokens consommés (tableExtraction / metadataExtraction)
  5. En cas d'erreur DB : retryDbOperation (12 tentatives × 60 s)
FIN BOUCLE
Appeler logTokenSummary() → afficher le coût estimé Gemini
```

**Suivi des tokens :**

```typescript
tokenStats = {
  tableExtraction:    { calls, inputTokens, outputTokens },
  metadataExtraction: { calls, inputTokens, outputTokens }
}
```

Le coût est estimé en fin de traitement avec les tarifs Gemini 2.5 Flash :
- Input : 0,075 $/M tokens
- Output : 0,30 $/M tokens

**Résilience DB :** `retryDbOperation(fn, retries=12, delay=60s)` — attend la sortie du mode recovery PostgreSQL avant de réessayer.

---

### 1.3 Chargement Admin

**Fichier :** `BackEnd/src/routes/policies.ts`

**Déclencheur :** requête HTTP de l'interface d'administration.

```
POST /api/policies/upload
Content-Type: multipart/form-data
Body: { pdf: <fichier>, insurerCode, insuranceTypeCode, ... }
```

**Algorithme :**

```
1. Réception du fichier PDF (multipart)
2. Upload vers Azure Blob Storage → obtention de l'URL publique
3. Création de l'entrée central_cg en base (status = 'processing')
4. Appel asynchrone : vectorizeCgByPages(pool, centralCgId, url, pdfBase64)
5. À la fin : mise à jour status = 'active' (ou 'error')
6. Réponse HTTP immédiate → le frontend poll le statut
```

**Stockage produit :**
- `central_cg` : métadonnées du document (insurer, type, version, url, status)
- `central_cg_pages` : une ligne par page (texte, image, embedding, chunk_type, table_json)
- `coverage_facts` : une ligne par couple (garantie × formule) extrait

---

### 1.4 Chargement Utilisateur

**Fichier :** `BackEnd/src/routes/cg.ts`

**Déclencheur :** upload depuis l'application mobile/web de l'utilisateur.

```
POST /api/cg/user/upload
Content-Type: multipart/form-data
Body: { pdf: <fichier>, insurerCode, insuranceTypeCode, userId, ... }
```

**Différence par rapport à l'Admin :**

| Aspect | Admin (central) | Utilisateur |
|---|---|---|
| Tables cibles | `central_cg` / `central_cg_pages` / `coverage_facts` | `user_cg` / `user_cg_pages` / `user_coverage_facts` |
| Accès | Partagé entre tous les utilisateurs | Privé à l'utilisateur |
| Vectorisation | `vectorizeCgByPages()` | `vectorizeUserCgByPages()` (même logique) |
| Promotion | N/A | `POST /api/cg/user/promote-to-central/:userCgId` |

**Promotion communautaire :** un admin peut promouvoir un CG utilisateur vers le pool central via :

```
POST /api/cg/user/promote-to-central/:userCgId
```

Cette opération copie les données de `user_cg` vers `central_cg` et recrée les faits dans `coverage_facts`.

---

### 1.5 Boucle de vectorisation (cœur commun)

**Fichier :** `BackEnd/src/services/pageVectorizationService.ts`

C'est le moteur central partagé par les trois pipelines.

#### Boucle principale

```
vectorizeCgByPages(pool, centralCgId, pdfUrl, pdfBase64?)

POUR chaque page i de 1 à N :

  [ÉTAPE 1 — EXTRACTION]
  extractPage(i)
    → texte brut     (pdfjs-dist, toutes lignes)
    → image PNG base64 (canvas, 2× résolution)

  [ÉTAPE 2 — STOP CHECK]
  SI stopRequests.has(centralCgId) :
    status = 'partial'
    ARRÊT

  [ÉTAPE 3 — EMBEDDING]
  attendre 1200 ms (throttle)
  questionEmbedding = generateEmbedding(texte)
  → peut échouer silencieusement (retourne null)

  [ÉTAPE 4 — DÉTECTION TABLE]
  hasTable = detectTable(texte)   // heuristique multi-critères
  chunkType = classifyPage(texte, hasTable)

  [ÉTAPE 5 — EXTRACTION VISION]
  SI hasTable OU maybeTable :
    attendre 500 ms (throttle Vision)
    tableJson = extractTableFromPageImage(
      image,
      insurerCode,
      insuranceTypeCode,
      lastKnownFormulaHeaders   // carry-forward
    )
    SI succès :
      mise à jour lastKnownFormulaHeaders
      mise à jour discoveredFormulaLabels (catalogue global)

  [ÉTAPE 6 — SAUVEGARDE PAGE]
  INSERT central_cg_pages (
    texte, embedding, image, chunk_type,
    has_table, table_json, page_number, ...
  )

  [ÉTAPE 7 — SAUVEGARDE FAITS]
  SI tableJson :
    facts = tableToFacts(tableJson, ...)
    saveCoverageFacts(pool, facts, ...)

FIN BOUCLE
```

#### Détection de tableau — `detectTable(text)`

Retourne `true` si au moins une condition est satisfaite :

| Critère | Description |
|---|---|
| Noms de formules | Présence de mots : `tiers`, `tous-risques`, `premium`, `essentiel`, `confort`, `formule N` |
| Mots-clés garanties | `responsabilite civile`, `bris de glaces`, `vol`, `incendie`, `hospitalisation`, `optique` |
| Pictos visuels | Présence de symboles `✓ ● ○ ✗ × — □` dans le texte |
| Structure courte | > 5 lignes non vides ET > 8 lignes courtes (< 80 caractères) |

#### Classification de page — `classifyPage(text, hasTable)`

Retourne l'un des types ci-dessous selon des scores calculés par comptage de mots-clés :

| Type | Description |
|---|---|
| `tableau` | Page de tableaux de garanties |
| `exclusion` | Liste des exclusions |
| `restriction` | Limites, franchises, plafonds |
| `garantie` | Description narrative d'une garantie |
| `definition` | Glossaire, définitions contractuelles |
| `general` | Contenu général (sommaire, mentions légales) |

#### Continuité multi-pages — carry-forward

Si un tableau de garanties s'étend sur plusieurs pages consécutives, le service mémorise les en-têtes de formules de la page précédente (`lastKnownFormulaHeaders`) et les injecte dans le prompt Vision de la page suivante. Cela garantit que Gemini utilise exactement les mêmes noms de colonnes que la page précédente.

---

### 1.6 Extraction Vision (tableaux de garanties)

**Fichier :** `BackEnd/src/services/tableExtractionService.ts`

#### `extractTableFromPageImage(imageBase64, insurerCode, insuranceTypeCode, knownFormulaHeaders?)`

Envoie l'image de la page à Gemini 2.5 Flash avec un prompt structuré en 5 étapes.

**Prompt Vision — 5 étapes :**

```
═══ ÉTAPE 1 — LÉGENDE (PRIORITÉ ABSOLUE) ═══
  Chercher sur la page une légende explicite des symboles
  ex: ● = Inclus, ○ = En option, ✗ = Exclu
  → Construire un dict { symbole → statut }
  
═══ ÉTAPE 2 — EN-TÊTES DE COLONNES ═══
  Identifier les noms de formules (colonnes)
  → Concaténer les lignes d'un en-tête multi-lignes
  → Si knownFormulaHeaders fourni : réutiliser EXACTEMENT ces noms
  
═══ ÉTAPE 3 — LIGNES DE GARANTIES ═══
  Pour chaque ligne :
    - Lire la cellule de gauche (guarantee_label)
    - Pour chaque formule : lire le symbole et appliquer la légende
    - Détecter si la ligne est un titre de section (is_section: true)
    
═══ ÉTAPE 4 — FORMAT JSON ═══
  Répondre UNIQUEMENT en JSON valide :
  {
    "legend": { "●": "included", "○": "optional", "✗": "excluded" },
    "formula_headers": ["TIERS", "TIERS ETENDU", "TOUS RISQUES"],
    "rows": [
      {
        "guarantee_label": "Responsabilité Civile",
        "is_section": false,
        "cells": [
          { "formula_label": "TIERS", "status": "included", "value": "Illimité" },
          ...
        ]
      }
    ]
  }

═══ ÉTAPE 5 — RÈGLES ABSOLUES ═══
  - La légende prime sur toute interprétation personnelle des symboles
  - Une cellule vide ≠ exclusion (laisser status = "not_applicable")
  - Les lignes "is_section" ne sont pas des garanties
```

**Contexte continuation (si knownFormulaHeaders fourni) :**

```
═══ CONTEXTE — PAGE DE CONTINUATION ═══
Cette page est la suite d'un tableau commencé sur la page précédente.
Formules détectées : [TIERS, TIERS ETENDU, TOUS RISQUES]
Utilise EXACTEMENT ces noms de colonnes.
```

#### `tableToFacts(table, insurerCode, insuranceTypeCode, centralCgId, pageId, pageNum)`

Convertit le JSON Vision en liste de `CoverageFact[]`.

```
POUR chaque row du tableau :
  SI row.is_section == true : SKIP
  SI TOUTES les cellules formule sont vides : SKIP (titre de section implicite)
  
  POUR chaque cellule formule :
    status = parseStatus(cell.value, legend)
    → CoverageFact { guarantee_key, guarantee_label, formula_key, formula_label,
                     coverage_status, coverage_amount }
```

#### `parseStatus(symbol, legend?)` — hiérarchie de priorité

```
1. LÉGENDE (priorité absolue)
   Si legend est défini et contient le symbole → retourner 'included' / 'excluded' / 'optional'

2. PICTOS STANDARDS (si absent de légende)
   ✓ ● • ▪  →  'included'
   ✗ ✘ × □  →  'excluded'
   ○ △      →  'optional'

3. TEXTE (si pas de picto reconnu)
   'oui' / 'inclus' / 'garanti' / ...  →  'included'
   'non' / 'exclu' / 'néant' / ...     →  'excluded'

4. MONTANT NUMÉRIQUE
   ex: '500 000€', '50€/j'  →  'included' + stocker dans coverage_amount

5. FALLBACK
   → 'not_applicable'
```

#### Normalisation des clés

| Fonction | Règle |
|---|---|
| `normalizeGuaranteeKey(label)` | Minuscule, suppression accents, non-alphanumériques → `_` |
| `normalizeFormulaKey(label)` | Idem + `+` → `_plus` (ex: `TIERS ESSENTIEL+` → `tiers_essentiel_plus`) |

---

## 2. Affichage du détail des garanties

### 2.1 Déclenchement

**Frontend :** `FrontEnd/components/CoverageDetailPage.tsx`

Lorsque l'utilisateur clique sur une police pour en voir le détail, le composant s'initialise et appelle immédiatement :

```typescript
GET /api/ai/coverage-details
Body: { policy: PolicyObject }
```

**Backend :** `BackEnd/src/routes/ai.ts` → `getCoverageAnalysis(policy)`

### 2.2 Algorithme `getCoverageAnalysis`

**Fichier :** `BackEnd/src/services/geminiService.ts`

```
getCoverageAnalysis(policy)

INPUT: objet policy { id, name, insurer, type, formula, annualPremium, summary }

ÉTAPE 1 — CONTEXTE RAG
  Générer embedding pour : "Garanties formule {formulaName} assurance {type} {insurer}"
  Chercher dans central_cg (similarité cosinus) → 4 chunks max
  → ragContext = texte concaténé des chunks (800 chars chacun, séparateur ---)

ÉTAPE 2 — CONSTRUCTION DU PROMPT
  Si ragContext disponible :
    ajouter section "EXTRAITS DES CONDITIONS GÉNÉRALES"
  Sinon si summary disponible :
    ajouter section "RÉSUMÉ CONTRAT"
  
  Demande JSON structurée à Gemini 2.5 Flash (responseMimeType: 'application/json')

ÉTAPE 3 — APPEL GEMINI
  Modèle : gemini-2.5-flash
  Format forcé : JSON
  Réponse attendue :
  {
    formulaName, formulaLevel,
    formulaDescription,
    coverages[],    // 6 à 14 garanties
    exclusions[],   // 4 à 8 exclusions
    keyStrengths[], keyWeaknesses[],
    recommendation,
    alternativeFormulas[]
  }

ÉTAPE 4 — FALLBACK
  Si Gemini indisponible ou JSON invalide :
    → buildFallbackCoverage() (données vides + message d'explication)
```

### 2.3 Structure des données retournées

```typescript
CoverageData {
  formulaName: string
  formulaLevel: 'basic' | 'intermediate' | 'premium'
  formulaDescription: string
  coverages: CoverageItem[]
  exclusions: string[]
  keyStrengths: string[]
  keyWeaknesses: string[]
  recommendation: string
  alternativeFormulas: AlternativeFormula[]
}

CoverageItem {
  category: string            // ex: "Responsabilité Civile"
  guarantee: string           // ex: "Dommages causés aux tiers"
  included: boolean
  limit?: string              // ex: "500 000€ / sinistre"
  note?: string
  importance: 'key' | 'standard' | 'optional'
}

AlternativeFormula {
  name: string
  priceVariation: string      // ex: "+15€/mois"
  mainDifference: string
  recommended: boolean
}
```

### 2.4 Rendu frontend

Le composant propose 3 onglets :

| Onglet | Contenu |
|---|---|
| **overview** | Niveau de formule (badge), compteurs inclus/exclus, points forts, points faibles, recommandation |
| **details** | Garanties groupées par catégorie — accordéon : incluses ✓ et exclues ✗ avec plafonds et notes |
| **alternatives** | Liste des formules alternatives avec variation tarifaire et différence principale |

**Calculs d'affichage :**
```typescript
includedCount  = coverages.filter(c =>  c.included).length
excludedCount  = coverages.filter(c => !c.included).length
levelInfo      = LEVEL_LABELS[formulaLevel]   // { label, color, description }
```

**Indicateurs visuels :**
- Icône et couleur de gradient selon `policy.type` (auto, habitation, santé...)
- Badges d'importance sur chaque garantie (`key` → étoile, `optional` → gris)
- Lien vers les conditions générales PDF si `policy.sourceUrl` disponible

---

## 3. Réponses de l'assistant IA

### 3.1 Architecture des endpoints

| Endpoint | Mode | Description |
|---|---|---|
| `POST /api/ai/chat` | Réponse complète | Réponse JSON `{ response: string }`, avec cache Redis |
| `POST /api/ai/chat/stream` | SSE streaming | Envoi progressif par chunks via Server-Sent Events |

**Payload entrant (les deux endpoints) :**
```json
{
  "message": "Ma voiture est-elle couverte pour le bris de glace ?",
  "policies": [ { "id": "42", "userId": 7, ... } ],
  "history":  [ { "role": "user", "text": "..." }, { "role": "model", "text": "..." } ]
}
```

### 3.2 Construction du contexte — `sendMessageToAssistant`

**Fichier :** `BackEnd/src/services/geminiService.ts`

L'assistant ne répond jamais à l'aveugle : il construit un contexte riche depuis la base avant d'appeler Gemini.

#### Étape par étape

```
ÉTAPE 0 — RECHARGEMENT POLICIES
  Recharger les policies depuis la DB (storage.readPolicies)
  → obtenir les metadata complets : formula, options, insurerCode, typeCode, centralCgId

ÉTAPE 0b — CACHE REDIS
  cacheKey = hash(message + sorted policy IDs)
  Si cache hit → retourner directement (30 min TTL)

ÉTAPE 1 — EMBEDDING DE LA QUESTION
  questionEmbedding = generateEmbedding(message)
  → null si Zscaler / quota atteint : mode dégradé sans RAG vectoriel

ÉTAPE 2 — RAG POLICY CHUNKS
  Rechercher dans policy_embeddings (vecteurs des contrats de l'utilisateur)
  Paramètres : questionEmbedding × policyIds → 5 chunks max

ÉTAPE 3 — RAG CONDITIONS GÉNÉRALES
  Résoudre les IDs des CG liées aux policies :
    a. policy.centralCgId direct
    b. Fallback A : chercher par (insurerCode + typeCode) dans central_cg
    c. Fallback B : chercher par insurerCode seul si typeCode absent
  
  Rechercher dans central_cg par similarité cosinus → 5 résultats max
  Rechercher dans user_cg par similarité cosinus → 5 résultats max
  Trier par similarité DESC, garder top 5
  
  Si aucun embedding disponible : lire content_text directement (similarity = 0.5)

ÉTAPE 3b — COVERAGE_FACTS (priorité absolue)
  resolveCoverageFacts(storage, policies, 'chat')
  → tableau structuré des statuts garantie × formule

ÉTAPE 3c — PAGES CG CIBLÉES
  Détecter les mots-clés garanties dans la question :
    BRIS_GLACE → ['bris', 'glace', 'vitrage', ...]
    VOL        → ['vol', 'cambriolage', ...]
    RC         → ['responsabilit', 'civil', 'tiers', ...]
    (9 domaines au total)
  
  Si mots-clés détectés :
    Lire les pages CG dont guarantee_codes contient les codes détectés → 10 pages max

ÉTAPE 4 — ASSEMBLAGE DU CONTEXTE ENRICHI
  Sections construites dans l'ordre :
    📋 VOS CONTRATS         → liste des polices avec formula et options souscrites
    📄 Extraits contrats    → chunks policy_embeddings
    📚 Conditions générales → texte CG (extraction intelligente par zones)
    ⚙️ OPTIONS SOUSCRITES   → bannière si options effectivement achetées
    📊 TABLEAU DES GARANTIES → coverage_facts formatés en liste garantie × statut
    📄 ARTICLES CG SPÉC.    → pages CG spécifiques à la garantie demandée

ÉTAPE 5 — APPEL GEMINI
  model.startChat() avec un historique initial contenant le systemInstruction
  → sendMessage(question)
```

#### Extraction intelligente du texte CG

Pour chaque document CG, le système évite d'envoyer 60 000 tokens en aveugle :

```
1. Extraire les mots-clés de la question (> 3 chars, non stopwords, non numériques)
2. Ajouter les formules des polices comme mots-clés supplémentaires
3. Chercher TOUTES les positions de ces mots-clés dans le texte

Si au moins un mot-clé trouvé :
   → Regrouper les positions proches (< 10 000 chars entre elles)
   → Extraire jusqu'à 5 zones de 20 000 chars (centrées sur les occurrences)

Sinon (aucun mot-clé) :
   → Extraire 3 zones : début (15k) + milieu (15k) + fin (15k)

Si document court (< 10 000 chars) :
   → Prendre les 40 000 premiers caractères
```

### 3.3 Règles et consignes du prompt système

Ces règles sont injectées dans chaque appel sous forme d'un `systemInstruction` long.

#### Règles de format

- Réponses en **listes à puces** (`-`) uniquement — jamais de `*`
- Interdiction de gras (`**`) et d'italique (`__`)
- Ligne d'introduction courte identifiant la formule
- Ligne source discrète en fin : `[NomProduit - page X](url_pdf)`

#### Règles de contenu

| Règle | Description |
|---|---|
| Accès aux documents | Ne jamais dire "je n'ai pas accès", "consultez votre assureur" — le contexte est fourni |
| Source prioritaire | `📊 TABLEAU DES GARANTIES` est la source la plus fiable (extraction directe) |
| Identification formule | Toujours identifier la formule exacte du contrat dans `📋 VOS CONTRATS` |
| Options souscrites | Distinguer "option disponible" vs "option souscrite (INCLUSE)" |
| Cohérence | Interdiction de corriger une réponse précédente ou de s'excuser |

#### Hiérarchie des garanties (règle critique)

```
Section spécifique > Exclusion générale d'une autre section

Exemple :
  Section "Assistance" mentionne "serrurerie" → INCLUSE
  Section "Protection des biens" exclut les "pertes" → s'applique uniquement à cette section

Principe : une garantie nommée explicitement dans une section
           l'emporte sur une exclusion générale d'une autre section.
```

#### Règle des options souscrites

```
policy.options = ["Bris de glace", "Protection conducteur"]

Dans coverage_facts :
  Bris de glace (optional) → marqué "✓ INCLUSE (option souscrite)" si dans policy.options
  Assistance (optional)    → marqué "○ EN OPTION (non souscrite)" si absent de policy.options

L'assistant doit répondre en conséquence dans les deux cas.
```

### 3.4 Mode streaming (SSE)

```
Même logique d'enrichissement que le mode standard

Configuration SSE :
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive

Chaque chunk reçu de Gemini :
  → res.write('data: {"chunk": "..."}\n\n')

En fin de stream :
  → res.write('data: {"done": true}\n\n')
  → res.end()
```

> Le cache Redis ne s'applique **pas** au mode streaming (réponse en temps réel).

---

## 4. Optimisations techniques

### 4.1 Déduplication des faits de couverture

**Fichier :** `BackEnd/src/services/tableExtractionService.ts` — `saveCoverageFacts()`

Quand un document est revectorisé ou qu'un tableau s'étend sur plusieurs pages, les mêmes garanties peuvent être réinsérées. Le système gère cela via une contrainte SQL unique et une stratégie de merge :

**Contrainte unique (central) :**
```sql
UNIQUE (insurer_code, insurance_type_code, central_cg_id, guarantee_key, formula_key)
```

**Contrainte unique (utilisateur) :**
```sql
UNIQUE (user_cg_id, guarantee_key, formula_key)
```

**Stratégie ON CONFLICT :**
```sql
ON CONFLICT (...) DO UPDATE SET
  coverage_status = CASE
    WHEN EXCLUDED.coverage_status = 'not_applicable'
      AND coverage_facts.coverage_status != 'not_applicable'
    THEN coverage_facts.coverage_status   -- conserver le statut existant si le nouveau est vide
    ELSE EXCLUDED.coverage_status         -- sinon, mettre à jour
  END,
  coverage_amount = COALESCE(EXCLUDED.coverage_amount, coverage_facts.coverage_amount),
  -- tous les autres champs sont mis à jour
  updated_at = CURRENT_TIMESTAMP
```

→ En revectorisant un document, aucun doublon n'est créé : les faits existants sont mis à jour. Les statuts concrets (`included`, `excluded`, `optional`) ne sont jamais écrasés par `not_applicable`.

Toutes les insertions sont dans une transaction (`BEGIN` / `COMMIT` / `ROLLBACK`).

---

### 4.2 Continuité multi-pages (carry-forward)

Problème : un tableau de garanties peut s'étendre sur 2 ou 3 pages consécutives. Gemini n'a pas de mémoire d'une page à l'autre.

Solution : mémoriser les en-têtes de formules détectés (`lastKnownFormulaHeaders`) et les injecter dans le prompt de chaque page suivante.

```
Page 3 : Vision détecte ["TIERS", "TIERS ETENDU", "TOUS RISQUES"]
         → lastKnownFormulaHeaders = ["TIERS", "TIERS ETENDU", "TOUS RISQUES"]

Page 4 : Gemini reçoit le bloc "CONTEXTE — PAGE DE CONTINUATION"
         → Utilise exactement ces noms de colonnes
         → Les formula_key générés sont identiques

Résultat en base : les faits pages 3 et 4 ont les mêmes formula_key
                   → jointure possible, pas de doublons de colonnes
```

---

### 4.3 Rate limiting

| Opération | Délai |
|---|---|
| Appels embedding | 1 200 ms entre chaque appel |
| Appels Vision (extraction tableau) | 500 ms avant chaque appel |

Ces délais évitent les erreurs 429 (quota Gemini) lors du traitement de gros documents.

---

### 4.4 Mécanisme d'arrêt (stop)

La vectorisation d'un document peut être interrompue proprement :

```typescript
stopRequests: Map<centralCgId, boolean>

// Lancer l'arrêt depuis l'API :
stopRequests.set(centralCgId, true)

// Vérifié à chaque page :
if (stopRequests.get(centralCgId)) {
  UPDATE central_cg SET vectorization_status = 'partial'
  return
}
```

Le document est marqué `partial` (et non `error`). Les pages déjà traitées sont conservées.

---

### 4.5 Fallback des modèles d'embedding

Le service teste automatiquement les modèles dans l'ordre de préférence et met en cache le premier qui fonctionne :

```
1. text-embedding-004            (3 072 dimensions, modèle préféré)
2. text-multilingual-embedding-002
3. embedding-001                 (768 dimensions, fallback universel)
4. gemini-embedding-exp-03-07
```

Le modèle fonctionnel est mémorisé en mémoire pendant 5 minutes, évitant de le re-tester à chaque page. **Un modèle introuvable ne bloque pas la vectorisation** : la page est enregistrée sans embedding (la recherche sémantique sera dégradée pour ce document).

**Backoff exponentiel** sur erreurs 429 / 503 : délai progressif jusqu'à 4 reprises.

---

### 4.6 Cache Redis (chat)

Les réponses de l'assistant sont mises en cache pour éviter des appels Gemini redondants sur des questions identiques.

```
Clé   : hash(message + sorted(policy_ids))
TTL   : 30 minutes (configurable via CACHE_TTL env)
Scope : uniquement le mode chat standard (non le mode streaming)

Cache hit  → réponse identique retournée immédiatement
Cache miss → appel Gemini + mise en cache du résultat
```

---

### 4.7 Détection de doublons et optimisation de portefeuille

**Endpoint :** `POST /api/ai/detect-duplicates`
**Fichier :** `BackEnd/src/services/geminiService.ts` — `detectDuplicates()`

Ce service analyse le portefeuille complet de l'utilisateur et identifie :
- les **doublons de garanties** (même couverture dans plusieurs contrats)
- les **lacunes** (risques non couverts selon le profil)
- les **économies possibles** (regroupements, changements de formule)

**Algorithme :**

```
INPUT: policies[], profile{}

ÉTAPE 1 — ENRICHISSEMENT RAG
  POUR chaque policy :
    Générer embedding "Garanties contrat {policy.name}"
    Chercher 3 chunks dans policy_embeddings
    → enrichedContext = "{metadata}\n\n📄 Extraits:{chunks}"

ÉTAPE 2 — PROMPT GEMINI (3 axes)
  AXE 1 — DOUBLONS (type: 'duplicate')
    Identifier les guaranties présentes dans ≥2 contrats
    Calculer économie si l'une était supprimée

  AXE 2 — LACUNES (type: 'gap')
    Risques non couverts selon profile (piscine, animaux, sport, télétravail...)
    Proposer contrat spécifique à ajouter ou formule à monter en gamme

  AXE 3 — ÉCONOMIES (type: 'saving')
    Changements de formule avec gain estimé
    Regroupements multi-contrats (remise fidélité)
    Options inutiles à supprimer

ÉTAPE 3 — RÉSULTAT
  OptimizationFinding[] {
    title, description,
    type: 'duplicate' | 'gap' | 'saving',
    severity: 'low' | 'medium' | 'high',
    involvedPolicies: string[],
    estimatedSaving: number,   // en euros / an
    recommendation: string,
    action: 'remove_duplicate' | 'add_contract' | 'change_formula' | ...
  }
```

Minimum 3 findings, maximum 12. Chaque recommendation est **actionnelle et spécifique** (noms des contrats concernés, économie annuelle réaliste).
