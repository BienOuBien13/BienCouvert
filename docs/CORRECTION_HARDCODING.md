# Correction du Hard-coding - Rapport

## Problèmes identifiés

### 1. ❌ Hard-coding corrigé dans storage.ts (lignes 127-133)
**Avant:** Mapping manuel `codeToEnumMap` avec valeurs hardcodées
```typescript
const codeToEnumMap: Record<string, string> = {
  'AUTO': 'Automobile',
  'HOME': 'Habitation', 
  ...
};
const typeEnum = codeToEnumMap[typeCode] || row.type_label || 'Autre';
```

**Après:** Utilisation directe de `label_fr` depuis `insurance_types` via JOIN
```typescript
const typeEnum = row.type_label || 'Autre';
```

**Impact:** ✅ Dynamique - ajout d'un nouveau type d'assurance ne nécessite plus de modification du code, juste un INSERT dans `insurance_types`

---

### 2. ⚠️ Enum PolicyType (types.ts) - CONSERVÉ VOLONTAIREMENT

**Localisation:**
- BackEnd/src/types.ts (lignes 12-22)
- FrontEnd/types.ts (lignes 2-11)

**Contenu:**
```typescript
export enum PolicyType {
  AUTO = 'Automobile',
  HOME = 'Habitation',
  HEALTH = 'Santé/Mutuelle',
  ...
}
```

**Décision:** **CONSERVER** cet enum pour:
1. **Type safety TypeScript** - évite les erreurs de frappe
2. **Compatibilité** - beaucoup de code utilise déjà cet enum
3. **Documentation** - les valeurs correspondent EXACTEMENT aux `label_fr` de la table `insurance_types`

**Note importante:** Les valeurs de l'enum DOIVENT correspondre aux valeurs `label_fr` dans la table `insurance_types`. Si vous ajoutez un nouveau type d'assurance:
1. INSERT dans `insurance_types` avec le `label_fr` correct
2. Optionnel: ajouter la valeur correspondante dans l'enum PolicyType pour le type safety

---

### 3. ✅ Exemples hardcodés dans scripts utilitaires

**Fichiers concernés (grep trouvé 50+ occurrences):**
- `bulk-upload-cg.js` - exemples avec MAAF/MAA01
- `simple-bulk-upload-cg.js` - exemples 
- `test-*.js` - scripts de test avec données d'exemple

**Décision:** **CONSERVER** - Ce sont des **exemples/tests**, pas du code de production

---

## Améliorations apportées

### Assistant RAG - extraction multi-zones

**Problème identifié:**
- CG MAAF fait 224k caractères
- "TIERS ECO" apparaît à la position 66547 (66k dans le document)
- L'extraction ne prenait que 25k max → garanties TIERS ECO jamais extraites

**Solution implémentée (geminiService.ts lignes 447-477):**
1. **Extraction multi-zones** (jusqu'à 3 zones de 15k chacune = 45k total)
2. **Groupement intelligent** des mots-clés proches
3. **Fallback début/milieu/fin** si pas de mots-clés trouvés

```typescript
// Extraire plusieurs zones autour des occurrences de mots-clés
const zones: number[] = [];
allPositions.forEach(pos => {
  const hasNearbyZone = zones.some(z => Math.abs(z - pos) < 10000);
  if (!hasNearbyZone) zones.push(pos);
});

zones.slice(0, maxChunks).forEach(centerPos => {
  const start = Math.max(0, centerPos - 5000);
  const end = Math.min(fullText.length, centerPos + chunkSize);
  extractedChunks.push(fullText.substring(start, end));
});
```

**Résultat attendu:** L'assistant peut maintenant lire le tableau des formules (début du doc) ET les détails des garanties TIERS ECO (milieu du doc)

---

## Tests à effectuer

1. **Test extraction multi-zones:**
   - Ajouter un contrat MAAF AUTO avec formule "TIERS ECO"
   - Demander à l'assistant: "Quelles sont mes garanties auto?"
   - **Résultat attendu:** L'assistant liste les garanties spécifiques à TIERS ECO (Responsabilité civile, Défense, Recours, Assistance personnes, Bris de pare-brise...)

2. **Test dynamic types:**
   - Vérifier que `type_label` vient bien de la DB dans `readPolicies()`
   - Ajouter un nouveau type dans `insurance_types`:
     ```sql
     INSERT INTO insurance_types (code, label_fr, icon_name) 
     VALUES ('ANIMAL', 'Animaux de compagnie', 'pets');
     ```
   - Créer une policy avec `insurance_type_code='ANIMAL'`
   - **Résultat attendu:** Affichage correct du label "Animaux de compagnie" sans modification de code

---

## Architecture recommandée pour l'avenir

### Option 1: Enum avec codes techniques (REFACTORING MAJEUR)
```typescript
export enum PolicyTypeCode {
  AUTO = 'AUTO',
  HOME = 'HOME',
  HEALTH = 'HEALTH'
}

// Labels viennent de la DB via API /masterdata/insurance-types
```

### Option 2: Pas d'enum, tout dynamique (PLUS SIMPLE)
```typescript
// Pas d'enum PolicyType
// Utiliser directement les valeurs string depuis la DB
type: string; // Ex: "Automobile", "Habitation"...
```

**Recommandation:** Option 2 pour un système 100% dynamique

---

## Résumé des fichiers modifiés

1. ✅ `BackEnd/src/storage.ts` - Suppression mapping hardcodé
2. ✅ `BackEnd/src/services/geminiService.ts` - Extraction multi-zones RAG
3. ✅ `CORRECTION_HARDCODING.md` - Cette documentation

**Fichiers NON modifiés (volontairement):**
- `BackEnd/src/types.ts` - Enum conservé pour type safety
- `FrontEnd/types.ts` - Enum conservé pour type safety
- Scripts `test-*.js`, `bulk-*.js` - Exemples/tests

---

## Amélioration des icônes (TODO futur)

### État actuel
- Icônes de lucide-react (Car, Home, Heart, Briefcase, ShieldPlus)
- Taille: w-12 h-12 pour le container, w-6 h-6 pour l'icône
- Localisation: FrontEnd/components/AddPolicyPage.tsx lignes 35-43

### Options d'amélioration

**Option 1: Icônes plus explicites de lucide-react**
```typescript
const TYPE_ICONS: Record<string, any> = {
  AUT: Car,           // OK
  HAB: Home,          // OK  
  SAN: Activity,      // Plus médical que Heart
  PRO: Scale,         // Balance pour juridique
  DEFAULT: ShieldCheck // Plus pro que ShieldPlus
};
```

**Option 2: Icônes custom SVG dans la DB**
- Ajouter champ `icon_url` dans `insurance_types`
- Stocker SVG ou URL d'image dans la DB
- Changer le code pour afficher `<img src={type.icon_url} />`

**Option 3: Mapping vers icon library externe**
- FontAwesome, Heroicons, etc.
- Plus de choix mais dépendance externe

### Recommandation
Option 1 (changement simple) ou Option 2 (100% dynamique, compatible avec l'objectif "pas de hard-coding")

---

## Date: 2025-01-XX
## Auteur: GitHub Copilot + RJOLIVAL
