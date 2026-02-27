# AUDIT CONFORMITÉ DPO & CYBERSÉCURITÉ
## Projet: BienCouvert (AssurClair)
Date: 25 janvier 2026

---

## ✅ POINTS CONFORMES

### 1. RGPD / Protection des données

#### ✓ Transparence et information
- **Politique de confidentialité** complète et accessible
- **CGU** détaillées avec mentions RGPD
- **Disclaimers clairs** sur le traitement des données et limites de l'IA
- **Consentement explicite** via checkboxes lors de l'inscription
- Mention de la base légale (exécution du contrat)

#### ✓ Droits des personnes
- **Droit d'accès** : Interface profil pour consulter ses données
- **Droit de rectification** : Modification du profil dans l'app
- **Droit à l'effacement** : Fonction de suppression de compte (mentionnée dans CGU)
- **Droit à la portabilité** : Mentionné (export JSON sur demande)
- Contact DPO clair : contact@biencouvert.fr

#### ✓ Sécurité technique
- **Hébergement EU** : Azure Europe (conformité RGPD territoriale)
- **Mots de passe hashés** : bcrypt avec salt (facteur 10)
- **Tokens JWT** : Authentification sécurisée, expiration 7 jours
- **HTTPS** : Mentionné dans les disclaimers
- **Validation des entrées** : Contrôles basiques côté backend

#### ✓ Minimisation des données
- Collecte limitée au nécessaire (email, nom, contrats)
- Pas de tracking publicitaire
- Cookies strictement nécessaires (localStorage uniquement)

---

## ⚠️ POINTS À AMÉLIORER (CRITIQUES)

### 1. Sécurité des mots de passe

**PROBLÈME** : Aucune politique de complexité des mots de passe
```typescript
// BackEnd/src/routes/auth.ts - ligne 68
if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
// ⚠️ Pas de validation de longueur minimale ou complexité
```

**RECOMMANDATION DPO** :
- Minimum 12 caractères (ANSSI 2026)
- Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
- Vérification contre les mots de passe courants (liste HIBP)

---

### 2. Gestion des sessions et tokens

**PROBLÈME** : Tokens JWT stockés en localStorage (vulnérable XSS)
```typescript
// FrontEnd/services/authService.ts
localStorage.setItem('assurclair_token', token);
// ⚠️ Accessible via JavaScript → risque XSS
```

**RECOMMANDATION CYBERSÉCU** :
- Utiliser **httpOnly cookies** pour le token
- Implémenter un **refresh token** (rotation)
- Limiter la durée de session (actuellement 7 jours = trop long)

---

### 3. Limitation du taux de requêtes (Rate Limiting)

**PROBLÈME** : Aucune protection contre les attaques par force brute
```typescript
// BackEnd/src/routes/auth.ts - login
// ⚠️ Pas de rate limiting sur /api/auth/login
// Un attaquant peut tenter des milliers de mots de passe
```

**RECOMMANDATION CYBERSÉCU** :
- Implémenter **express-rate-limit**
- Max 5 tentatives de login par IP/15 minutes
- Max 10 tentatives de register par IP/heure
- Captcha après 3 échecs

---

### 4. Logs et traçabilité

**PROBLÈME** : Logs insuffisants pour audit RGPD
```typescript
// Logs actuels :
console.error(err); // Trop générique
// ⚠️ Manque : qui a accédé à quelles données, quand, depuis où
```

**RECOMMANDATION DPO** :
- Logger tous les accès aux données personnelles
- Format : [timestamp] [user_id] [action] [resource] [ip] [user_agent]
- Rétention 12 mois minimum (obligation légale)
- Anonymisation après 3 ans

---

### 5. Suppression effective des données

**PROBLÈME** : Suppression de compte non implémentée côté API
```typescript
// BackEnd/src/routes/auth.ts
// ⚠️ Aucune route DELETE /api/auth/user/:id
// CGU mentionne la suppression mais pas d'endpoint
```

**RECOMMANDATION DPO (CRITIQUE)** :
- Créer route DELETE pour suppression complète
- Hard delete : suppression définitive de toutes les données
- Logs conservés 12 mois puis suppression
- Confirmation email avant suppression irréversible

---

### 6. Chiffrement des données sensibles en base

**PROBLÈME** : Documents PDF stockés en base64 non chiffrés
```sql
-- BackEnd/schema.sql
document_data TEXT, -- ⚠️ Stocké en clair (base64 ≠ chiffrement)
```

**RECOMMANDATION CYBERSÉCU** :
- Chiffrer les documents avec AES-256 avant stockage
- Clé de chiffrement dans Azure Key Vault
- Ou utiliser Azure Blob Storage avec chiffrement natif

---

### 7. Protection CSRF (Cross-Site Request Forgery)

**PROBLÈME** : Aucune protection CSRF sur les routes POST/PUT/DELETE
```typescript
// BackEnd/src/index.ts
// ⚠️ Pas de middleware csurf
```

**RECOMMANDATION CYBERSÉCU** :
- Implémenter **csurf** middleware
- Tokens CSRF dans les formulaires
- Vérification de l'origine des requêtes

---

### 8. Validation et sanitization des entrées

**PROBLÈME** : Validation minimale, risque d'injection
```typescript
// BackEnd/src/routes/policies.ts
const { contractNumber, insurer, type, premium } = req.body;
// ⚠️ Pas de validation de format, longueur, caractères autorisés
```

**RECOMMANDATION CYBERSÉCU** :
- Utiliser **express-validator** ou **joi**
- Sanitizer tous les inputs (trim, escape)
- Valider les types, formats, longueurs
- Protection SQL injection (déjà ok avec parameterized queries)

---

### 9. Politique de conservation des données

**PROBLÈME** : Pas de suppression automatique après inactivité
```typescript
// CGU mentionne "3 ans après dernière connexion" mais pas implémenté
```

**RECOMMANDATION DPO** :
- Implémenter job cron pour suppression auto
- Alerte email 30 jours avant suppression
- Table `last_login_at` pour tracking

---

### 10. Consentement pour services tiers (Gemini AI)

**PROBLÈME** : Données envoyées à Google sans consentement spécifique
```typescript
// BackEnd/src/services/geminiService.ts
await model.generateContent(prompt);
// ⚠️ Envoie le contenu des PDF à Google
```

**RECOMMANDATION DPO (CRITIQUE)** :
- Ajouter consentement explicite pour traitement par Gemini
- Checkbox séparée : "J'accepte que mes documents soient analysés par Google Gemini"
- Possibilité d'opt-out (mode dégradé sans IA)
- Mettre à jour Politique de confidentialité avec DPA Google

---

### 11. Analyse d'impact (DPIA)

**PROBLÈME** : Pas de DPIA alors que traitement automatisé + données sensibles
```
Traitement à risque élevé :
- Analyse automatisée de contrats d'assurance
- Décisions assistées par IA (économies, lacunes)
- Données financières (primes, revenus)
```

**RECOMMANDATION DPO (OBLIGATOIRE)** :
- Réaliser une DPIA complète (RGPD Art. 35)
- Documenter les risques et mesures d'atténuation
- Validation par DPO externe si nécessaire

---

### 12. Gestion des incidents de sécurité

**PROBLÈME** : Aucune procédure de notification de breach
```
RGPD Art. 33 : Notification CNIL sous 72h en cas de violation
```

**RECOMMANDATION DPO** :
- Procédure écrite de gestion des incidents
- Contact CNIL : https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles
- Registre des violations
- Plan de continuité d'activité (PCA)

---

### 13. Sécurité de la base PostgreSQL

**PROBLÈME** : Connexion en clair (pas de SSL/TLS vérifié)
```typescript
// BackEnd/src/db.ts
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  // ⚠️ Pas de ssl: true ou sslmode: 'require'
});
```

**RECOMMANDATION CYBERSÉCU** :
- Activer SSL/TLS pour connexion PostgreSQL
- Certificats Azure PostgreSQL validés
- Firewall PostgreSQL restrictif (IP whitelisting)

---

### 14. Headers de sécurité HTTP

**PROBLÈME** : Headers de sécurité manquants
```typescript
// BackEnd/src/index.ts
// ⚠️ Pas de helmet middleware
```

**RECOMMANDATION CYBERSÉCU** :
- Implémenter **helmet.js**
- Headers : X-Frame-Options, X-Content-Type-Options, CSP, HSTS
- Désactiver X-Powered-By (cache la techno)

---

### 15. Gestion des erreurs et fuites d'informations

**PROBLÈME** : Messages d'erreur trop verbeux en production
```typescript
res.status(500).json({ message: 'Server error' });
console.error(err); // ⚠️ Stack trace complet en prod
```

**RECOMMANDATION CYBERSÉCU** :
- Messages d'erreur génériques pour l'utilisateur
- Stack traces uniquement en développement
- Logger les détails côté serveur (pas client)

---

## 📊 SCORING GLOBAL

| Catégorie | Score | Commentaire |
|-----------|-------|-------------|
| **RGPD - Transparence** | ✅ 9/10 | Excellente documentation |
| **RGPD - Droits** | ⚠️ 6/10 | Suppression non implémentée |
| **RGPD - Consentement** | ⚠️ 7/10 | Manque opt-out Gemini |
| **RGPD - Sécurité** | ⚠️ 6/10 | Chiffrement incomplet |
| **Cybersécu - Auth** | ⚠️ 5/10 | Pas de rate limiting |
| **Cybersécu - Data** | ⚠️ 6/10 | Documents non chiffrés |
| **Cybersécu - Network** | ⚠️ 5/10 | Headers sécurité manquants |
| **Auditabilité** | ⚠️ 4/10 | Logs insuffisants |

**Score global : 6/10** - Acceptable mais nécessite améliorations avant mise en production

---

## 🚨 ACTIONS PRIORITAIRES (AVANT PRODUCTION)

### P0 - CRITIQUE (Bloquant production)
1. ✅ Implémenter suppression de compte (route API + UI)
2. ✅ Ajouter consentement spécifique Gemini AI
3. ✅ Réaliser DPIA (Documentation RGPD obligatoire)
4. ✅ Activer SSL/TLS PostgreSQL
5. ✅ Implémenter rate limiting (login/register)

### P1 - HAUTE (Dans les 2 semaines)
6. ✅ Politique de mots de passe robuste
7. ✅ Migration localStorage → httpOnly cookies
8. ✅ Chiffrement des documents (AES-256 ou Azure Blob)
9. ✅ Headers de sécurité (helmet.js)
10. ✅ Logs d'audit complets

### P2 - MOYENNE (Dans le mois)
11. ✅ Protection CSRF
12. ✅ Validation stricte des inputs (express-validator)
13. ✅ Job cron suppression automatique (inactivité 3 ans)
14. ✅ Procédure de gestion des incidents
15. ✅ Refresh tokens + rotation

### P3 - BASSE (Amélioration continue)
16. Tests de pénétration (pentest)
17. Audit externe de sécurité
18. Certification ISO 27001 (optionnel)
19. Bug bounty program
20. Formation RGPD de l'équipe

---

## 📄 DOCUMENTS À PRODUIRE

1. **Registre des traitements** (RGPD Art. 30) - Obligatoire
2. **DPIA** (Analyse d'impact) - Obligatoire si risque élevé
3. **DPA Google Gemini** (Data Processing Agreement)
4. **Politique de sécurité** (ISO 27001 style)
5. **Plan de réponse aux incidents** (Breach notification)
6. **Mentions légales** site web
7. **Guide utilisateur** exercice des droits RGPD

---

## 🔍 CONFORMITÉ PAR RAPPORT AUX STANDARDS

| Standard | Statut | Commentaire |
|----------|--------|-------------|
| **RGPD (2016/679)** | ⚠️ Partiellement conforme | Manque DPIA + suppression |
| **CNIL (Recommandations 2026)** | ⚠️ À améliorer | Mots de passe faibles |
| **ANSSI (Guide hygiene info)** | ⚠️ Insuffisant | Rate limiting manquant |
| **ISO 27001** | ❌ Non conforme | Pas de SMSI documenté |
| **OWASP Top 10 (2025)** | ⚠️ Vulnérabilités mineures | XSS, CSRF, Rate limiting |
| **PCI-DSS** | ✅ N/A | Pas de traitement CB |

---

## 💡 RECOMMANDATIONS ADDITIONNELLES

1. **Nommer un DPO** (Data Protection Officer) :
   - Obligatoire si traitement à grande échelle
   - Peut être externe (cabinet spécialisé)
   - Budget : 2000-5000€/an pour PME

2. **Souscrire une cyber-assurance** :
   - Couverture responsabilité civile cyber
   - Protection juridique en cas de breach
   - Budget : 1000-3000€/an

3. **Audits réguliers** :
   - Audit de sécurité : tous les 6 mois
   - Pentest : annuel
   - Revue RGPD : annuelle

4. **Formation équipe** :
   - Sensibilisation RGPD (1 jour/an)
   - Secure coding (développeurs)
   - Gestion des incidents (support)

---

## ✅ CHECKLIST DE MISE EN CONFORMITÉ

```
Phase 1 - Bloquants (Semaine 1-2)
[ ] Route DELETE /api/auth/user/:id implémentée
[ ] Checkbox consentement Gemini AI ajoutée
[ ] DPIA rédigée et validée
[ ] SSL/TLS PostgreSQL activé
[ ] Rate limiting sur /auth/* routes

Phase 2 - Sécurité critique (Semaine 3-4)
[ ] Validation mots de passe (12 chars mini)
[ ] Migration vers httpOnly cookies
[ ] Helmet.js configuré
[ ] Logs d'audit complets
[ ] Chiffrement documents (AES-256)

Phase 3 - Finitions (Mois 2)
[ ] Protection CSRF
[ ] Express-validator sur toutes les routes
[ ] Job cron suppression auto (3 ans inactivité)
[ ] Procédure gestion incidents documentée
[ ] Refresh tokens implémentés

Phase 4 - Documentation (Mois 2)
[ ] Registre des traitements RGPD
[ ] DPA Google Gemini signé
[ ] Politique de sécurité publiée
[ ] Guide exercice droits RGPD

Phase 5 - Validation (Mois 3)
[ ] Pentest externe réalisé
[ ] Audit RGPD externe
[ ] Certification obtenue (optionnel)
[ ] Go/No-Go production
```

---

## 📞 CONTACTS UTILES

- **CNIL** : 01 53 73 22 22 | https://www.cnil.fr
- **ANSSI** : https://cyber.gouv.fr
- **DPO Externe** : Annuaire AFCDP (https://www.afcdp.net)
- **Cyber-assurance** : Hiscox, AXA, Generali
- **Pentest** : OPPIDA, Lexsi, Sysdream

---

## 🎯 CONCLUSION

**État actuel** : Le projet BienCouvert a une **bonne base** en matière de RGPD (documentation claire, consentement, hébergement EU) mais présente des **lacunes critiques** en cybersécurité (rate limiting, chiffrement, suppression de compte).

**Recommandation** : **REPORT DE PRODUCTION** de 4-6 semaines pour mise en conformité complète. Le déploiement actuel en production exposerait l'entreprise à :
- Sanctions CNIL (jusqu'à 20M€ ou 4% CA mondial)
- Risques cyber (brute force, vol de données)
- Responsabilité civile en cas de breach

**Budget conformité estimé** : 15 000 - 25 000€
- Développement corrections : 10j × 600€ = 6 000€
- DPIA + Audit RGPD : 3 000€
- Pentest : 4 000€
- DPO externe (1 an) : 3 000€
- Cyber-assurance : 2 000€
- Formation équipe : 2 000€

**Délai mise en conformité** : 6-8 semaines avec équipe dédiée.
