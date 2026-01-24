# Modifications SmartChatAssistant - Récapitulatif

## ✅ Déjà fait
1. Types d'assurance complétés : auto, habitation, santé, prévoyance, pro, bancaire, juridique, voyage, animaux, autre
2. Icônes plus petites et modernes (Lucide)
3. Saisie manuelle avec formulaire complet
4. Possibilité de nommer les contrats

## 🔧 À faire

### 1. Logos des assureurs - Problème résolu
**Le code existe déjà** avec `showInsurerLogos: true` dans handleTypeSelect ligne 223.
Les logos devraient s'afficher. Si ce n'est pas le cas, c'est peut-être un problème de cache browser ou CORS.

### 2. Upload de PDF au lieu d'URL

**Où ça se stocke :** 
- Le fichier PDF est converti en **base64** et stocké dans PostgreSQL
- Colonne : `policies.document_data` (type TEXT avec base64)
- Aussi stocké : `file_name`, `mime_type`

**Modifications à faire :**

Dans le state (ligne ~130) :
```typescript
const [manualData, setManualData] = useState({
  type: 'auto',
  insurer: '',
  name: '',
  formula: '',
  options: '',
  pdfFile: null as File | null  // Ajout
});
```

Remplacer le champ URL par un input file (ligne 631) :
```tsx
<div className="col-span-2">
  <label className="text-xs font-bold text-slate-500 mb-1 block">
    Document PDF (optionnel)
  </label>
  <input
    type="file"
    accept="application/pdf"
    onChange={(e) => {
      const file = e.target.files?.[0] || null;
      setManualData({...manualData, pdfFile: file});
    }}
    className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
  />
  {manualData.pdfFile && (
    <p className="text-xs text-slate-500 mt-1">
      📄 {manualData.pdfFile.name} ({(manualData.pdfFile.size / 1024).toFixed(2)} KB)
    </p>
  )}
</div>
```

Dans la fonction d'enregistrement (ligne 643), convertir le fichier en base64 :
```typescript
onClick={async () => {
  if (manualData.insurer && manualData.name) {
    let fileData = null;
    let fileName = null;
    let mimeType = 'text/plain';
    
    // Convertir le PDF en base64
    if (manualData.pdfFile) {
      const reader = new FileReader();
      fileData = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(manualData.pdfFile!);
      }).then(result => result.split(',')[1]); // Enlever le préfixe data:...
      fileName = manualData.pdfFile.name;
      mimeType = manualData.pdfFile.type;
    }
    
    const newPolicy: Omit<Policy, 'userId'> = {
      id: uuid(),
      name: manualData.name,
      provider: manualData.insurer,
      type: manualData.type,
      coverageDetail: `${manualData.insurer}\\n\\n📦 Formule: ${manualData.formula}\\n\\n🎯 Options:\\n${manualData.options.split(',').map(opt => \`• ${opt.trim()}\`).join('\\n')}`,
      options: manualData.options ? manualData.options.split(',').map(o => o.trim()) : [],
      summary: `${manualData.type} - ${manualData.formula}`,
      sourceUrl: null,
      isInternalSource: true,
      addedAt: Date.now(),
      fileData,    // Base64
      fileName,    // Nom du fichier
      mimeType     // Type MIME
    };
    onAddPolicy(newPolicy);
    setManualMode(false);
    setManualData({ type: 'auto', insurer: '', name: '', formula: '', options: '', pdfFile: null });
    addMessage('✅ Contrat ajouté avec succès !', 'bot');
  }
}}
```

### 3. Proposer formules et options depuis central_cg

**Modifications à faire :**

Ajouter des states (ligne ~130) :
```typescript
const [availableFormulas, setAvailableFormulas] = useState<string[]>([]);
const [availableOptions, setAvailableOptions] = useState<string[]>([]);
const [selectedFormula, setSelectedFormula] = useState('');
```

Créer une fonction pour chercher dans central_cg :
```typescript
const fetchFormulasFromCentralCg = async (type: string, insurer: string) => {
  try {
    const API_URL = (import.meta as any).env?.VITE_API_URL ?? '';
    const response = await fetch(`${API_URL}/api/policies/central-cg?type=${type}&insurer=${insurer}`);
    const data = await response.json();
    
    if (data.length > 0) {
      // Récupérer toutes les formules
      const allFormulas: string[] = [];
      data.forEach((entry: any) => {
        if (entry.indexedFormulas) {
          allFormulas.push(...entry.indexedFormulas);
        }
      });
      setAvailableFormulas([...new Set(allFormulas)]); // Dédupliquer
      
      return data;
    }
  } catch (error) {
    console.error('Erreur récupération formules:', error);
  }
  return [];
};

const fetchOptionsForFormula = async (type: string, insurer: string, formula: string) => {
  try {
    const API_URL = (import.meta as any).env?.VITE_API_URL ?? '';
    const response = await fetch(`${API_URL}/api/policies/central-cg?type=${type}&insurer=${insurer}`);
    const data = await response.json();
    
    if (data.length > 0) {
      const allOptions: string[] = [];
      data.forEach((entry: any) => {
        if (entry.indexedOptions) {
          allOptions.push(...entry.indexedOptions);
        }
      });
      setAvailableOptions([...new Set(allOptions)]); // Dédupliquer
    }
  } catch (error) {
    console.error('Erreur récupération options:', error);
  }
};
```

Modifier handleQuantitySelect pour appeler cette fonction :
```typescript
const handleQuantitySelect = async (count: number) => {
  addMessage(`${count} contrat(s)`, 'user');
  setContractCount(count);
  
  // Chercher dans central_cg
  addMessage('🔍 Recherche des formules disponibles...', 'bot');
  const cgData = await fetchFormulasFromCentralCg(selectedType, selectedInsurer);
  
  if (availableFormulas.length > 0) {
    addMessage(
      `Voici les formules disponibles pour ${selectedInsurer} :`,
      'bot',
      { showFormulas: true }
    );
  } else {
    // Fallback : demander à l'IA
    setIsLoadingAI(true);
    const aiFormulas = await getAIFormulas();
    setIsLoadingAI(false);
    // ... reste du code
  }
};
```

Dans le rendu des messages, ajouter l'affichage des formules depuis central_cg :
```tsx
{message.showFormulas && availableFormulas.length > 0 && (
  <div className="grid grid-cols-1 gap-2 mt-4">
    {availableFormulas.map((formula, idx) => (
      <button
        key={idx}
        onClick={async () => {
          setSelectedFormula(formula);
          addMessage(formula, 'user');
          addMessage('🔍 Recherche des options pour cette formule...', 'bot');
          await fetchOptionsForFormula(selectedType, selectedInsurer, formula);
          addMessage(
            `Voici les options disponibles :`,
            'bot',
            { showOptions: true }
          );
        }}
        className="bg-white border-2 border-primary-200 hover:border-primary-500 p-4 rounded-xl hover:scale-105 transition-all text-left"
      >
        <div className="font-black text-slate-900">{formula}</div>
        <div className="text-xs text-slate-500 mt-1">Issue des conditions générales</div>
      </button>
    ))}
  </div>
)}

{message.showOptions && availableOptions.length > 0 && (
  <div className="grid grid-cols-2 gap-2 mt-4">
    {availableOptions.map((option, idx) => (
      <label key={idx} className="flex items-center gap-2 bg-white border-2 border-slate-200 p-3 rounded-xl hover:border-primary-500 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" />
        <span className="text-xs font-medium">{option}</span>
      </label>
    ))}
    <button
      onClick={handleFinalSave}
      className="col-span-2 bg-primary-600 text-white p-4 rounded-xl font-black"
    >
      ✓ Valider
    </button>
  </div>
)}
```

## Résumé du stockage

**Fichiers PDF uploadés :**
- Convertis en base64
- Stockés dans `policies.document_data` (PostgreSQL)
- Accompagnés de `file_name` et `mime_type`
- Taille max recommandée : 10 MB
- Accessible via l'API backend qui peut décoder le base64

**Avantages :**
- ✅ Pas de gestion de fichiers sur disque
- ✅ Backup inclus avec la base de données
- ✅ Portable entre environnements (dev/prod)
- ✅ Pas de problèmes de permissions fichiers

**Alternative (si trop gros) :**
- Stocker sur Azure Blob Storage
- Garder seulement l'URL dans la base
