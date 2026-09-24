# EMEFast Production Deployment Guide

## 1. Deployment Architecture Overview

- **Frontend (Live Demo)**: Next.js 15 PWA hosted on **Vercel** (`https://frontend-v2-seven-chi.vercel.app`).
- **Active Demo API**: Zero-dependency coordination engine (`backend/mock-server.mjs`) serving synthetic data without authentication enforcement.
- **Reference Backend Architecture**: FastAPI (Python 3.12) with managed PostgreSQL (`emefast-db`), async row locks, and JWT authentication automated via [`render.yaml`](../render.yaml).
- **Domain & SSL**: Automatic TLS termination via Vercel Edge and Render reverse proxies.

---

## 2. Render Backend Deployment

Deploying the FastAPI backend is automated via the repository's [`render.yaml`](../render.yaml) blueprint:

```yaml
services:
  - type: web
    name: emefast-backend
    runtime: python
    region: oregon
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: emefast-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: CORS_ORIGINS
        value: https://frontend-v2-seven-chi.vercel.app
      - key: DEMO_MODE
        value: "0"
      - key: ENVIRONMENT
        value: production

databases:
  - name: emefast-db
    plan: free
    region: oregon
    databaseName: emefast
    user: emefast_user
```

### Steps to Deploy:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **Blueprints** > **New Blueprint Instance**.
3. Connect repository `gitansh-ships-it/emefast-v17`.
4. Render detects `render.yaml` and provisions both the Python Web Service and PostgreSQL database.
5. Verify startup health check at `https://<your-service>.onrender.com/health` (must return `{"status": "ONLINE"}`).

---

## 3. Vercel Frontend Deployment

Vercel automatically configures the Next.js App Router using [`vercel.json`](../vercel.json):

```json
{
  "buildCommand": "npm --prefix frontend-v2 run build",
  "installCommand": "npm --prefix frontend-v2 install --no-audit --no-fund",
  "framework": "nextjs",
  "outputDirectory": "frontend-v2/.next"
}
```

### Steps to Deploy:
1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **Add New Project** and import `gitansh-ships-it/emefast-v17`.
3. Set the Environment Variable:
   - `NEXT_PUBLIC_API_URL`: `https://emefast-v17.onrender.com/api` (points to the Render backend).
4. Deploy.

---

## 4. Environment Variables Checklist

### Backend (Render)
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Connection to Render PostgreSQL instance |
| `JWT_SECRET` | `[Auto-Generated 32+ chars]` | Secret key for signing authorization tokens |
| `CORS_ORIGINS` | `https://frontend-v2-seven-chi.vercel.app` | Whitelist frontend domain (no wildcard in prod) |
| `DEMO_MODE` | `0` | Disables automated mock responses; requires explicit hospital Accept/Decline |
| `ENVIRONMENT` | `production` | Enables strict security and secret enforcement |

### Frontend (Vercel)
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://emefast-v17.onrender.com/api` | Directs REST client to Render backend |

---

## 5. Production vs. Local Prototyping

| Feature | Production Mode | Local Mock Mode |
| :--- | :--- | :--- |
| **Engine** | Python 3.12 FastAPI (`backend/main.py`) | Node.js ES Module (`backend/mock-server.mjs`) |
| **Database** | Render Managed PostgreSQL | In-Memory JSON (`backend/emefast-demo.json`) |
| **Concurrency Guard** | Row-level locking (`SELECT ... FOR UPDATE`) | None (subject to race conditions) |
| **Execution** | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `node mock-server.mjs` |
