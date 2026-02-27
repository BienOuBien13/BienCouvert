# ❌ VECTORISATION DES PDFs UTILISATEURS - NON IMPLÉMENTÉE

## Situation actuelle

### ✅ Ce qui est vectorisé (pgvector)
- **Conditions Générales (CdG) dans `central_cg`** 
  - Vectorisées via le script `vectorize-pdf.js`
  - Utilisées depuis l'interface admin
  - Contiennent : embedding (VECTOR 768), formules, options
  - Exemple : AXA Habitation, AXA Carte Bancaire

### ❌ Ce qui N'est PAS vectorisé
- **PDFs des contrats utilisateurs dans `policies`**
  - Stockés en base64 dans `document_data`
  - **Actuellement : 5 contrats, 0 avec PDF**
  - **Aucune vectorisation des PDFs utilisateurs**
  - **L'assistant chat ne peut pas "lire" les PDFs des utilisateurs**

## Comment l'assistant fonctionne aujourd'hui

### ChatInterface (Frontend)
1. Utilisateur pose une question
2. Envoie à `/api/ai/chat` avec :
   - `message` : la question
   - `policies` : liste des contrats (sans les PDFs)
   - `history` : historique de conversation

### sendMessageToAssistant (Backend)
```typescript
// BackEnd/src/services/geminiService.ts ligne 176
export const sendMessageToAssistant = async (
  message: string, 
  policies: Policy[], // ⚠️ Contient seulement les métadonnées, PAS les PDFs
  history: Message[]
): Promise<string> => {
  // Construction du contexte
  let context = `Tu es BienCouvert, un assistant IA spécialisé en assurances.
  
  Contrats actuels de l'utilisateur :
  ${policies.map(p => `- ${p.provider} (${p.type}): ${p.name}`).join('\\n')}`;
  
  // ❌ Pas de recherche dans les PDFs vectorisés
  // ❌ Pas de RAG (Retrieval Augmented Generation)
  
  // Appel Gemini avec contexte texte seulement
  const result = await model.generateContent(context + message);
  return result.text;
}
```

## Problèmes actuels

1. **Assistant aveugle aux PDFs** 
   - L'assistant ne voit QUE les métadonnées (nom, assureur, type)
   - Il ne peut pas répondre à "Suis-je couvert pour X ?" basé sur le PDF

2. **Pas de RAG**
   - Pas de recherche sémantique dans les documents
   - Pas d'utilisation de pgvector pour les contrats utilisateurs

3. **central_cg non utilisé par le chat**
   - Les CdG vectorisées ne sont pas interrogées lors du chat
   - Utilisées seulement pour SmartChat (ajout de contrat)

## Solution à implémenter

### Architecture RAG complète

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Upload PDF utilisateur                                   │
│    → Extraire texte (pdf-parse ou Gemini)                   │
│    → Découper en chunks (1000 tokens)                       │
│    → Générer embeddings (text-embedding-004)                │
│    → Stocker dans nouvelle table `policy_embeddings`        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. Question utilisateur dans chat                           │
│    → Vectoriser la question                                 │
│    → Recherche cosine similarity dans policy_embeddings     │
│    → Récupérer top 5 chunks pertinents                      │
│    → Ajouter au contexte Gemini                             │
│    → Générer réponse avec RAG                               │
└─────────────────────────────────────────────────────────────┘
```

### Nouvelle table nécessaire

```sql
CREATE TABLE policy_embeddings (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER REFERENCES policies(id),
  chunk_text TEXT,
  chunk_index INTEGER,
  embedding VECTOR(768),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_embeddings_vector 
ON policy_embeddings 
USING ivfflat (embedding vector_cosine_ops);
```

### Code à ajouter

**1. Vectoriser PDF lors de l'upload**
```typescript
// Quand un contrat avec PDF est créé
async function vectorizePolicyPdf(policyId: number, pdfBase64: string) {
  // Extraire texte
  const text = await extractTextFromPDF(pdfBase64);
  
  // Découper en chunks
  const chunks = chunkText(text, 1000);
  
  // Pour chaque chunk
  for (let i = 0; i < chunks.length; i++) {
    // Générer embedding
    const embedding = await generateEmbedding(chunks[i]);
    
    // Stocker
    await query(`
      INSERT INTO policy_embeddings (policy_id, chunk_text, chunk_index, embedding)
      VALUES ($1, $2, $3, $4)
    `, [policyId, chunks[i], i, embedding]);
  }
}
```

**2. Recherche RAG dans le chat**
```typescript
async function sendMessageToAssistant(message: string, policies: Policy[], history: Message[]) {
  // Vectoriser la question
  const questionEmbedding = await generateEmbedding(message);
  
  // Rechercher chunks pertinents
  const relevantChunks = await query(`
    SELECT pe.chunk_text, p.provider, p.type
    FROM policy_embeddings pe
    JOIN policies p ON p.id = pe.policy_id
    WHERE p.id IN (${policies.map(p => p.id).join(',')})
    ORDER BY pe.embedding <=> $1
    LIMIT 5
  `, [questionEmbedding]);
  
  // Construire contexte enrichi
  let context = `Contrats de l'utilisateur avec extraits pertinents :
  ${relevantChunks.rows.map(r => `
    ${r.provider} (${r.type}): ${r.chunk_text}
  `).join('\\n\\n')}`;
  
  // Appel Gemini avec RAG
  return await generateWithContext(context, message, history);
}
```

## Estimation

- **Développement** : 2-3 jours
- **Tests** : 1 jour
- **Coût Gemini** : ~0.01€ par contrat vectorisé
- **Coût requête chat** : ~0.001€ par message

## Prochaines étapes

1. Créer table `policy_embeddings`
2. Adapter script `vectorize-pdf.js` pour contrats utilisateurs
3. Modifier route POST `/api/policies` pour vectoriser automatiquement
4. Modifier `sendMessageToAssistant` pour utiliser RAG
5. Tester avec vrais PDFs utilisateurs
