# 🚀 Pistes d'optimisation — Pipeline d'ingestion automatique des CG

> **Version actuelle :** v1.0 (commit 213ffc6, 04/04/2026)
> **Lectorat :** Développeurs et tech leads

---

## Vision générale

La v1 est un MVP fonctionnel séquentiel avec 4 agents. Les axes d'amélioration se regroupent en 5 grandes familles : **performance**, **robustesse**, **qualité de classification**, **observabilité**, et **automatisation**.

---

## 1. Performance & scalabilité

### 1.1 Parallélisation des agents (impact : ★★★★☆)
**Problème actuel :** Le pipeline traite les combinaisons assureur×type de façon strictement séquentielle. 20 assureurs × 10 types = 200 combos traités les uns après les autres.

**Solution :** Introduire un worker pool avec concurrence limitée.
```typescript
// Au lieu de :
for (const combo of combos) { await processCombo(combo); }

// Traiter N combos en parallèle avec p-limit :
import pLimit from 'p-limit';
const limit = pLimit(5); // 5 combos en parallèle
await Promise.all(combos.map(c => limit(() => processCombo(c))));
```
**Gain estimé :** Réduction du temps de traitement par un facteur 4-5× sans risque de ban.

### 1.2 Queue persistante avec Bull/BullMQ (impact : ★★★★★)
**Problème actuel :** Le run est in-memory (`currentRunId` singleton). Un redémarrage du serveur tue le job en cours sans reprise possible.

**Solution :** Remplacer l'orchestrateur par une queue Redis (BullMQ). Chaque job `(insurer_code, insurance_type_code, url)` devient un item de queue indépendant avec retry automatique.
- Reprise après crash
- Priorité configurable
- Dashboard natif (Bull Board)
- Scalabilité horizontale (plusieurs workers)

### 1.3 Streaming du PDF au lieu du chargement complet en mémoire (impact : ★★★☆☆)
**Problème actuel :** `agentFetcher` charge le PDF entier en mémoire avant traitement. Un PDF de 50MB charge 50MB de RAM par job.

**Solution :** Streamer vers un fichier temporaire sur disque, lire les pages à la volée avec `pdf-parse` ou `pdfjs-dist`, supprimer le fichier après vectorisation.

---

## 2. Robustesse & fiabilité

### 2.1 Retry exponentiel avec circuit breaker (impact : ★★★★☆)
**Problème actuel :** Une erreur réseau ou HTTP 429 (rate-limit) sur un assureur abandonne le document sans retry.

**Solution :**
```typescript
// Decorator retry avec backoff exponentiel
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt === maxAttempts) throw e;
      await sleep(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }
}
```
Un **circuit breaker** par domaine (ex: si axa.fr retourne 3 erreurs consécutives, le mettre en pause 30 minutes).

### 2.2 Gestion des redirections en chaîne et des CAPTCHAs (impact : ★★★☆☆)
**Problème actuel :** Le FETCHER gère 1 niveau de redirect HTTP 301/302 mais pas les redirections JavaScript ni les pages protégées par Cloudflare/CAPTCHA.

**Solution :** Intégrer un headless browser Playwright pour les URLs qui retournent du JS au lieu d'HTML (`const { chromium } = require('playwright')`) uniquement en fallback si la stratégie HTTP échoue.

### 2.3 Validation de la migration DB avant démarrage (impact : ★★★☆☆)
**Problème actuel :** Si la migration `022_cg_ingestion.sql` n'a pas été jouée en production, le service crashe avec une erreur SQL peu informative.

**Solution :** Ajouter une vérification au démarrage du service :
```typescript
const tableExists = await pool.query(`SELECT 1 FROM cg_ingestion_jobs LIMIT 1`);
if (!tableExists) throw new Error('Migration 022 non appliquée – run: psql < migrations/022_cg_ingestion.sql');
```

### 2.4 Un seul run actif par singleton (impact : ★★☆☆☆)
**Problème actuel :** `currentRunId` est une variable Node.js globale. En mode cluster (plusieurs instances), deux runs peuvent démarrer simultanément.

**Solution :** Remplacer par un verrou distribué en base :
```sql
-- Table run_lock avec expiry
INSERT INTO cg_run_lock (locked_at, expires_at) VALUES (NOW(), NOW() + INTERVAL '2 hours')
ON CONFLICT DO NOTHING RETURNING 1;
```

---

## 3. Qualité de classification

### 3.1 Extraction de texte natif avant Gemini Vision (impact : ★★★★☆)
**Problème actuel :** Le CLASSIFIER envoie le PDF binaire à Gemini en encoding base64. Gemini fait de l'OCR sur les images du PDF, ce qui est coûteux en tokens et moins précis qu'un PDF natif textuel.

**Solution :** Extraire le texte des premières pages avec `pdf-parse` avant d'appeler Gemini. Si la couverture OCR < 80% (texte vide), repasser en mode Vision.
```typescript
import pdfParse from 'pdf-parse';
const { text } = await pdfParse(buffer.slice(0, 200_000));
if (text.length > 500) {
  // Mode texte natif (moins de tokens, plus rapide, moins cher)
} else {
  // Fallback mode Vision
}
```
**Gain :** ~70% de réduction de coût Gemini sur les PDF nativement textuels (majorité des CG).

### 3.2 Fine-tuning du prompt Classifier avec few-shot (impact : ★★★☆☆)
**Problème actuel :** Le prompt est générique. Gemini peut confondre une notice IPID avec une CG complète.

**Solution :** Ajouter des exemples concrets dans le prompt (few-shot learning) :
```
EXEMPLE : "Conditions Générales Habitation - Formule Sérénité - AXA" → {"insurer_code":"AXA","insurance_type_code":"HABITATION","document_type":"CG","confidence":0.95,"is_cg":true}
CONTRE-EXEMPLE : "Fiche d'information et de conseil" → {"document_type":"notice","is_cg":false,"confidence":0.90}
```

### 3.3 Vérification croisée CLASSIFIER vs URL (impact : ★★★☆☆)
**Problème actuel :** Si Gemini identifie AXA dans un PDF trouvé sur le site d'Allianz, le résultat est incohérent et enregistré quand même.

**Solution :** Ajouter un score de cohérence : si `classifier.insurer_code` ≠ `hint_insurer` ET confiance < 0.85, mettre en `status = 'review'` plutôt que d'accepter directement.

### 3.4 Ré-ingestion sélective sur mise à jour détectée (impact : ★★★★☆)
**Problème actuel :** La déduplication basée sur SHA-256 empêche de ré-ingérer un document modifié (la même URL peut pointer vers un nouveau PDF).

**Solution :** Stocker l'ETag et Last-Modified HTTP. Si l'en-tête a changé, forcer la ré-ingestion même si le SHA-256 est dans la base.

---

## 4. Observabilité & monitoring

### 4.1 Logs structurés avec corrélation run_id (impact : ★★★★☆)
**Problème actuel :** Les logs sont des `console.log` non structurés. Difficile à interroger en production.

**Solution :** Intégrer Pino (déjà dans le projet) avec le run_id comme contexte :
```typescript
const log = logger.child({ service: 'cgIngestion', run_id: runId });
log.info({ insurer: 'AXA', url, status: 'fetching' }, 'Téléchargement PDF');
```
Compatible avec le collecteur OpenTelemetry déjà configuré (`otel-collector-config.yaml`).

### 4.2 Métriques Prometheus pour le pipeline (impact : ★★★☆☆)
Ajouter des métriques métier :
- `cg_ingestion_docs_total{status, insurer}` — compteur de documents traités
- `cg_ingestion_duration_seconds{agent}` — durée par agent
- `cg_classifier_confidence_histogram` — distribution des scores de confiance

### 4.3 Alertes sur taux d'erreur élevé (impact : ★★★☆☆)
Si le taux d'erreur d'un run dépasse 40%, envoyer une alerte (email admin ou webhook) avec le résumé des erreurs.

### 4.4 Diff visuel entre deux versions d'une même CG (impact : ★★★☆☆)
Quand une CG est ré-ingérée (SHA-256 différent, même assureur+type), afficher un diff des changements de couverture dans l'interface admin.

---

## 5. Automatisation & planification

### 5.1 Cron de ré-ingestion mensuelle automatique (impact : ★★★★★)
**Problème actuel :** Le pipeline se lance uniquement à la demande manuelle d'un admin.

**Solution :** Ajouter un job cron (node-cron ou pg-boss) :
```typescript
// Tous les 1ers du mois à 2h du matin
cron.schedule('0 2 1 * *', () => {
  runIngestion({ scope: 'all_active', max_docs_per_combo: 3, confidence_threshold: 0.75 });
});
```
**Valeur business :** La base de connaissance se met à jour sans intervention humaine.

### 5.2 Webhook "nouvelle CG disponible" (impact : ★★★☆☆)
Après chaque document correctement ingéré, publier un event sur un webhook configurable. Permettrait d'intégrer des outils tiers (Slack, Teams, Zapier).

### 5.3 API publique d'ingestion avec callback (impact : ★★☆☆☆)
Permettre aux partenaires assureurs de notifier directement AssurClair quand ils publient une nouvelle CG (`POST /api/webhook/new-cg { insurer_code, pdf_url }`).

---

## Synthèse priorisée

| Priorité | Optimisation | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | BullMQ queue persistante | 3j | Robustesse critique |
| 🔴 P0 | Cron mensuel automatique | 0.5j | Valeur business immédiate |
| 🟠 P1 | Parallélisation (p-limit) | 1j | Performance ×5 |
| 🟠 P1 | Extraction texte natif PDF | 1j | Coût API -70% |
| 🟡 P2 | Retry + circuit breaker | 1j | Robustesse réseau |
| 🟡 P2 | Few-shot prompt classifier | 0.5j | Qualité classification |
| 🟡 P2 | Logs structurés + run_id | 1j | Observabilité prod |
| 🟢 P3 | ETag dédup intelligent | 1j | Fraîcheur des données |
| 🟢 P3 | Playwright fallback | 2j | Couverture assureurs |
| 🟢 P3 | Diffing versions CG | 3j | UX admin |

---

## Estimation pour une v2 complète

- **P0 + P1** : ~6 jours développement → livrable MVP robuste et scalable
- **P0 + P1 + P2** : ~10 jours → pipeline production-grade
- **Tout le backlog** : ~20 jours → plateforme de veille assurancielle complète

---

*Référence code : `BackEnd/src/services/cgIngestionService.ts` (v1, ~430 lignes)*
