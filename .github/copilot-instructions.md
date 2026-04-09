# AssurClair — Instructions GitHub Copilot

> Ce fichier est chargé automatiquement par GitHub Copilot à chaque session de code.
> Il décrit l'architecture, le déploiement et la logique fonctionnelle du projet.
>
> **Maintenance** : mettre à jour ce fichier à chaque changement structurel (nouvelle table, route, service, modèle IA, invariant de nommage). Demander à Copilot _"Compare copilot-instructions.md avec le code réel et liste les divergences"_ pour vérifier l'alignement.
>
> **Dernière vérification** : 2026-04-09 — 0 divergence sur 15 fichiers audités.

---

## 1. Vue d'ensemble du projet

**AssurClair** est une application SaaS d'assistance à la gestion d'assurances personnelles. Elle permet à un utilisateur de :
- Stocker et analyser ses polices d'assurance (auto, habitation, santé, etc.)
- Interroger un assistant IA multi-agent sur ses couvertures
- Consulter un catalogue de Conditions Générales (CG) indexées automatiquement

**Repo** : `RemiJolivalt/AssurClair` — branche principale : `main`

---

## 2. Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Node.js 20 + TypeScript + Express 4 |
| Frontend web | React 19 + Vite 6 + TypeScript |
| Frontend mobile | Capacitor 8 (Android / iOS) — dossier `FrontEnd/android`, `FrontEnd/ios` |
| Base de données | PostgreSQL 16 + extension **pgvector** |
| IA | Gemini API via `@google/generative-ai` (modèles : `gemini-2.5-flash`, `gemini-2.0-flash`) |
| Cache | Redis 7 Alpine (fallback gracieux si indisponible — cooldown 5 min) |
| Télémétrie | OpenTelemetry → OTEL Collector → métriques custom |
| Conteneurisation | Docker Compose (backend + frontend + redis + otel-collector) |
| Reverse proxy | Nginx (VM Azure) |

---

## 3. Infrastructure de production

```
VM Azure : 52.143.159.51
  ├── Nginx (ports 80/443) → reverse proxy
  │     ├── /api/*  → localhost:4000 (backend Docker)
  │     └── /*      → /var/www/assurclair/frontend (SPA Vite)
  ├── Docker Compose : /opt/assurclair/docker-compose.yml
  │     ├── assurclair-backend  (port 4000)
  │     ├── assurclair-frontend (port 8080, non exposé directement)
  │     ├── assurclair-redis    (interne)
  │     └── otel-collector      (interne)
  └── PostgreSQL : port 5432, base `assurclair`
```

**Fichier de configuration prod** : `/opt/assurclair/backend.env` (jamais commité)  
**Fichier local** : `BackEnd/.env` (gitignore)

### Variables d'environnement critiques

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Clé Gemini (AI Studio Free — modèles génératifs uniquement, **pas d'embedding**) |
| `JWT_SECRET` | Secret JWT (obligatoire — le serveur refuse de démarrer sans) |
| `CSRF_SECRET` | Secret CSRF (obligatoire) |
| `DATABASE_URL` | Connexion PostgreSQL |
| `FRONTEND_ORIGIN` | CORS — origines autorisées (séparées par virgule) |
| `REDIS_URL` | `redis://redis:6379` (interne Docker) |
| `GOOGLE_CSE_API_KEY` | Clé Google Custom Search (optionnelle — stratégie retirée du flux actif) |
| `GOOGLE_CSE_CX` | ID moteur CSE : `e2df87510bd6f482c` (optionnel) |

### Commandes de déploiement

```bash
# Sur la VM, après git pull
cd /opt/assurclair
docker-compose pull           # si image registry
docker-compose up -d --build  # rebuild + redémarrage
docker-compose restart backend # redémarrage rapide (sans rebuild)

# Logs
docker-compose logs -f backend --tail=100
```

---

## 4. Structure du projet

```
AssurClair/
├── BackEnd/
│   ├── src/
│   │   ├── index.ts              # Point d'entrée Express
│   │   ├── db.ts                 # Pool PostgreSQL (pg)
│   │   ├── storage.ts            # Couche d'accès données (central_cg, policies...)
│   │   ├── types.ts              # Types partagés backend (Policy, User, PolicyType...)
│   │   ├── agents/               # Système multi-agent BMAD
│   │   │   ├── types.ts          # Types agents (AgentIntent, RAGChunk, CoverageFact...)
│   │   │   ├── IntentAgent.ts    # Détection intention (Gemini Flash + mots-clés)
│   │   │   ├── OrchestratorAgent.ts  # Chef d'orchestre
│   │   │   ├── RAGAgent.ts       # Recherche sémantique (pgvector + fallback ILIKE)
│   │   │   ├── AnalysisAgent.ts  # Analyse couverture (coverage_facts + RAG)
│   │   │   ├── AdvisorAgent.ts   # Recommandations personnalisées
│   │   │   ├── ClaimsAgent.ts    # Assistance sinistres
│   │   │   ├── OptimizerAgent.ts # Détection doublons/économies
│   │   │   └── IngestionAgent.ts # Indexation documents utilisateur
│   │   ├── catalogue/            # Pipeline catalogue CG automatique
│   │   │   ├── SmartSearchService.ts       # Recherche URL PDF (4 stratégies)
│   │   │   ├── CatalogueIngestionService.ts # Orchestration jobs catalogue
│   │   │   ├── CatalogueAgent.ts
│   │   │   ├── VersionTrackerAgent.ts
│   │   │   └── WatchdogScheduler.ts
│   │   ├── services/
│   │   │   ├── geminiService.ts          # Client Gemini, resolveCoverageFacts
│   │   │   ├── cgIngestionService.ts     # Pipeline HUNTER→FETCHER→CLASSIFIER→VECTORIZER
│   │   │   ├── pageVectorizationService.ts # Vectorisation page par page (pgvector)
│   │   │   ├── tableExtractionService.ts  # Extraction tableaux → coverage_facts
│   │   │   ├── cacheService.ts            # Redis avec fallback gracieux
│   │   │   └── auditService.ts
│   │   └── routes/
│   │       ├── ai.ts        # POST /api/ai/chat (assistant)
│   │       ├── cg.ts        # /api/cg/** (catalogue CG)
│   │       ├── policies.ts  # /api/policies/**
│   │       ├── auth.ts      # /api/auth/**
│   │       ├── admin.ts     # /api/admin/**
│   │       └── sinistre.ts  # /api/sinistre/**
│   ├── migrations/           # Fichiers SQL de migration numérotés (017→022+)
│   └── schema.sql            # Schéma de référence complet
├── FrontEnd/
│   ├── App.tsx               # Composant racine React
│   ├── components/           # Composants UI
│   ├── services/             # Appels API frontend
│   ├── hooks/                # Hooks React custom
│   └── android/ ios/         # Projets natifs Capacitor
└── docker-compose.yml        # Orchestration production
```

---

## 5. Base de données — Tables principales

### `central_cg` — CG indexées (référentiel central)
```sql
id, insurer_code, insurance_type_code, document_type_code,
url, target_filename, status ('active'|'draft'|'archived'),
content_text, pdf_base64, pdf_file_path,
metadata JSONB,      -- ⚠️ contient indexedFormulas (nom canonique)
embedding vector,    -- pgvector (désactivé — modèles embedding indisponibles avec clé actuelle)
is_indexed, vectorization_status
```

**Champ `metadata.indexedFormulas`** : **nom canonique** pour les formules. Les INSERTs auto-ingestion écrivent aussi `formula_hints` (alias legacy). À la lecture, toujours lire : `metadata?.indexedFormulas || metadata?.formula_hints || metadata?.formules || []`

### `central_cg_pages` — Pages vectorisées (granularité fine)
```sql
id, central_cg_id, page_number,
content_text, layout_text,
embedding vector,  -- pgvector (null si embedding désactivé)
metadata JSONB
```

### `coverage_facts` — Faits structurés extraits des tableaux de garanties
```sql
id, central_cg_id, insurer_code, insurance_type_code,
guarantee_label, guarantee_key,   -- libellé et clé snake_case normalisée
formula_label, formula_key,       -- formule commerciale (ex: "Tous Risques")
coverage_status ('included'|'excluded'|'optional'|'not_applicable'),
coverage_amount TEXT,             -- plafond/montant (ex: "50 000 €")
franchise TEXT,                   -- franchise applicable
coverage_notes TEXT,
source_page_number INT
```

### `document_catalogue` — Matrice assureur × type à ingérer
```sql
id, insurer_code, insurance_type_code, doc_type,
matrix_status ('pending'|'discovered'|'indexed'|'not_found'|'error'),
current_url, discovered_url, current_sha256,
formula_hints TEXT[],   -- formules identifiées par le CLASSIFIER
classifier_result JSONB,
notes TEXT,             -- raison d'échec SmartSearch ou détail
indexed_at, last_checked_at, next_check_at, check_frequency_days,
central_cg_id
```

### `cg_ingestion_jobs` — Traçabilité des jobs d'ingestion
```sql
id, run_id, insurer_code, insurance_type_code,
source_url, pdf_sha256, status, error_message,
pages_count, result_central_cg_id, central_cg_id,
classifier_result JSONB, confidence,
created_at, updated_at, completed_at
```

### `policies` — Polices utilisateurs
```sql
id, user_id, insurer (texte libre), type, policy_number,
premium, coverage, start_date, end_date, status,
metadata JSONB,   -- formula, indexedFormulas, coverageDetail, summary...
central_cg_id,    -- FK vers central_cg (si CG centrale liée)
user_cg_id        -- FK vers user_cg (si CG personnelle uploadée)
```

---

## 6. Architecture multi-agent BMAD

Pipeline d'une question utilisateur dans `/api/ai/chat` :

```
Message utilisateur
        │
        ▼
  IntentAgent.detect()
  ├── Gemini Flash (si dispo) + fallback mots-clés
  └── → AgentIntent: QUESTION_GARANTIE | SINISTRE | OPTIMISATION | CONSEIL | UPLOAD | GENERAL
        │
        ▼
  OrchestratorAgent.process()
        │
        ├── QUESTION_GARANTIE / CONSEIL :
        │   ├── Promise.all([
        │   │     RAGAgent.search()          → chunks textuels (pgvector ou ILIKE fallback)
        │   │     resolveCoverageFacts()     → faits structurés depuis coverage_facts
        │   │   ])
        │   └── AnalysisAgent.analyze()
        │         ├── Source primaire : coverageFacts (buildFactsContext)
        │         └── Source secondaire : ragResult.chunks
        │
        ├── SINISTRE :
        │   └── ClaimsAgent.process()
        │
        ├── OPTIMISATION :
        │   └── OptimizerAgent.analyze()
        │
        └── CONSEIL :
            └── AdvisorAgent.advise()
```

**Intention** → `agents/types.ts`  
**Faits coverage** → `resolveCoverageFacts()` dans `geminiService.ts` (4 niveaux : exact formula_key → LIKE préfixe → toutes formules → table_json fallback)

---

## 7. Pipeline d'ingestion CG

### Ingestion auto (à la demande via catalogue)

```
CatalogueIngestionService.runCatalogueIngestion()
        │
        ├── 1. SmartSearchService.smartSearchForDocument()
        │       Stratégies en cascade :
        │       1b. DuckDuckGo/Google/Bing web search (scraping)
        │       2.  Gemini + Google Search grounding  ← principale stratégie active
        │       3.  Exploration site (sitemap + crawl)
        │       4.  Gemini knowledge (patterns URL connus)
        │       → Résultat persisté dans document_catalogue.discovered_url + notes
        │
        └── 2. ingestDocumentForCatalogue()   (cgIngestionService.ts)
                ├── FETCHER  : télécharge le PDF (HTTP avec SHA256)
                ├── CLASSIFIER : Gemini Vision → insurer_code, type, formula_hints
                ├── INSERT central_cg avec metadata = {
                │     indexedFormulas: [...],   ← NOM CANONIQUE
                │     formula_hints: [...],     ← alias legacy (même valeur)
                │     confidence, ingested_at, source_url
                │   }
                └── VECTORIZER : pageVectorizationService → central_cg_pages + coverage_facts
```

### Embedding (vectorisation)

⚠️ **Les embeddings sont désactivés** avec la clé AI Studio Free (aucun modèle `text-embedding-*` accessible).  
Le flag `_embeddingPermanentlyDisabled` dans `geminiService.ts` empêche les appels répétés.  
**Conséquence** : la recherche RAG utilise le **fallback full-text ILIKE** (`textSearchCentralCg` dans `RAGAgent.ts`).

---

## 8. Règles et invariants — À respecter dans tout code

### Nommage des champs de formules

| Contexte | Champ à utiliser |
|----------|-----------------|
| INSERT `central_cg.metadata` | **`indexedFormulas`** (canonique) + `formula_hints` (legacy alias) |
| Lecture `central_cg.metadata` | `indexedFormulas \|\| formula_hints \|\| formules` |
| INSERT `coverage_facts` | `formula_key` (snake_case normalisé) |
| Normalisation clé | `label.normalize('NFD').replace(accents).replace(/[^a-z0-9]+/g,'_')` |

### Sécurité

- **CSRF** : toutes les routes mutantes (`POST/PUT/PATCH/DELETE`) protégées par `csrf-csrf`  
- **Rate limiting** : 100 req/15min global — **exception** : routes `GET /api/cg/central/` (polling)  
- **Helmet** : activé sur toutes les réponses HTTP  
- **JWT** : httpOnly cookies (pas de localStorage)  
- **Validation** : `express-validator` sur toutes les entrées `/api/auth/**` et `/api/policies/**`  
- Ne jamais logger de données personnelles (email, token JWT, contenu de police)

### TypeScript

- `npm run typecheck` doit passer à **0 erreur** avant tout commit  
- Types partagés backend : `BackEnd/src/types.ts` et `BackEnd/src/agents/types.ts`  
- Jamais de `any` non justifié — utiliser les types définis  
- `ParsedStatus.franchise` est optionnel (`franchise?: string | null`) — cf. `tableExtractionService.ts`

### Gemini / IA

- Modèle utilisé en production : **`gemini-2.5-flash`** (tous agents, classification, SmartSearch)
- Autres modèles accessibles avec la clé actuelle mais non utilisés activement : `gemini-2.5-pro`, `gemini-2.0-flash*`, `gemini-2.5-flash-lite`
- **Pas de modèle embedding** — ne pas appeler `generateEmbedding()` sans vérifier `_embeddingPermanentlyDisabled`  
- Toujours vérifier `getAiClient() !== null` avant tout appel Gemini  
- Désactivation permanente après premier 404 (distincter 404 permanent vs 429 transitoire)

### Cache Redis

- Fallback gracieux — si Redis indisponible, les features fonctionnent sans cache  
- Cooldown 5 min après premier échec (un seul log d'erreur par période)  
- TTL par défaut : 1800 s (30 min)

### Base de données

- Utiliser `query()` depuis `BackEnd/src/db.ts` pour toutes les requêtes  
- Toujours paramétrer les requêtes (`$1`, `$2`...) — jamais de concaténation SQL  
- Migrations numérotées séquentiellement : `BackEnd/migrations/NNN_description.sql`

---

## 9. Logs de monitoring à surveiller (post-déploiement)

```
✅ Attendus (une seule fois) :
  ❌ Embedding désactivé définitivement — modèles non accessibles avec cette clé API
  ⚠️  Redis indisponible (cache désactivé 5 min): ...

✅ Attendus (chaque question) :
  [Orchestrator] X faits structurés chargés depuis coverage_facts
  [RAGAgent] Y chunks trouvés (0 polices + Y CG)

❌ Problèmes à corriger :
  [RAGAgent] 0 chunks trouvés  → vérifier que la CG est bien ingérée et indexée
  [Orchestrator] 0 faits structurés → vérifier coverage_facts pour la police testée
```

---

## 10. Commandes de développement

```bash
# Backend
cd BackEnd
npm run dev          # ts-node avec hot reload (nodemon)
npm run typecheck    # vérification TypeScript (doit être clean avant commit)
npm run build        # compilation vers dist/
npm test             # jest

# Frontend
cd FrontEnd
npm run dev          # Vite dev server
npm run build        # build production (inclut typecheck)
npm run typecheck    # vérification TypeScript seule

# Mobile
npm run cap:android  # build + sync + ouvrir Android Studio
npm run cap:ios      # build + sync + ouvrir Xcode
```

---

## 11. Points d'attention spécifiques

- **`pdf_base64`** dans `central_cg` : stockage du PDF brut en base64 — colonnes volumineuses, ne jamais fetcher en masse
- **`content_text`** dans `central_cg` : texte plat du PDF entier — utiliser `central_cg_pages` pour la recherche granulaire
- **`resolveCoverageFacts`** dans `geminiService.ts` : requête 4 niveaux avec fallback — toujours appelée en `Promise.all` avec le RAGAgent pour QUESTION_GARANTIE/CONSEIL
- **SmartSearchService** : la stratégie Google CSE (stratégie 1) est retirée du flux actif mais le code reste présent — ne pas la réactiver sans reconfigurer la clé
- **`document_catalogue.formula_hints`** : tableau PostgreSQL natif (`TEXT[]`), distinct de `central_cg.metadata.indexedFormulas` qui est JSONB

---

## 12. Maintenance de ce fichier

Ce fichier doit être mis à jour **manuellement** dans les cas suivants :

| Déclencheur | Section à mettre à jour |
|-------------|------------------------|
| Nouvelle table SQL | §5 Base de données |
| Nouvelle route Express | §4 Structure |
| Nouveau service ou agent | §4 Structure + §6 ou §7 |
| Changement de modèle Gemini | §8 Gemini/IA |
| Modification des invariants metadata | §8 Nommage des champs |
| Changement d'infra / déploiement | §3 Infrastructure |
| Nouvelle migration | §4 Structure (numéro) |
| Modification des règles sécurité | §8 Sécurité |

> Pour vérifier l'alignement après un refactoring, demander à Copilot :
> _"Compare ce fichier copilot-instructions.md avec le code réel et liste les divergences"_
