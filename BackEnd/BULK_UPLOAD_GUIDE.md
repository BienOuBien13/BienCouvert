# 📚 Guide de chargement en masse de PDF dans central_cg

## 🎯 Deux méthodes disponibles

### Méthode 1 : Avec fichier CSV (Plus flexible)

**Avantages :** Contrôle total sur les métadonnées, URLs optionnelles, noms de produits personnalisés

**Étapes :**

1. **Créer le dossier PDFs**
   ```bash
   mkdir pdfs
   ```

2. **Placer vos PDFs dans `pdfs/`**
   ```
   pdfs/
   ├── maif-auto.pdf
   ├── axa-habitation.pdf
   └── allianz-sante.pdf
   ```

3. **Créer le fichier `bulk-upload.csv`**
   ```csv
   filename,insurer_code,insurance_type_code,version,type,url,productName
   maif-auto.pdf,MAIF,AUTO,2024-01,CG,https://www.maif.fr/cg.pdf,Auto Vam
   axa-habitation.pdf,AXA,HABITATION,2024-01,CG,,MRH Confort
   allianz-sante.pdf,ALLIANZ,SANTE,2024-02,CG,,Santé Plus
   ```

4. **Lancer le script**
   ```bash
   node bulk-upload-cg.js
   ```

---

### Méthode 2 : Par convention de nommage (Plus simple)

**Avantages :** Très simple, pas besoin de CSV, nommage automatique

**Étapes :**

1. **Créer le dossier PDFs**
   ```bash
   mkdir pdfs
   ```

2. **Nommer vos PDFs selon le format :**
   ```
   {CODE_ASSUREUR}_{CODE_TYPE}_{VERSION}.pdf
   ```

   Exemples :
   ```
   pdfs/
   ├── MAIF_AUTO_2024-01.pdf
   ├── AXA_HABITATION_2024-01.pdf
   ├── ALLIANZ_SANTE_2024-02.pdf
   └── GROUPAMA_PREVOYANCE_2024-01.pdf
   ```

3. **Lancer le script**
   ```bash
   node simple-bulk-upload-cg.js
   ```

---

## 📋 Codes disponibles

### Codes assureurs (insurer_code)
Vérifiez la table `insurers` pour les codes valides :
```sql
SELECT code, label FROM insurers;
```

Exemples : `MAIF`, `AXA`, `ALLIANZ`, `GROUPAMA`, `MACIF`, etc.

### Codes types d'assurance (insurance_type_code)
Vérifiez la table `insurance_types` pour les codes valides :
```sql
SELECT code, label_fr FROM insurance_types;
```

Exemples : `AUTO`, `HABITATION`, `SANTE`, `PREVOYANCE`, `PROTECTION_JURIDIQUE`, etc.

---

## ⚡ Performance et limitations

- **Vitesse** : ~2-3 minutes par document (extraction + embedding)
- **Rate Limiting** : Pause de 2 secondes entre chaque document
- **Taille max** : Recommandé < 50 MB par PDF
- **API Gemini** : Vérifiez vos quotas si vous chargez beaucoup de documents

---

## 🔍 Vérifier les documents chargés

```bash
node check-central-cg-structure.js
```

Ou en SQL :
```sql
SELECT id, insurer_code, insurance_type_code, target_filename, status
FROM central_cg
ORDER BY created_at DESC;
```

---

## 🛠️ Dépannage

### Erreur "Module csv-parser not found"
```bash
npm install csv-parser
```

### Erreur "API quota exceeded"
Attendez quelques minutes ou utilisez une autre clé API Gemini

### Fichier PDF corrompu
Vérifiez que le PDF s'ouvre correctement avant l'upload

### Mauvais format de nom (Méthode 2)
Format requis : `ASSUREUR_TYPE_VERSION.pdf`
Exemple valide : `MAIF_AUTO_2024-01.pdf`

---

## 📊 Exemple de sortie

```
🚀 Chargement en masse de documents CG
============================================================

📋 3 document(s) à traiter

[1/3] ────────────────────────────────
📥 Traitement de maif-auto.pdf...
  📄 Extraction du texte...
  ✅ 145623 caractères extraits
  🔮 Génération de l'embedding...
  ✅ Embedding généré (768 dimensions)
  💾 Insertion dans la base de données...
  ✅ Document enregistré avec l'ID 42

  ⏳ Pause de 2 secondes...

[2/3] ────────────────────────────────
...

============================================================

✨ RÉSUMÉ
   ✅ Réussis : 3
   ❌ Échoués : 0
   📊 Total   : 3
```

---

## 💡 Conseils

1. **Testez d'abord avec 1-2 documents** pour vérifier que tout fonctionne
2. **Organisez vos PDFs** par assureur ou type avant de commencer
3. **Sauvegardez votre CSV** si vous utilisez la méthode 1
4. **Surveillez les quotas API** Gemini pendant le chargement
5. **Lancez le script en dehors des heures de pointe** pour de gros volumes
