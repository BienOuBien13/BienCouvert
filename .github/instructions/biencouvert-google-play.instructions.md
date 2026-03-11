---
applyTo: "BienCouvert/**"
---

# Guide de Packaging BienCouvert — Google Play Store

## Contexte du projet

| Propriété         | Valeur                                |
|-------------------|---------------------------------------|
| Nom de l'app      | `BienCouvert`                         |
| Slug Expo         | `biencouvert`                         |
| Version actuelle  | `1.0.0`                               |
| Framework         | Expo SDK ~54 / React Native 0.81.5    |
| Router            | expo-router ~6.0.23                   |
| Nouvelle archi    | `newArchEnabled: true`                |
| Schéma deep-link  | `biencouvert://`                      |
| Icône adaptative  | `assets/images/adaptive-icon.png`     |
| Icône principale  | `assets/images/icon.png`              |
| Splash screen     | `assets/images/splash-icon.png`       |

---

## Étape 1 — Prérequis

### Outils à installer

```bash
# EAS CLI (Expo Application Services)
npm install -g eas-cli

# Vérifier la version
eas --version
```

### Comptes nécessaires

- **Compte Expo** : [expo.dev](https://expo.dev) — créer un compte gratuit
- **Google Play Console** : [play.google.com/console](https://play.google.com/console) — frais d'inscription uniques de 25 USD
- **Android Studio** (optionnel pour tests locaux) : pour l'émulateur et la gestion du keystore

### Connexion EAS

```bash
cd BienCouvert
eas login
```

---

## Étape 2 — Configurer `app.json` pour le Play Store

Ajouter les champs Android manquants dans `BienCouvert/app.json` :

```jsonc
{
  "expo": {
    "name": "BienCouvert",
    "slug": "BienCouvert",
    "version": "1.0.0",
    "android": {
      "package": "com.assurclair.biencouvert",       // ← identifiant unique (ne jamais changer après publication)
      "versionCode": 1,                               // ← incrémenter à chaque upload
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [],                              // ← ajouter uniquement les permissions réellement utilisées
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    }
  }
}
```

> **Important** : le champ `package` (`com.assurclair.biencouvert`) est définitif une fois l'app publiée. Il ne peut plus être modifié.

---

## Étape 3 — Initialiser EAS Build

```bash
cd BienCouvert
eas build:configure
```

Cela génère le fichier `eas.json`. Voici la configuration recommandée :

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

---

## Étape 4 — Gestion du Keystore (signature)

### Option A — Laisser EAS gérer le keystore (recommandé)

EAS génère et stocke le keystore automatiquement dans le cloud Expo.

```bash
eas credentials
# Choisir Android > production > Generate new keystore
```

### Option B — Keystore local (si contrôle total requis)

```bash
# Générer un keystore avec keytool (Java JDK requis)
keytool -genkey -v \
  -keystore ./biencouvert-release.keystore \
  -alias biencouvert \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Puis référencer dans `eas.json` :

```json
"production": {
  "android": {
    "buildType": "app-bundle",
    "credentialsSource": "local"
  }
}
```

Et créer un fichier `credentials.json` :

```json
{
  "android": {
    "keystore": {
      "keystorePath": "./biencouvert-release.keystore",
      "keystorePassword": "VOTRE_MOT_DE_PASSE",
      "keyAlias": "biencouvert",
      "keyPassword": "VOTRE_MOT_DE_PASSE_CLE"
    }
  }
}
```

> **Sécurité** : Ne jamais commiter `biencouvert-release.keystore` ni `credentials.json` dans Git. Les ajouter dans `.gitignore`.

---

## Étape 5 — Construire l'AAB de production

```bash
cd BienCouvert

# Build Android AAB (Android App Bundle) — format requis par le Play Store
eas build --platform android --profile production
```

Le build se fait dans le cloud EAS. La progression est visible sur [expo.dev/builds](https://expo.dev/builds).

Une fois terminé, télécharger le fichier `.aab` depuis le tableau de bord Expo.

### Build en local (si préféré)

```bash
# Nécessite Android Studio et les variable d'environnement ANDROID_HOME configurées
eas build --platform android --profile production --local
```

---

## Étape 6 — Tester avant publication

### Build de preview (APK installable directement)

```bash
eas build --platform android --profile preview
```

Partager le lien de téléchargement avec les testeurs internes.

### Test avec un émulateur

```bash
# Lancer l'app sur un émulateur Android connecté
npx expo start --android
```

---

## Étape 7 — Préparer les assets pour le Play Store

### Assets obligatoires

| Asset                  | Taille / Format         | Emplacement suggéré              |
|------------------------|-------------------------|----------------------------------|
| Icône de l'app         | 512 × 512 px, PNG       | `assets/images/icon.png`         |
| Feature graphic        | 1024 × 500 px, PNG/JPG  | À créer (obligatoire)            |
| Captures d'écran phone | Min 2, max 8 — 320–3840px | Assets Google Play Console     |
| Vidéo promo (optionnel)| YouTube URL             | —                                |

### Liste des informations à renseigner dans la console

- **Nom de l'app** : BienCouvert
- **Description courte** (max 80 caractères)
- **Description complète** (max 4000 caractères)
- **Catégorie** : Finance ou Outils
- **Email de contact** du développeur
- **URL de politique de confidentialité** (obligatoire)
- **Classification du contenu** (questionnaire IARC)

---

## Étape 8 — Configurer Google Play Console

### Créer l'application

1. Aller sur [play.google.com/console](https://play.google.com/console)
2. Cliquer **Créer une application**
3. Langue par défaut : Français
4. Nom : `BienCouvert`
5. Type : Application
6. Gratuite ou payante

### Remplir les sections obligatoires (tableau de bord « Configurer »)

- Informations sur l'application (description, catégorie, coordonnées)
- Ressources graphiques (icône, feature graphic, captures d'écran)
- Politique de confidentialité (URL HTTPS obligatoire)
- Classification du contenu (questionnaire en ligne dans la console)
- Public cible
- Déclarations de sécurité des données

---

## Étape 9 — Soumettre l'AAB via EAS Submit (automatisé)

### Prérequis : compte de service Google

1. Dans Google Play Console → **Configuration** → **Accès API**
2. Lier à un projet Google Cloud
3. Créer un **compte de service** avec le rôle "Gestionnaire des versions"
4. Télécharger le fichier JSON de clé privée → le nommer `google-service-account.json`
5. L'ajouter dans `.gitignore`

### Soumettre

```bash
cd BienCouvert

# Soumettre le dernier build EAS en track interne
eas submit --platform android --profile production

# Ou spécifier un fichier AAB téléchargé manuellement
eas submit --platform android --path ./chemin/vers/biencouvert.aab
```

### Tracks disponibles

| Track              | Usage                                      |
|--------------------|--------------------------------------------|
| `internal`         | Testeurs internes (max 100)               |
| `alpha`            | Tests fermés                              |
| `beta`             | Tests ouverts                             |
| `production`       | Publication publique                      |

Commencer par `internal` pour valider avant la mise en production.

---

## Étape 10 — Workflow de mise à jour

### Mise à jour du code seulement (sans rebuild natif) — EAS Update

```bash
# Pour les mises à jour JavaScript uniquement (pas de changement natif)
eas update --branch production --message "Fix: correction du flux de connexion"
```

### Mise à jour nécessitant un nouveau build (changement natif, dépendances, version)

1. Incrémenter `versionCode` dans `app.json` (ex: `1` → `2`)
2. Mettre à jour `version` si besoin (ex: `"1.0.0"` → `"1.1.0"`)
3. Lancer `eas build --platform android --profile production`
4. Soumettre avec `eas submit` ou manuellement via la console

---

## Checklist finale avant publication

```
[ ] app.json — package Android défini (com.assurclair.biencouvert)
[ ] app.json — versionCode à jour
[ ] eas.json — profil production configuré
[ ] Keystore sauvegardé et sécurisé
[ ] AAB signé et téléchargé/soumis
[ ] Icône 512x512 uploadée dans la console
[ ] Feature graphic 1024x500 uploadée
[ ] Screenshots (min 2) pour téléphone Android
[ ] Description courte et complète rédigées
[ ] Politique de confidentialité disponible en ligne (URL HTTPS)
[ ] Questionnaire IARC complété
[ ] Déclaration de sécurité des données complétée
[ ] Track interne testé avant promotion en production
```

---

## Commandes de référence rapide

```bash
# Installer EAS CLI
npm install -g eas-cli

# Se connecter
eas login

# Configurer le projet
eas build:configure

# Build production (AAB)
eas build --platform android --profile production

# Build preview (APK)
eas build --platform android --profile preview

# Soumettre au Play Store
eas submit --platform android --profile production

# Mise à jour OTA (JS only)
eas update --branch production --message "description"

# Voir les builds
eas build:list

# Gérer les credentials
eas credentials
```

---

## Ressources

- [Documentation EAS Build](https://docs.expo.dev/build/introduction/)
- [Documentation EAS Submit](https://docs.expo.dev/submit/android/)
- [EAS Update (OTA)](https://docs.expo.dev/eas-update/introduction/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Politique de confidentialité — générateur](https://app-privacy-policy-generator.nisrulz.com/)
