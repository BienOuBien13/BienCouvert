# Guide de Vectorisation Sans Hallucination

## 🎯 Objectif
Extraire **UNIQUEMENT** les informations réelles des Conditions Générales d'assurance, **sans invention** ni hallucination.

## ⚠️ Règles Strictes

### 1. Extraction du Texte
- Le PDF est converti en texte brut via Gemini
- **Aucune modification** du contenu original
- Conservation de la structure complète du document

### 2. Analyse des Formules et Options
Le script recherche dans le document :

**Formules** (niveaux de garantie) :
- Sections "Nos formules"
- "Niveaux de garantie"
- Tableaux comparatifs
- **Utilise les noms EXACTS** du document

**Options** (garanties optionnelles) :
- Sections "Options"
- "Garanties optionnelles" 
- "Extensions de garantie"
- **Utilise les noms EXACTS** du document

### 3. Validation Anti-Hallucination

Le script détecte automatiquement les noms génériques suspects :
- ❌ "Formule 1", "Formule 2"
- ❌ "Option 1", "Option 2"
- ❌ "Formule de base", "Formule intermédiaire"

Si détectés → **⚠️ ALERTE** affichée dans les logs

## 📋 Utilisation

```bash
node vectorize-pdf.js "<ASSUREUR>" "<NOM_PRODUIT>" "<TYPE>" "<URL_PDF>"
```

**Exemple :**
```bash
node vectorize-pdf.js "MAIF" "Auto RAQVAM" "auto" "https://www.maif.fr/.../conditionsGeneralesRAQVAM.pdf"
```

## ✅ Vérification Post-Vectorisation

Après vectorisation, vérifiez TOUJOURS :

1. **Consultez la base** :
   ```bash
   node view-vectorized-db.js
   ```

2. **Vérifiez les formules/options extraites** :
   - Comparez avec le PDF original
   - Les noms doivent être identiques au document
   - Pas de formules "génériques" type "Formule 1"

3. **Si doute** :
   - ❌ Supprimez l'entrée de la base
   - 🔄 Relancez la vectorisation
   - ✋ Ou indexez manuellement via l'interface admin

## 🔍 Logs à Surveiller

✅ **Bon résultat** :
```
✅ Analyse terminée:
   - 3 formules identifiées
     Formules: RAQVAM Tiers, RAQVAM Tous Risques, RAQVAM Premium
   - 5 options identifiées
     Options: Assistance 0km, Bris de glace, Protection juridique, ...
```

⚠️ **Résultat suspect** :
```
⚠️  ATTENTION: Des noms génériques détectés - possible hallucination !
   Vérifiez manuellement les résultats avant utilisation.
```

## 🛡️ Principes Clés

1. **Confiance = 100%** → Inclure
2. **Confiance < 100%** → NE PAS inclure
3. **Doute** → Retourner tableau vide `[]`
4. **Mieux vaut incomplet que faux**

## 🔧 Dépannage

**Problème** : Formules/options vides après vectorisation
- ✅ **Normal** si le document n'a pas de section claire
- 🔍 Vérifiez manuellement le PDF
- 💡 Complétez via interface admin

**Problème** : Noms génériques détectés
- ❌ Le modèle a inventé des noms
- 🔄 Relancez avec un PDF plus structuré
- ✋ Ou saisie manuelle recommandée

## 📊 Base de Données

Table : `central_cg`
- `indexedFormulas` : tableau des formules EXACTES
- `indexedOptions` : tableau des options EXACTES
- `semanticSummary` : résumé factuel (pas de fiction)

**Requête de vérification** :
```sql
SELECT insurer, product_name, 
       metadata->>'indexedFormulas' as formules,
       metadata->>'indexedOptions' as options
FROM central_cg 
WHERE insurer = 'MAIF';
```
