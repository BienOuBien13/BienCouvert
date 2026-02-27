# 🚀 Instructions pour charger les PDFs depuis la VM

## 📋 Étapes à suivre

### 1. Copier les fichiers sur la VM

**Depuis votre machine locale :**

```powershell
# Se connecter à la VM
ssh azureuser@52.143.159.51

# Sur votre machine locale, copier les fichiers
scp C:\biencouvert\liste_pdf.xlsx azureuser@52.143.159.51:~/AssurClair/
scp -r C:\biencouvert\cdg\*.pdf azureuser@52.143.159.51:~/AssurClair/pdfs/
```

Ou via WinSCP / FileZilla pour copier :
- `C:\biencouvert\liste_pdf.xlsx` → `/home/azureuser/AssurClair/liste_pdf.xlsx`
- `C:\biencouvert\cdg\` (tous les PDFs) → `/home/azureuser/AssurClair/pdfs/`

---

### 2. Copier le script sur la VM

```powershell
scp bulk-upload-from-excel.js azureuser@52.143.159.51:~/AssurClair/BackEnd/
```

---

### 3. Sur la VM, créer le dossier pdfs

```bash
ssh azureuser@52.143.159.51
cd ~/AssurClair
mkdir -p pdfs
```

Le script utilise automatiquement ces chemins :
```javascript
const EXCEL_FILE = '/home/azureuser/AssurClair/liste_pdf.xlsx';
const PDF_FOLDER = '/home/azureuser/AssurClair/pdfs';
```

---

### 4. Lancer le script sur la VM en arrière-plan

```bash
cd ~/AssurClair/BackEnd

# Lancer en arrière-plan avec nohup
nohup node bulk-upload-from-excel.js > bulk-upload-output.log 2>&1 &

# Récupérer le PID du processus
echo $! > bulk-upload.pid
echo "✅ Script lancé en arrière-plan (PID: $(cat bulk-upload.pid))"
```

**Commandes de surveillance :**

```bash
# Voir les logs en temps réel
tail -f ~/AssurClair/BackEnd/bulk-upload.log

# Voir le nombre de lignes traitées
wc -l ~/AssurClair/BackEnd/bulk-upload.log

# Vérifier que le processus tourne
ps aux | grep bulk-upload-from-excel

# Compter les documents vectorisés dans la base
psql $DATABASE_URL -c "SELECT COUNT(*) as vectorises FROM central_cg WHERE status='active';"

# Arrêter le processus si nécessaire
kill $(cat ~/AssurClair/BackEnd/bulk-upload.pid)
```

---

## 🔍 Vérifier les résultats

Après l'exécution, le fichier Excel sera mis à jour avec :
- Status : "vectorisé" pour les documents traités
- Date de chargement : Date du traitement

Copier le fichier Excel mis à jour depuis la VM :
```powershell
scp azureuser@52.143.159.51:~/AssurClair/liste_pdf.xlsx C:\biencouvert\liste_pdf_updated.xlsx
```

---

## ⚡ Avantages de cette approche

✅ Pas de blocage Zscaler sur l'API Gemini  
✅ Connexion directe à la base PostgreSQL Azure  
✅ Meilleure bande passante pour les PDFs volumineux  
✅ Pas de timeout réseau  
✅ **Exécution en arrière-plan** - vous pouvez vous déconnecter  
✅ **Logs persistants** - suivi dans bulk-upload.log

---

## 📊 Estimer le temps de traitement

- **Par document** : ~2-3 minutes (extraction + embedding + insertion)
- **Pause entre documents** : 2 secondes
- **Pour 50 PDFs** : ~2-3 heures
- **Pour 100 PDFs** : ~4-6 heures

Le script peut tourner pendant la nuit ou le weekend sans intervention.

---

## 🛠️ Commandes utiles

**Surveiller la progression :**
```bash
# Voir les logs en temps réel
tail -f ~/AssurClair/BackEnd/bulk-upload.log

# Compter les documents vectorisés
psql $DATABASE_URL -c "SELECT COUNT(*) FROM central_cg WHERE status='active';"
```

**En cas d'interruption :**
Le script reprendra automatiquement les documents non traités (Status = "téléchargé")
