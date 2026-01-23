# ⚡ GUIDE RAPIDE - Nouvelle Interface d'Ajout

## 🎯 Vue d'ensemble

L'interface **QuickAdd** révolutionne l'ajout de contrats avec une approche conversationnelle en 3 étapes ultra-rapides.

---

## 📱 Interface

### Étape 1 : Type d'assurance (Sélection visuelle)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Ajout Rapide                                [Annuler]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✨ Quel type d'assurance ?                                 │
│                                                              │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  │
│  │ 🏠 │  │ 🚗 │  │ ❤️ │  │ 🛡️ │  │ ☂️ │  │ 💼 │  │ 👶 │  │ ✈️ │  │
│  │Hab.│  │Auto│  │Sant│  │Vie │  │Prév│  │Pro │  │Fam.│  │Voy.│  │
│  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Interaction** : Click sur une icône → Passage automatique à l'étape 2

---

### Étape 2 : Choix de l'assureur (Logos cliquables)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Ajout Rapide                                [Annuler]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✨ Quel assureur ?                   [← Changer le type]   │
│                                                              │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  │
│  │ 🔵 │  │ 💙 │  │ 🟢 │  │ 🔴 │  │ 🟠 │  │ 🟡 │  │ 🟣 │  │ 🦁 │  │
│  │Alli│  │AXA │  │MAIF│  │MACI│  │Grou│  │MAAF│  │Matm│  │Gene│  │
│  │anz │  │    │  │    │  │F   │  │pama│  │    │  │ut  │  │rali│  │
│  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Interaction** : Click sur un logo → Initialisation du chat

---

### Étape 3 : Chat conversationnel (IA guidée)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Ajout Rapide                                [Annuler]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [🏠 Habitation ×]  [💙 AXA ×]                               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🤖 Parfait ! Vous souhaitez ajouter un contrat             │
│     **Habitation** chez **AXA**. Je vais vous aider        │
│     à compléter rapidement les informations.                │
│                                                              │
│     [J'ai déjà un contrat] [Comparer] [Upload PDF]          │
│                                                              │
│  🤖 Voici les formules disponibles chez AXA :               │
│                                                              │
│     ┌──────────────────────────────────┐                    │
│     │  Protect                    ✓   │                    │
│     └──────────────────────────────────┘                    │
│     ┌──────────────────────────────────┐                    │
│     │  Confort                    ✓   │                    │
│     └──────────────────────────────────┘                    │
│     ┌──────────────────────────────────┐                    │
│     │  Premium                    ✓   │                    │
│     └──────────────────────────────────┘                    │
│                                                              │
│  👤 J'ai sélectionné : Confort                              │
│                                                              │
│  🤖 Excellent choix ! Formule **Confort** sélectionnée.    │
│     Maintenant, avez-vous le numéro de contrat ?            │
│                                                              │
│     [J'ai mon numéro] [Pas encore] [Upload PDF]             │
│                                                              │
│  👤 123456789                                               │
│                                                              │
│  🤖 Numéro de contrat **123456789** enregistré !           │
│     Quelle est votre prime annuelle ?                       │
│                                                              │
│     [150€/an] [300€/an] [500€/an] [Je ne sais pas]          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [Tapez votre message...]                          [Envoyer]│
│  [Upload PDF]                          [✓ Créer le contrat] │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Fonctionnalités clés

### 1. Pills de sélection (en haut)
```tsx
[🏠 Habitation ×]  [💙 AXA ×]
```
- Affiche les choix en cours
- Click sur `×` pour modifier

### 2. Messages de l'IA (bulles grises)
```tsx
🤖 Parfait ! Vous souhaitez ajouter un contrat...
```
- Guidage contextuel
- Suggestions pertinentes

### 3. Quick-reply buttons (suggestions)
```tsx
[J'ai déjà un contrat] [Comparer] [Upload PDF]
```
- Click pour répondre rapidement
- Pas besoin de taper

### 4. Options de produits (cartes cliquables)
```tsx
┌────────────────────────┐
│  Confort          ✓   │  ← Click pour sélectionner
└────────────────────────┘
```
- Formules récupérées depuis `central_cg`
- Sélection en un click

### 5. Détection intelligente
- **Numéro de contrat** : `123456789` → détecté automatiquement
- **Montants** : `280€`, `300 EUR` → parsés automatiquement
- **Commandes** : `finaliser`, `créer` → actions déclenchées

### 6. Actions rapides (barre du bas)
```tsx
[Upload PDF]  [✓ Créer le contrat]
```
- Upload de document
- Validation finale

---

## 🚀 Flux complet (30 secondes)

```
Temps  Action                          Résultat
─────  ──────────────────────────────  ────────────────────────
0s     Click "Ajouter un contrat"      → QuickAdd s'ouvre
       
2s     Click icône "Habitation"        → Sélection type
       
4s     Click logo "AXA"                → Chat s'initialise
                                        → Affichage formules
       
7s     Click formule "Confort"         → Enregistrement formule
                                        → Demande n° contrat
       
10s    Tape "123456789"                → Détection automatique
       + Entrée                         → Demande prime
       
15s    Click "300€/an"                 → Enregistrement prime
                                        → Demande couverture
       
20s    Tape "100000€"                  → Détection montant
       + Entrée                         → Proposition finalisation
       
25s    Click "Créer le contrat"        → Policy créée !
                                        → Redirection liste
       
30s    ✅ Contrat ajouté               
```

**vs Mode classique** : ~2 minutes avec 15-20 clicks

---

## 💡 Tips & Astuces

### Pour aller encore plus vite

1. **Préparez vos infos** :
   - Numéro de contrat
   - Prime annuelle
   - Montant de couverture

2. **Utilisez les suggestions** :
   - Click sur les boutons quick-reply
   - Pas besoin de tout taper

3. **Upload direct** :
   - Si vous avez le PDF, uploadez-le en premier
   - L'IA extraira les infos automatiquement

4. **Raccourcis clavier** :
   - `Entrée` pour envoyer
   - `Échap` pour annuler

---

## 🔄 Comparaison des modes

### Mode Rapide (QuickAdd)
```
Type (1 click) → Assureur (1 click) → Chat (5-8 interactions)
= 30 secondes
```

### Mode Classique
```
Formulaire long → Remplissage champs → Upload → Validation
= 2 minutes
```

---

## 🎯 Quand utiliser quel mode ?

| Situation | Mode recommandé |
|-----------|----------------|
| **Ajout rapide d'un contrat connu** | ⚡ Rapide |
| **Upload d'un PDF complet** | ⚡ Rapide (avec analyse auto) |
| **Plusieurs contrats à la suite** | ⚡ Rapide |
| **Modification d'un contrat existant** | 📝 Classique |
| **Ajout de détails complexes** | 📝 Classique |
| **Préférence formulaire traditionnel** | 📝 Classique |

---

## ✅ Résumé

La nouvelle interface **QuickAdd** vous fait gagner **70% de temps** grâce à :

- ✨ **Sélection visuelle** intuitive (icônes + logos)
- 💬 **Chat conversationnel** guidé par l'IA
- 🎯 **Suggestions contextuelles** pertinentes
- 🤖 **Détection automatique** des informations
- 📱 **Design mobile-first** optimisé tactile

**Essayez-la maintenant** : Policies → Mode rapide activé par défaut !
