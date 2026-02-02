# Correction - L'assistant ne lit pas les CG

## Problème identifié

L'utilisateur rapporte que l'assistant répond :
> "Cependant, les documents fournis ne contiennent pas les détails des clauses spécifiques de ce contrat. Je ne peux donc pas citer les clauses exactes concernant la prise en charge d'une panne ou l'assistance en cas de panne."

## Causes racines

### 1. Incompatibilité de noms de champs entre Frontend et Backend

**Frontend (`types.ts`):**
```typescript
export interface Policy {
  insurer: string;  // ← Nom du champ
  ...
}
```

**Backend (`types.ts`):**
```typescript
export interface Policy {
  provider: string;  // ← Nom différent !
  ...
}
```

**Impact:** Dans `geminiService.ts` ligne 341, le code faisait :
```typescript
const insurers = policies.map(p => p.provider);
```

Quand le frontend envoie des policies avec le champ `insurer`, `p.provider` est `undefined`, donc la recherche dans `central_cg` retournait 0 résultats.

### 2. Manque de logs détaillés

L'ancien code ne loggait pas :
- Les assureurs recherchés
- Les CG trouvées avec leur score de similarité
- Si aucune CG n'était trouvée

## Corrections appliquées dans `geminiService.ts`

### 1. Compatibilité Frontend/Backend
```typescript
// Avant
const insurers = policies.map(p => p.provider);

// Après
const insurers = policies.map(p => p.provider || (p as any).insurer).filter(Boolean);
```

### 2. Logs détaillés
```typescript
if (insurers.length > 0) {
  console.log(`🔍 Recherche CG pour assureurs: ${insurers.join(', ')}`);
  cgChunks = await storage.searchCentralCg(questionEmbedding, insurers, 3);
  console.log(`✅ RAG CG: ${cgChunks.length} documents trouvés`);
  if (cgChunks.length > 0) {
    cgChunks.forEach((cg, idx) => {
      console.log(`   ${idx + 1}. ${cg.insurer_label || cg.insurer} - ${cg.product_name} (similarité: ${cg.similarity.toFixed(3)})`);
    });
  }
}
```

### 3. Affichage du bon label
```typescript
// Avant
enrichedContext += `[${cg.insurer} - ${cg.product_name}]\n...`;

// Après  
const insurerName = cg.insurer_label || cg.insurer || 'Assureur inconnu';
enrichedContext += `[${insurerName} - ${cg.product_name}]\n...`;
```

### 4. Fallback metadata robuste
```typescript
enrichedContext = 'Vos contrats:\n' + policies.map(p => {
  const insurer = p.provider || (p as any).insurer || 'Assureur inconnu';
  return `- ${p.name} (${p.type}) chez ${insurer}: ${p.summary || 'Pas de résumé'}`;
}).join('\n');
```

## Vérifications nécessaires

### 1. Les CG sont-elles indexées ?
```sql
SELECT 
  id, insurer, product_name, 
  (embedding IS NOT NULL) as has_embedding,
  LENGTH(content_text) as content_length
FROM central_cg;
```

### 2. Les policies sont-elles liées aux CG ?
```sql
SELECT 
  p.id, p.insurer, p.type, 
  p.central_cg_id, 
  cg.product_name
FROM policies p
LEFT JOIN central_cg cg ON p.central_cg_id = cg.id;
```

### 3. La recherche vectorielle fonctionne-t-elle ?
**Logs à vérifier après déploiement :**
```
🔍 Recherche CG pour assureurs: MAIF, AXA
✅ RAG CG: 2 documents trouvés
   1. MAIF - Plénitude (similarité: 0.842)
   2. MAIF - Roulez Jeune (similarité: 0.735)
```

## Test manuel

Sur votre VM, testez avec curl :
```bash
curl -X POST https://52.143.159.51/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Que couvre mon contrat en cas de panne ?",
    "policies": [{
      "id": "18",
      "insurer": "MAIF",
      "type": "AUTO",
      "name": "Automobile - Plénitude"
    }],
    "history": []
  }'
```

**Réponse attendue :** L'assistant doit citer des clauses spécifiques des CG MAIF Plénitude.

## Prochaines étapes

1. ✅ Corriger l'incompatibilité de champs
2. ✅ Ajouter des logs détaillés
3. ⏳ Redéployer le backend sur la VM
4. ⏳ Tester avec une vraie question sur les CG
5. ⏳ Vérifier les logs pour confirmer que les CG sont trouvées

---

**Date :** 2 février 2026  
**Status :** ✅ Code corrigé, en attente de déploiement
