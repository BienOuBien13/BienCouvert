# AssurClair — Deployment Rules & CI/CD Guide

> Last updated: 2025  
> Azure VM: `52.143.159.51`  
> Docker-based deployment via GitHub Actions

---

## Table of Contents

1. [Branching Strategy](#1-branching-strategy)
2. [CI/CD Pipeline Overview](#2-cicd-pipeline-overview)
3. [Required GitHub Secrets](#3-required-github-secrets)
4. [Pre-Deploy Checklist](#4-pre-deploy-checklist)
5. [Database Migration Procedure](#5-database-migration-procedure)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Deployment Steps (Manual)](#7-deployment-steps-manual)
8. [Post-Deploy Validation](#8-post-deploy-validation)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Health Check Endpoints](#10-health-check-endpoints)

---

## 1. Branching Strategy

| Branch       | Purpose                          | Triggers deploy? |
|--------------|----------------------------------|-----------------|
| `main`       | Production-ready code            | Yes (automatic) |
| `develop`    | Integration branch               | No              |
| `feature/*`  | Feature branches                 | No              |
| `fix/*`      | Bug fix branches                 | No              |

**Rule:** No direct push to `main`. All changes go through Pull Requests. Merging to `main` triggers the full CI/CD pipeline.

---

## 2. CI/CD Pipeline Overview

File: `.github/workflows/ci.yml`

```
┌──────────────────────────────────────────────────────┐
│  Push / PR to main                                   │
│                                                      │
│  ┌───────────────┐    ┌───────────────────────────┐  │
│  │ backend-ci    │    │ frontend-ci               │  │
│  │               │    │                           │  │
│  │ npm ci        │    │ npm ci                    │  │
│  │ tsc --noEmit  │    │ tsc --noEmit              │  │
│  │ tsc (build)   │    │ vite build                │  │
│  └──────┬────────┘    └────────────┬──────────────┘  │
│         │                          │                 │
│         └──────────┬───────────────┘                 │
│                    ▼                                  │
│          ┌──────────────────┐                        │
│          │  docker-build    │  (main only)           │
│          │  Build image     │                        │
│          │  (no push, CI    │                        │
│          │   validation)    │                        │
│          └────────┬─────────┘                        │
│                   │                                  │
│                   ▼                                  │
│          ┌──────────────────┐                        │
│          │  deploy          │  (main push only)      │
│          │  SSH → Azure VM  │                        │
│          │  git pull        │                        │
│          │  docker compose  │                        │
│          └──────────────────┘                        │
└──────────────────────────────────────────────────────┘
```

**Jobs summary:**
- `backend-ci` — TypeCheck + Build (always runs)
- `frontend-ci` — TypeCheck + Vite build (always runs)
- `security-audit` — npm audit at `high` level (always runs)
- `docker-build` — Docker image validation (main push only)
- `deploy` — SSH deploy to Azure VM (main push only, requires all prior jobs to pass)

---

## 3. Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions** on the GitHub repository.

| Secret name       | Value                                        | Used by             |
|-------------------|----------------------------------------------|---------------------|
| `VM_HOST`         | `52.143.159.51`                              | `deploy` job        |
| `VM_USER`         | `VMRemi19821982`                             | `deploy` job        |
| `VM_SSH_KEY`      | Private SSH key content (PEM format)         | `deploy` job        |

### How to add the SSH key secret

```bash
# On the Azure VM, generate a key pair if not already done:
ssh-keygen -t ed25519 -C "github-actions@assurclair" -f ~/.ssh/github_actions
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Then copy the private key content to paste as the VM_SSH_KEY secret:
cat ~/.ssh/github_actions
```

---

## 4. Pre-Deploy Checklist

Before merging to `main`:

- [ ] All TypeScript errors resolved (`npm run typecheck` in BackEnd and FrontEnd)
- [ ] New database migration file created in `BackEnd/migrations/` (if schema changed)
- [ ] Migration tested locally or on dev database
- [ ] `.env.production` updated on the VM (if new env vars added)
- [ ] `docker-compose.yml` updated (if new services or ports changed)
- [ ] `nginx-azure.conf` updated (if new routes added)
- [ ] PR reviewed and approved

---

## 5. Database Migration Procedure

**Rule: Always run migrations BEFORE deploying new application code.**

### Step 1 — Create the migration file

Name format: `BackEnd/migrations/0XX_description.sql`  
Example: `BackEnd/migrations/017_add_status_field.sql`

### Step 2 — Create the runner script

```js
// BackEnd/run-migration-017.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations/017_add_status_field.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration 017 applied');
  await pool.end();
}

migrate().catch(console.error);
```

### Step 3 — Run on the Azure VM

```bash
ssh VMRemi19821982@52.143.159.51
cd ~/AssurClair
DATABASE_URL="postgresql://..." node BackEnd/run-migration-017.js
```

### Step 4 — Then deploy application

Only after confirming migration success.

### Applied migrations log

| Migration | Description                                      | Status  |
|-----------|--------------------------------------------------|---------|
| 001–014   | Initial schema, insurers, insurance types, etc.  | Applied |
| 015       | insurance_sub_types, document_types tables       | Applied |
| 016       | pdf_file_path on central_cg and user_cg          | Applied |

---

## 6. Environment Variables Reference

### BackEnd (`BackEnd/.env` or set in `docker-compose.yml`)

| Variable              | Required | Default                       | Description                          |
|-----------------------|----------|-------------------------------|--------------------------------------|
| `DATABASE_URL`        | Yes      | —                             | PostgreSQL connection string         |
| `GEMINI_API_KEY`      | Yes      | —                             | Google Gemini API key (embeddings)   |
| `JWT_SECRET`          | Yes      | —                             | JWT signing secret (min 32 chars)    |
| `PORT`                | No       | `3000`                        | HTTP port                            |
| `PDF_STORAGE_DIR`     | No       | `./pdf-storage`               | Filesystem path for uploaded PDFs    |
| `NODE_ENV`            | No       | `development`                 | Set to `production` in prod          |
| `CORS_ORIGIN`         | No       | `*`                           | Allowed CORS origin(s)               |

### FrontEnd (build-time env, `.env.production`)

| Variable              | Required | Example                            | Description                    |
|-----------------------|----------|------------------------------------|--------------------------------|
| `VITE_API_URL`        | Yes      | `https://52.143.159.51/api`        | Backend API base URL           |
| `VITE_API_BASE_URL`   | No       | same as above                      | Alternative API URL key        |

---

## 7. Deployment Steps (Manual)

Use when the pipeline is not available or for emergency deploys.

```bash
# 1. Connect to VM
ssh VMRemi19821982@52.143.159.51

# 2. Pull latest code (source)
cd ~/AssurClair
git pull origin main

# 3. Sync to build directory
rsync -a --delete ~/AssurClair/ /opt/assurclair/

# 4. Run any pending migrations
cd /opt/assurclair
node BackEnd/run-migration-0XX.js

# 5. Rebuild and restart backend
docker compose build backend
docker compose up -d backend

# 6. Build and deploy frontend
cd /opt/assurclair/FrontEnd
npm ci --omit=dev
npx vite build
sudo cp -r dist/* /var/www/assurclair/

# 6. Reload nginx (if config changed)
sudo nginx -t && sudo systemctl reload nginx

# 7. Verify
curl -s http://localhost:3000/api/health
```

---

## 8. Post-Deploy Validation

Run these checks after every deployment:

```bash
# Health check
curl https://52.143.159.51/api/health

# Insurance types (master data)
curl https://52.143.159.51/api/masterdata/insurance-types

# Backend container status
docker ps | grep backend

# Backend logs (last 50 lines)
docker compose logs --tail=50 backend
```

Expected HTTP responses: `200 OK` for all curl commands.

---

## 9. Rollback Procedure

### Application rollback

```bash
ssh VMRemi19821982@52.143.159.51
cd ~/AssurClair

# Identify last working commit
git log --oneline -10

# Roll back to specific commit
git checkout <commit-sha>

# Rebuild
docker compose build backend
docker compose up -d backend
```

### Database rollback

If a migration added columns (non-destructive), rollback by reverting the column if needed:

```sql
-- Example: undo migration 016
ALTER TABLE central_cg DROP COLUMN IF EXISTS pdf_file_path;
ALTER TABLE user_cg DROP COLUMN IF EXISTS pdf_file_path;
```

**Rule:** Never drop tables or remove enum values in rollbacks — only alter columns. Destructive rollbacks require a maintenance window.

---

## 10. Health Check Endpoints

| Endpoint                                   | Expected response     | Purpose                          |
|--------------------------------------------|-----------------------|----------------------------------|
| `GET /api/health`                          | `200 { status: "ok" }`| Backend alive                    |
| `GET /api/masterdata/insurance-types`      | `200 [ ... ]`         | DB connectivity + master data    |
| `GET /api/masterdata/document-types`       | `200 [ ... ]`         | Document types accessible        |
| `GET /api/masterdata/insurance-sub-types`  | `200 [ ... ]`         | Sub types accessible             |

---

## Appendix — Pipeline troubleshooting

| Issue                              | Fix                                                      |
|------------------------------------|----------------------------------------------------------|
| `npm ci` fails                     | Lock file out of sync — run `npm install` locally, commit `package-lock.json` |
| TypeScript error on CI             | Run `npm run typecheck` locally and fix errors before pushing |
| Docker build fails                 | Check `Dockerfile` COPY paths match actual file structure |
| SSH deploy fails: auth             | Verify `VM_SSH_KEY` secret contains full private key including header/footer |
| SSH deploy fails: path             | Ensure `~/AssurClair` exists on VM and user has write access |
| Nginx 502 after deploy             | Backend container failed to start — check `docker compose logs backend` |
