AssurClair - Backend

This is a minimal backend for the AssurClair frontend.

Quick start:

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want AI features.
2. Install dependencies: `npm install` inside `BackEnd` folder.
3. Start in dev: `npm run dev` (requires `ts-node` and `nodemon`).

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
