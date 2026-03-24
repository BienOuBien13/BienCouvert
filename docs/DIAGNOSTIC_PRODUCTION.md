# Diagnostic Technique & Fonctionnel — Production
> AssurClair / BienCouvert — VM Azure `52.143.159.51` — `biencouvert.fr`
> Mis à jour le 24 mars 2026

---

## Résumé exécutif

Le code est **fonctionnellement complet et déployé**. L'infrastructure HTTPS, DNS, secrets et CI/CD est en place. Il reste **un seul point de sécurité ouvert** (port PostgreSQL) et les crédentials qui étaient dans git ont été purgés.

---

## 1. État des composants (au 24/03/2026)

| Composant | État | Note |
|---|---|---|
| Backend Node.js/Express | ✅ Opérationnel | TypeScript compile propre |
| Frontend React/Vite | ✅ Opérationnel | Build Vite OK |
| Application mobile Android (Capacitor) | ✅ Buildée | APK Android produit |
| PostgreSQL + pgvector | ✅ Opérationnel | VM 52.143.159.51 |
| Redis cache | ✅ Opérationnel | Docker Compose |
| Gemini AI (Vision + Embeddings + Chat) | ✅ Intégré | Clé API présente |
| CI/CD GitHub Actions | ✅ Opérationnel | Secrets configurés |
| HTTPS / TLS | ✅ Actif | Certbot configuré |
| Nginx reverse proxy | ✅ Configuré | `nginx-azure.conf` en prod |
| Domaine `biencouvert.fr` | ✅ Résolu | DNS pointé sur VM |
| Suppression de compte | ✅ Implémenté | `DELETE /api/auth/account` |
| Politique de confidentialité | ✅ Présente | Composant `PrivacyPolicy` + `/politique-confidentialite` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | ✅ Supprimé | Retiré de `index.ts` |
| `BackEnd/.env.production` dans git | ✅ Purgé | Supprimé du dépôt, `.gitignore` mis à jour |
| Proxy nginx `host.docker.internal` | ✅ Corrigé | Remplacé par `http://backend:4000` |

---

## 2. Point de sécurité restant (🟡 important)

### Port 5432 PostgreSQL potentiellement exposé

Si le firewall Azure (NSG) autorise le port 5432 depuis Internet, la base de données est accessible directement depuis l'extérieur.

**Vérification :** dans le portail Azure → Network Security Group de la VM → règles entrantes.

**Action :** s'assurer qu'**aucune règle n'autorise le port 5432** depuis Internet (`0.0.0.0/0`). L'accès doit être limité à `localhost` ou à une plage IP privée. Si nécessaire pour l'administration, utiliser un tunnel SSH :
```bash
ssh -L 5432:localhost:5432 VMRemi19821982@52.143.159.51
```

---

## 3. Configuration VM — référence

Le backend lit ses variables depuis `/opt/assurclair/BackEnd/.env` (jamais commité).

**Variables requises** (vérifier leur présence) :
```env
NODE_ENV=production
PORT=4000
JWT_SECRET=<forte clé hex>
CSRF_SECRET=<forte clé hex>
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=assurclair
POSTGRES_USER=remijolivalt
POSTGRES_PASSWORD=<mot de passe fort>
DATABASE_URL=postgresql://remijolivalt:<password>@localhost:5432/assurclair
GEMINI_API_KEY=<clé Gemini valide>
SMTP_HOST=smtp.zoho.eu
SMTP_PORT=465
SMTP_USER=contact@biencouvert.fr
SMTP_PASSWORD=<mot de passe Zoho>
FRONTEND_ORIGIN=https://biencouvert.fr,https://www.biencouvert.fr,capacitor://localhost
```

> Le `docker-compose.yml` lit uniquement `./BackEnd/.env` — plus de référence à `.env.production`.

---

## 4. Focus fonctionnel — parcours utilisateur complet

### 4.1 Inscription et authentification

| Étape | Endpoint | Statut |
|---|---|---|
| Inscription | `POST /api/auth/register` | ✅ |
| Vérification email | `POST /api/auth/verify-email` | ✅ |
| Connexion | `POST /api/auth/login` → JWT 7j | ✅ |
| Réinitialisation mot de passe | `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` | ✅ |
| Profil utilisateur | `GET/PUT /api/auth/me` | ✅ |
| Suppression de compte | `DELETE /api/auth/account` | ✅ — données + polices supprimées en cascade |

**Sécurité :** bcrypt (mots de passe), JWT signé, rate limit 5 tentatives/15 min sur login, CSRF double-submit cookie, Helmet headers.

---

### 4.2 Gestion des contrats

| Fonctionnalité | Endpoint | Statut |
|---|---|---|
| Lister les polices | `GET /api/policies` | ✅ |
| Ajouter une police manuellement | `POST /api/policies` | ✅ |
| Modifier / supprimer | `PUT/DELETE /api/policies/:id` | ✅ |
| Upload PDF (conditions particulières) | `POST /api/policies/upload` | ✅ → Azure Blob Storage |
| Upload CG admin (vectorisation) | `POST /api/policies/upload-cg` | ✅ → `vectorizeCgByPages()` |
| Arrêt vectorisation | `POST /api/policies/stop-vectorization/:cgId` | ✅ |

---

### 4.3 Upload CG utilisateur

| Fonctionnalité | Endpoint | Statut |
|---|---|---|
| Upload CG utilisateur | `POST /api/cg/user/upload` | ✅ → `user_cg` + `user_coverage_facts` |
| Promotion vers central | `POST /api/cg/user/promote-to-central/:userCgId` | ✅ |
| Partage avec consentement | Checkbox dans `AddPolicyPage` | ✅ |

---

### 4.4 Assistant IA

| Fonctionnalité | Endpoint | Statut |
|---|---|---|
| Chat (réponse complète) | `POST /api/ai/chat` | ✅ — cache Redis 30 min |
| Chat streaming (SSE) | `POST /api/ai/chat/stream` | ✅ |
| Détail de garanties | `POST /api/ai/coverage-details` | ✅ — RAG + Gemini JSON |
| Détection doublons / optimisation | `POST /api/ai/detect-duplicates` | ✅ — 3 axes : doublons, lacunes, économies |
| Extraction contrats depuis texte | `POST /api/ai/parse-text` | ✅ |
| Recherche infos assureur | `POST /api/ai/search-policy` | ✅ |
| Génération rapport partageable | `POST /api/ai/generate-report` | ✅ |
| Indexation CG via URL | `POST /api/ai/index-cg` | ✅ |

**Contexte RAG assemblé pour le chat :**
1. Rechargement policies depuis DB (metadata complets)
2. Cache Redis (hit → réponse immédiate)
3. Embedding de la question → recherche dans `policy_embeddings` (5 chunks)
4. Résolution CG liées (par `centralCgId` direct → fallback `insurerCode+typeCode` → `insurerCode` seul)
5. Recherche cosinus dans `central_cg` + `user_cg` (top 5)
6. `coverage_facts` structurés (tableau garantie × formule) — source prioritaire
7. Pages CG ciblées par domaine de garantie (9 domaines : BRIS_GLACE, VOL, RC, etc.)
8. Extraction intelligente du texte CG par zones de mots-clés (5 zones × 20k chars max)

---

### 4.5 Pipelines d'ingestion PDF

| Pipeline | Déclencheur | Tables cibles | Statut |
|---|---|---|---|
| Bulk | `node bulk-upload-with-pages.mjs` | `central_cg` + `central_cg_pages` + `coverage_facts` | ✅ |
| Admin | `POST /api/policies/upload-cg` | idem | ✅ |
| Utilisateur | `POST /api/cg/user/upload` | `user_cg` + `user_cg_pages` + `user_coverage_facts` | ✅ |

**Par page :** extraction texte (pdfjs) → embedding (Gemini, throttle 1200ms) → détection tableau (heuristique) → Vision Gemini (throttle 500ms) → `coverage_facts` (ON CONFLICT merge).

---

### 4.6 Fonctionnalités légales et RGPD

| Fonctionnalité | Emplacement | Statut |
|---|---|---|
| Politique de confidentialité | Composant `PrivacyPolicy` + route `/politique-confidentialite` | ✅ |
| CGU | Composant `TermsOfService` | ✅ |
| Consentement Gemini AI à l'inscription | Checkbox `gemini_ai_consent` dans `users` | ✅ |
| Acceptance CGU obligatoire | Validation dans `AuthScreen` | ✅ |
| Droit à l'effacement (suppression compte) | `DELETE /api/auth/account` | ✅ — cascade polices + user |
| Audit logs | `auditService` — table dédiée | ✅ |

---

### 4.7 Fonctionnalités mobiles (Capacitor)

| Fonctionnalité | Statut |
|---|---|
| APK Android buildé | ✅ |
| Splash screen + status bar | ✅ (`@capacitor/splash-screen`) |
| Navigation SPA dans WebView | ✅ |
| Upload PDF depuis mobile | ✅ |
| Appels API HTTPS `biencouvert.fr` | ✅ — `capacitor://localhost` dans CORS allowlist |

---

## 5. Récapitulatif des corrections appliquées (cette session)

| Correction | Fichiers modifiés |
|---|---|
| `NODE_TLS_REJECT_UNAUTHORIZED` supprimé | `BackEnd/src/index.ts` |
| `BackEnd/.env.production` supprimé du dépôt | `git rm` + `.gitignore` |
| `docker-compose.yml` : suppression référence `.env.production` | `docker-compose.yml` |
| `Dockerfile` : suppression `COPY .env.production` | `BackEnd/Dockerfile` |
| Nginx proxy `host.docker.internal` → `backend:4000` | `FrontEnd/default.conf` |
| CI/CD deploy : chemin unifié sur `/opt/assurclair` | `.github/workflows/ci.yml` |

---

## 6. Action restante unique

```
🟡 Port 5432 PostgreSQL → vérifier dans Azure NSG que ce port
   n'est PAS ouvert vers Internet (0.0.0.0/0).
```

Toutes les autres vérifications sont résolues.
