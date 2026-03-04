# Images des types d'assurance

Déposez ici les images PNG/SVG pour chaque type d'assurance.

## Convention de nommage

Le fichier doit porter **exactement** le code du type d'assurance (table `insurance_types.code`) + extension de votre choix :

```
AUT01.png   → Automobile
HAB01.png   → Habitation
SAN01.png   → Santé
PRE01.png   → Prévoyance
PRO.png     → Professionnelle
...
```

## Spécifications recommandées

- Format : PNG ou SVG
- Taille : 128×128 px minimum (sera affiché 40×40 px)
- Fond transparent recommandé
- Ces fichiers sont servis statiquement par Nginx/Vite depuis `/insurance-types/{code}.png`

## Fallback

Si aucun fichier n'est trouvé pour un code donné, les 2 premières lettres du libellé sont affichées en blanc sur fond coloré.
