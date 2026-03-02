# AssurClair — CI/CD Test Plan

> **Version**: 1.0  
> **Date**: 2025  
> **Scope**: Build verification, application consistency, end-to-end pipeline tests

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Build Tests](#2-build-tests)
3. [App Consistency Tests](#3-app-consistency-tests)
4. [API Integration Tests](#4-api-integration-tests)
5. [Upload Pipeline Tests](#5-upload-pipeline-tests)
6. [End-to-End Tests](#6-end-to-end-tests)
7. [Running the Full CI Suite](#7-running-the-full-ci-suite)

---

## 1. Prerequisites

### Environment variables required (`.env` or CI secrets)

```
DATABASE_URL=postgresql://user:password@host:5432/assur_clair
GEMINI_API_KEY=<your-key>
AZURE_STORAGE_CONNECTION_STRING=<your-connection-string>
AZURE_STORAGE_CONTAINER_NAME=assur-clair-pdfs
JWT_SECRET=<your-secret>
PORT=3000
```

### Dependency installation

```bash
# Backend
cd BackEnd
npm ci

# Frontend
cd FrontEnd
npm ci
```

---

## 2. Build Tests

### 2.1 Backend TypeScript compilation

```bash
cd BackEnd
npx tsc --noEmit
```

**Expected**: Exit code `0`, no TypeScript errors.  
**Fails if**: Type mismatch, missing imports, syntax error.

---

### 2.2 Frontend Vite build

```bash
cd FrontEnd
npm run build
```

**Expected**: `dist/` directory created, exit code `0`.  
**Fails if**: TSX type errors, missing modules, broken imports.

---

### 2.3 Docker image build (optional — requires Docker)

```bash
docker build -t assur-clair-backend ./BackEnd
docker build -t assur-clair-frontend ./FrontEnd
```

**Expected**: Both images build successfully, no layer errors.

---

## 3. App Consistency Tests

### 3.1 Backend server starts

```bash
cd BackEnd
node -e "
const app = require('./dist/index.js');
setTimeout(() => { console.log('OK - server started'); process.exit(0); }, 2000);
" 2>&1 | grep -E "OK|Error|FATAL"
```

**Expected**: `Serveur démarré` log, no `FATAL` or uncaught exception.

---

### 3.2 Database connection check

```bash
cd BackEnd
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => {
  console.log('OK - DB connected');
  process.exit(0);
}).catch(e => {
  console.error('FAIL - DB:', e.message);
  process.exit(1);
});
"
```

**Expected**: `OK - DB connected`

---

### 3.3 Required tables exist

```sql
-- Run this against the DB in CI
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'policies', 'insurers', 'insurance_types',
    'central_cg', 'central_cg_pages', 'coverage_facts',
    'user_cg', 'user_cg_pages', 'user_coverage_facts'
  )
ORDER BY table_name;
```

**Expected**: 10 rows returned (all 10 table names present).

```bash
# CLI version
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public'
  AND table_name IN ('users','policies','insurers','insurance_types',
    'central_cg','central_cg_pages','coverage_facts',
    'user_cg','user_cg_pages','user_coverage_facts');
" | grep -E "^\s+10$" && echo "OK" || echo "FAIL - missing tables"
```

---

### 3.4 pgvector extension check

```sql
SELECT extname FROM pg_extension WHERE extname = 'vector';
```

**Expected**: `vector` row returned. Required for embedding search.

---

### 3.5 pdf-parse local extraction check

```bash
cd BackEnd
node -e "
const pdfParse = require('pdf-parse');
const fs = require('fs');
// Use any small test PDF
const buf = fs.readFileSync('./test-assets/sample.pdf');
pdfParse(buf).then(d => {
  if (d.text.length > 50) { console.log('OK - pdf-parse:', d.text.length, 'chars'); process.exit(0); }
  else { console.error('FAIL - pdf-parse: too short'); process.exit(1); }
}).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
"
```

**Expected**: `OK - pdf-parse: NNN chars`  
**Note**: Place a `sample.pdf` (any PDF) in `BackEnd/test-assets/` for this check.

---

## 4. API Integration Tests

> These require the backend running on `http://localhost:3000`.  
> Start with: `cd BackEnd && npm run dev &`

### 4.1 Health check

```bash
curl -sf http://localhost:3000/health | jq .
```

**Expected**: `{"status":"ok"}` or similar `200` response.

---

### 4.2 Auth — register + login

```bash
# Register
curl -sf -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ci-test@test.com","password":"Test1234!","nom":"CI","prenom":"Test"}' \
  | jq .message

# Login → capture token
TOKEN=$(curl -sf -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ci-test@test.com","password":"Test1234!"}' \
  | jq -r .token)

echo "Token: ${TOKEN:0:20}..."
```

**Expected**: Registration success, valid JWT token returned.

---

### 4.3 List insurers

```bash
curl -sf http://localhost:3000/api/admin/insurers \
  -H "Authorization: Bearer $TOKEN" | jq 'length'
```

**Expected**: Integer ≥ 0 (list returned, no 500 error).

---

### 4.4 List insurance types

```bash
curl -sf http://localhost:3000/api/admin/insurance-types \
  -H "Authorization: Bearer $TOKEN" | jq 'length'
```

**Expected**: Integer ≥ 0.

---

### 4.5 Search central CG — no error on 404

```bash
STATUS=$(curl -o /dev/null -sw "%{http_code}" \
  "http://localhost:3000/api/policies/central-cg?insurer=FAKE_INSURER&type=AUTO" \
  -H "Authorization: Bearer $TOKEN")

echo "Status: $STATUS"
[ "$STATUS" = "404" ] && echo "OK - 404 returned as expected" || echo "FAIL - unexpected status $STATUS"
```

**Expected**: `404` (not `500`). The frontend handles 404 gracefully via `isNoCgMode`.

---

### 4.6 Portfolio — add a policy without CG (isNoCgMode path)

```bash
curl -sf -X POST http://localhost:3000/api/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "name": "Auto CI Test",
    "insurerCode": "FAKE_INSURER",
    "insurance_type_code": "AUTO",
    "formula": "Tiers",
    "options": []
  }' | jq .id
```

**Expected**: Non-null numeric `id` — policy created without requiring `cg_id`.

---

## 5. Upload Pipeline Tests

### 5.1 Admin CG upload — central tables populated

```bash
# Upload a PDF as admin
RESPONSE=$(curl -sf -X POST http://localhost:3000/api/policies/central-cg \
  -H "Authorization: Bearer $TOKEN" \
  -F "pdf=@./test-assets/sample.pdf" \
  -F "provider=TEST_INSURER" \
  -F "type=AUTO")

echo "$RESPONSE" | jq .
CG_ID=$(echo "$RESPONSE" | jq -r .id)
echo "central_cg id: $CG_ID"

# Verify central_cg_pages populated
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM central_cg_pages WHERE cg_id = $CG_ID;"

# Verify coverage_facts populated
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM coverage_facts WHERE cg_id = $CG_ID;"
```

**Expected**:
- `central_cg` row with new `id`
- `central_cg_pages`: ≥ 1 row for that `cg_id`
- `coverage_facts`: ≥ 0 rows (may be 0 if PDF has no table)

---

### 5.2 User CG upload — user tables populated

```bash
# Upload user's CP (Conditions Particulières)
RESPONSE=$(curl -sf -X POST http://localhost:3000/api/cg/user/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policyId": 1,
    "pdfBase64": "'$(base64 -w0 ./test-assets/sample.pdf)'"
  }')

echo "$RESPONSE" | jq .
USER_CG_ID=$(echo "$RESPONSE" | jq -r .user_cg_id)

# Verify user_cg_pages populated
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM user_cg_pages WHERE user_cg_id = $USER_CG_ID;"

# Verify user_coverage_facts populated
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM user_coverage_facts WHERE user_cg_id = $USER_CG_ID;"
```

**Expected**:
- `user_cg` row created
- `user_cg_pages`: ≥ 1 row
- `user_coverage_facts`: ≥ 0 rows

---

### 5.3 Bulk upload dry-run

```bash
cd BackEnd
# Dry-run (no actual Gemini calls) — verify the script parses Excel without error
node bulk-upload-with-pages.js --dry-run 2>&1 | tail -20
```

**Expected**: No `FATAL` / uncaught exception, script reaches end of Excel parsing.  
**Note**: Implement `--dry-run` flag in `bulk-upload-with-pages.js` to skip Gemini calls in CI.

---

### 5.4 Gemini token reduction verification

After running the bulk upload script on a sample of 5 PDFs, verify in the logs:

```
✅ extractFullTextFromPdf: NNN chars local (0 token Gemini)
✅ extractPageText (pdfjs): page X/Y
💡 indexCgDocument: utilisation du texte pré-extrait (NNN chars) - 0 token PDF
```

**Expected**: All three log lines present — confirms no redundant Gemini PDF-binary calls.

---

## 6. End-to-End Tests

> Full user journey from registration to chat.  
> Requires backend + frontend running.

### 6.1 User registration → login → add policy (no CG in DB)

```
GIVEN: No central_cg exists for insurer "FAKE_CO" type "AUTO"
WHEN:  User navigates to "Ajouter un contrat"
AND:   Selects "AUTO" > "FAKE_CO"
THEN:  Step transitions to 'configure' without error
AND:   Amber info banner is visible ("Aucune Condition Générale trouvée")
AND:   Formula field shows a free-text input (not radio buttons)
WHEN:  User types "Tiers" in formula field and clicks "Ajouter au portefeuille"
THEN:  Policy is created in DB (HTTP 201)
AND:   User is redirected to portfolio with new policy visible
```

---

### 6.2 User uploads CP (Conditions Particulières)

```
GIVEN: User has policy in portfolio
WHEN:  User opens policy detail > uploads a PDF as CP
THEN:  Upload progress shows "Extraction du texte (locale)..." (NOT Gemini)
AND:   user_cg row created in DB
AND:   user_cg_pages populated (≥1 page)
AND:   upload completes without error
```

---

### 6.3 Admin uploads central CG via UI

```
GIVEN: Admin logged in on AdminView
WHEN:  Admin selects insurer + type + uploads PDF
THEN:  central_cg row created
AND:   central_cg_pages populated (≥1 page)
AND:   coverage_facts populated (may be 0 for simple PDF)
AND:   PDF appears in the CG list
```

---

### 6.4 Chat with context (RAG)

```
GIVEN: central_cg_pages exist for at least 1 CG
WHEN:  User sends chat message "Quelles sont les garanties incluses ?"
THEN:  HTTP 200 from /api/ai/chat
AND:   Response contains non-empty text
AND:   No "erreur" in response
```

---

## 7. Running the Full CI Suite

### Bash script — `ci-run.sh`

```bash
#!/bin/bash
set -e

echo "=== AssurClair CI Suite ==="

# 1. Install deps
echo "--- [1/5] Installing dependencies..."
(cd BackEnd && npm ci)
(cd FrontEnd && npm ci)

# 2. Build
echo "--- [2/5] Build tests..."
(cd BackEnd && npx tsc --noEmit) && echo "✅ Backend TS OK"
(cd FrontEnd && npm run build) && echo "✅ Frontend build OK"

# 3. DB checks
echo "--- [3/5] Database consistency..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','policies','insurers','insurance_types','central_cg','central_cg_pages','coverage_facts','user_cg','user_cg_pages','user_coverage_facts');" \
  | grep -q "10" && echo "✅ All 10 tables present" || (echo "❌ Missing tables"; exit 1)

# 4. API tests (backend must be running)
echo "--- [4/5] API integration tests..."
TOKEN=$(curl -sf -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ci-test@test.com","password":"Test1234!"}' | jq -r .token)

curl -sf http://localhost:3000/api/admin/insurers -H "Authorization: Bearer $TOKEN" > /dev/null && echo "✅ GET /insurers OK"

STATUS=$(curl -o /dev/null -sw "%{http_code}" \
  "http://localhost:3000/api/policies/central-cg?insurer=FAKE&type=AUTO" \
  -H "Authorization: Bearer $TOKEN")
[ "$STATUS" = "404" ] && echo "✅ 404 handled gracefully" || (echo "❌ Expected 404, got $STATUS"; exit 1)

# 5. Summary
echo "--- [5/5] Done ✅"
echo "All CI checks passed."
```

### GitHub Actions example (`.github/workflows/ci.yml`)

```yaml
name: CI

on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_DB: assur_clair
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/assur_clair
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      JWT_SECRET: test-secret-ci

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: BackEnd/package-lock.json

      - name: Install backend dependencies
        run: cd BackEnd && npm ci

      - name: Install frontend dependencies
        run: cd FrontEnd && npm ci

      - name: Run DB migrations
        run: cd BackEnd && node migrations/run-all.js
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}

      - name: TypeScript check (backend)
        run: cd BackEnd && npx tsc --noEmit

      - name: Build frontend
        run: cd FrontEnd && npm run build

      - name: Check DB tables
        run: |
          COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','policies','insurers','insurance_types','central_cg','central_cg_pages','coverage_facts','user_cg','user_cg_pages','user_coverage_facts');")
          [ "$COUNT" -eq 10 ] && echo "✅ Tables OK" || exit 1
```

---

## Appendix — Key Log Lines to Monitor

| Log | Meaning | OK value |
|-----|---------|----------|
| `✅ extractFullTextFromPdf: NNN chars local` | pdf-parse worked, 0 Gemini tokens | NNN ≥ 100 |
| `⚠️ pdf-parse: texte court — PDF probablement scanné` | Scanned PDF, Gemini fallback | Expected for image PDFs |
| `✅ extractPageText (pdfjs): page X/Y` | Local page extraction | All pages extracted |
| `💡 indexCgDocument: utilisation du texte pré-extrait` | No PDF binary sent to Gemini | After bulk upload |
| `❌ Erreur processDocument` | Bulk script failure | Should not appear |
| `isNoCgMode` (frontend console) | No CG in DB, graceful fallback | Expected for new insurers |
