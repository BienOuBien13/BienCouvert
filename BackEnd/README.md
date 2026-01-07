AssurClair - Backend

This is a minimal backend for the AssurClair frontend.

Quick start:

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want AI features.
2. Install dependencies: `npm install` inside `BackEnd` folder. If you want to enable real Gemini AI calls, also run `npm install @google/genai`.
3. Start in dev: `npm run dev` (requires `ts-node` and `nodemon`).

Note: `@google/genai` is optional for local prototyping. If it is not installed or `GEMINI_API_KEY` is not set, AI endpoints will return safe mock responses.

Available endpoints:

- POST /api/auth/register { email, password }
- POST /api/auth/login { email, password }
- POST /api/auth/reset { email, newPassword }
- GET /api/auth/me (Bearer token required)

- GET /api/policies?userId=...  -> list
- POST /api/policies (form-data with optional file) -> create
- PUT /api/policies/:id -> update (form-data)
- DELETE /api/policies/:id -> delete
- POST /api/policies/search { provider, type, name }
- POST /api/policies/detect-duplicates { policies }

Notes:
- Storage is simple file-based JSON under `BackEnd/data` for prototyping.
- AI helpers use GEMINI_API_KEY (if present) or return simulated responses.

---

FR — Documentation du stockage des données
- Emplacement des fichiers de données : `BackEnd/data/` (créé automatiquement à l'exécution).
- Fichiers principaux : `users.json` (liste d'utilisateurs) et `policies.json` (liste de polices/contrats).
- Format : JSON (tableaux d'objets). Pour préserver la compatibilité, ces fichiers restent valides JSON (pas de commentaires in-file). Les commentaires et le schéma sont documentés ci‑dessous.
- Schéma simplifié :
  - users.json : [{ "id": string, "email": string, "passwordHash": string, "name"?: string, "createdAt": number }]
  - policies.json : [{ "id": string, "userId": string, "name": string, "provider": string, "type": string, "fileData"?: string|null, "fileName"?: string|null, "mimeType"?: string, "summary"?: string, "addedAt": number }]
- Sécurité et limitations : Ce stockage par fichier est adapté pour le prototypage mais n'est pas destiné à la production (pas de verrouillage des accès, pas de journalisation des modifications, pas de sauvegardes automatisées). Pour la production, migrer vers une base de données (SQLite/Postgres/MongoDB) et chiffrer/hasher les données sensibles.
- Besoin d'aide pour migrer ? Dites‑moi quelle base de données vous préférez et je peux fournir un plan de migration et les scripts nécessaires.

---

FR — Documentation API (exemples simplifiés)
- POST /api/policies (form-data ou multipart)
  - Champs acceptés : `name`, `provider`, `type`, `coverageDetail`, `mimeType`, `userId`, `sourceUrl`, `summary`.
  - Pour joindre un fichier : envoyer `file` (multipart). Alternativement, envoyer `fileData` (base64) et `fileName` dans le body.
  - Réponse : l'objet `policy` créé (incluant `id`, `addedAt` et éventuellement `summary`).

- PUT /api/policies/:id (form-data)
  - Met à jour les champs d'une police existante ; accepte les mêmes champs que POST.
  - Réponse : l'objet `policy` mis à jour.

- DELETE /api/policies/:id
  - Supprime la police et retourne `{ ok: true }`.

- POST /api/policies/search { provider, type, name }
  - Retourne un objet `{ summary, sourceUrl, detectedFormulas }` venant du service AI ou d'une simulation.

- POST /api/policies/summarize { fileBase64, mimeType }
  - Retourne `{ summary }`.

- POST /api/policies/detect-duplicates { policies }
  - Attends un tableau de polices et retourne un tableau d'objets { title, description, severity, involvedPolicies }.

Note : le frontend actuel (FrontEnd/services/*) appelle ces endpoints en respectant les formats décrits ci-dessus.
