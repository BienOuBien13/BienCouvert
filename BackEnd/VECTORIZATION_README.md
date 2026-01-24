# Script de vectorisation automatique de PDF

Ce script permet de vectoriser automatiquement des PDF d'assurance dans pgvector.

## Installation des dépendances

```bash
npm install @google/generative-ai
```

## Utilisation

### Méthode 1 : Via URL

```bash
node vectorize-pdf.js "MAIF" "Auto Rythme" "auto" "https://www.maif.fr/cg-auto.pdf"
```

### Méthode 2 : Depuis le code

```javascript
const { vectorizePDF } = require('./vectorize-pdf');

await vectorizePDF(
  "MAIF",           // Assureur
  "Auto Zen",       // Nom du produit
  "auto",          // Type: auto, habitation, sante, pro, autre
  "https://..."    // URL du PDF
);
```

## Ce que fait le script

1. **📄 Extraction du texte** : Télécharge le PDF et extrait tout le contenu textuel via Gemini
2. **🧠 Analyse IA** : Identifie automatiquement les formules et options du contrat
3. **🎯 Vectorisation** : Génère un embedding de 768 dimensions avec `text-embedding-004`
4. **💾 Sauvegarde** : Insère dans PostgreSQL avec pgvector

## Exemples de commandes

```bash
# MAIF Auto
node vectorize-pdf.js "MAIF" "Auto Zen" "auto" "https://www.maif.fr/cg-auto.pdf"

# AXA Habitation
node vectorize-pdf.js "AXA" "Habitation Confort" "habitation" "https://www.axa.fr/cg-hab.pdf"

# Allianz Santé
node vectorize-pdf.js "Allianz" "Santé Premium" "sante" "https://www.allianz.fr/cg-sante.pdf"
```

## Structure des données sauvegardées

```json
{
  "insurer": "MAIF",
  "product_name": "Auto Zen",
  "type": "auto",
  "document_url": "https://...",
  "content_text": "Texte complet du PDF...",
  "embedding": [0.123, 0.456, ...],  // 768 dimensions
  "metadata": {
    "type": "auto",
    "indexedFormulas": ["Tiers", "Intermédiaire", "Tous Risques"],
    "indexedOptions": ["Assistance 0km", "Protection juridique", ...],
    "semanticSummary": "Résumé du contrat..."
  }
}
```

## Vérifier les résultats

```bash
# Voir tous les documents vectorisés
node view-vectorized-db.js

# Ou via l'interface Admin de l'application
http://localhost:3000 -> Bouton Admin
```

## Notes importantes

- Le script utilise l'API Gemini (clé API déjà configurée)
- Les embeddings sont de 768 dimensions
- Le texte est limité à 10000 caractères pour l'embedding
- Les doublons sont automatiquement mis à jour (basé sur assureur + nom produit)
