# 📚 Ingestion automatique des Conditions Générales — Guide non-technique

> **Pour qui ?** Ce document explique en langage clair, sans jargon informatique, comment fonctionne le nouveau système qui alimente automatiquement la base de connaissance d'AssurClair avec les Conditions Générales (CG) des assureurs.

---

## 🎯 Le problème qu'on résout

Jusqu'ici, pour ajouter les conditions générales d'un contrat d'assurance dans AssurClair, il fallait :
1. Aller sur le site de l'assureur à la main
2. Trouver le bon PDF
3. Le télécharger
4. L'uploader dans l'interface admin
5. Attendre que le système l'analyse et le mémorise

C'était long, répétitif, et pas scalable dès qu'on veut couvrir des dizaines d'assureurs × des dizaines de types d'assurance.

**La solution :** un système automatique qui fait tout ça tout seul, à la demande.

---

## 🤖 Comment ça marche concrètement — la chaîne des 4 agents

Le système fonctionne comme une **chaîne de travail à 4 étapes**, chacune confiée à un "agent" (un morceau de programme qui a une mission précise).

```
HUNTER → FETCHER → CLASSIFIER → VECTORIZER
```

### 1. 🔍 HUNTER — Le chercheur de liens

**Ce qu'il fait :** Il visite le site web d'un assureur et cherche les pages qui contiennent des PDF de Conditions Générales.

**Comment :** Il inspecte le plan du site (fichier `sitemap.xml`), la page d'accueil, et les URLs que vous lui avez indiquées manuellement. Il respecte les règles de confidentialité du site (`robots.txt`).

**Ce qu'il produit :** Une liste d'URLs de pages à visiter.

---

### 2. 📥 FETCHER — Le téléchargeur

**Ce qu'il fait :** Pour chaque URL trouvée par le HUNTER, il télécharge le fichier PDF.

**Sécurités intégrées :**
- Il vérifie que le fichier est bien un PDF (et pas un fichier corrompu)
- Il calcule une "empreinte" unique du fichier (SHA-256) pour éviter de télécharger deux fois le même document
- Il abandonne au bout de 30 secondes si le téléchargement est trop lent

**Ce qu'il produit :** Le contenu du PDF prêt à être analysé.

---

### 3. 🧠 CLASSIFIER — L'identificateur intelligent

**Ce qu'il fait :** Il envoie les premières pages du PDF à l'intelligence artificielle Gemini (de Google) et lui pose la question : *"C'est quoi ce document ? C'est les CG de quel assureur, pour quel type d'assurance ?"*

**Ce qu'il produit :**
- Le nom de l'assureur identifié
- Le type d'assurance (Habitation, Auto, Santé…)
- Un score de **confiance** entre 0 et 1 (ex : 0.85 = l'IA est sûre à 85%)
- Un signal "oui/non" : est-ce bien un document de CG ?

**Filtre qualité :** Si le score de confiance est trop bas (en dessous du seuil que vous configurez), le document est ignoré.

---

### 4. 📖 VECTORIZER — Le mémorisateur

**Ce qu'il fait :** Il découpe le PDF page par page, transforme chaque page en une représentation numérique (appelée "vecteur") que l'IA peut comprendre et rechercher.

**Pourquoi c'est important :** C'est cette étape qui rend le document "interrogeable" dans AssurClair. Sans elle, le PDF n'est qu'un fichier inerte.

**Ce qu'il produit :** Les informations du document sont stockées dans la base de connaissance et deviennent immédiatement disponibles pour répondre aux questions des utilisateurs.

---

## 🎛️ L'interface d'administration — onglet "Ingestion auto"

Dans l'interface web d'AssurClair, les administrateurs accèdent au panneau via **Admin → Ingestion auto**.

### Ce qu'on peut y faire :

#### 1. Définir le périmètre de recherche
On coche les assureurs et types d'assurance qu'on veut traiter. Par exemple :
- ✅ AXA + ✅ Allianz + ✅ Macif
- ✅ Habitation + ✅ Auto

Le système ne cherchera que des CG correspondant à ces combinaisons.

#### 2. Configurer les paramètres
- **Documents max par combinaison :** Limiter à 2 docs par assureur×type pour ne pas surcharger (évite d'ingérer 50 versions d'un même contrat)
- **Seuil de confiance :** Ex: 0.70 = n'accepter que les documents identifiés avec 70% de certitude minimum

#### 3. Configurer les patterns par assureur ⚙️
Pour chaque assureur, on peut indiquer :
- **Pages CG à crawler :** Les URLs exactes où l'assureur publie ses CG (`https://www.axa.fr/conditions-generales`)
- **Patterns URL PDF :** Des modèles pour reconnaître les liens vers des CG (`/cg-`, `/conditions-generales`)
- **Patterns à exclure :** Des modèles pour ignorer certains liens (`/newsletter`, `/presse`)

#### 4. Lancer / Arrêter
- **Bouton "Lancer l'ingestion"** → démarre la chaîne en arrière-plan. Vous pouvez fermer la page, le traitement continue
- **Barre de progression** → indique combien de documents ont été traités en temps réel
- **Bouton "Arrêter"** → stoppe proprement le traitement après le document en cours

#### 5. Consulter l'historique
Un tableau liste tous les lancements passés, avec pour chaque document :
- Son statut (✅ intégré / ⏭ ignoré / ❌ erreur)
- L'assureur et le type d'assurance identifiés
- Le score de confiance
- Le nombre de pages
- L'URL source

---

## 🔄 Schéma simplifié du flux complet

```
Admin déclenche
      ↓
  HUNTER cherche les liens sur axa.fr, allianz.fr...
      ↓
  FETCHER télécharge les PDFs trouvés
      ↓
  CLASSIFIER : "C'est quoi ce doc ?" → Gemini AI
      ↓  (si confiance > seuil)
  VECTORIZER : découpe + mémorise page par page
      ↓
  ✅ Document disponible dans AssurClair
```

---

## 🛡️ Sécurités et garanties

| Risque | Protection en place |
|---|---|
| Télécharger 2× le même document | Empreinte SHA-256 : doublon détecté et ignoré automatiquement |
| Surcharger le site de l'assureur | Pauses automatiques entre chaque requête (rate limiting) |
| Intégrer un mauvais document | Score de confiance IA + filtre sur le type de fichier |
| Surcharger l'IA de Google | Délais respectés entre chaque appel Gemini |
| Le traitement plante en cours | Chaque document est tracé individuellement, la reprise est possible |

---

## 📊 Ce qui est enregistré en base de données

Pour chaque tentative (réussie ou non), le système garde une trace complète :
- L'identifiant du lancement (run ID)
- L'assureur + type ciblé
- L'URL du document
- Le statut final
- Le score de confiance
- L'éventuel message d'erreur
- Le nombre de pages
- L'heure de début et de fin

Cela permet d'**auditer**, **rejouer**, et **comprendre** ce qui s'est passé.

---

*Document technique associé : `BackEnd/src/services/cgIngestionService.ts`, `BackEnd/migrations/022_cg_ingestion.sql`*
