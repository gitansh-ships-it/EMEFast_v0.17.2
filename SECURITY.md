# Security Policy

## 1. Prototype & Medical Disclaimer

> **IMPORTANT DISCLAIMER:**  
> **EMEFast is a research, competition, and prototype emergency coordination platform.** It is **not** a certified medical device, does not provide clinical diagnosis, and is **not** a replacement for official emergency services (such as 108/112 in India, 911 in the US, or 999 in the UK), licensed paramedics, or certified emergency dispatch infrastructure.

Integrations such as Ayushman Bharat Digital Mission (ABDM) / Ayushman Bharat Health Account (ABHA) require formal government certification, approved Sandbox/Production credentials, patient consent artifacts, and compliant healthcare information provider (HIP/HIU) gateways.

---

## 2. Security Controls & Architecture

### 2.1 Secret Management
- **Zero Committed Credentials**: Production secrets (`JWT_SECRET`, database connection strings) must never be committed to source control.
- **Environment Isolation**: All credentials are injected via environment variables configured in `render.yaml` or Vercel project settings.
- **Automated Generation**: Render generates a secure 32+ character random `JWT_SECRET` during initial deployment.

### 2.2 Authentication & Role-Based Access Control (RBAC)
- **Authentication Implementation**: Implemented in `backend/auth.py` and `backend/routers/auth.py` using bcrypt password hashing and signed JWT tokens (`pyjwt`).
- **Role Hierarchy & Enforcement**:
  - `ADMIN`: Full access to operational metrics, system auditing, and hospital verification (`/api/admin/*`).
  - `HOSPITAL`: Hospital emergency operations desk (`/api/hospitals/{id}/*`). Strictly enforces facility-matching ownership checks: a hospital operator cannot view incoming queues, accept, or release resources for a different facility ID.
  - `USER`: Paramedi/bystander coordination for case creation, hospital selection, and resource reservation.
- **Production vs. Development Enforcement**:
  - In `ENVIRONMENT=production`: Every protected route strictly validates JWT bearer tokens, checks role claims, and enforces tenant isolation. Unauthenticated or mis-matched calls receive `401 Unauthorized` or `403 Forbidden`. Default development secrets and SQLite are explicitly rejected at startup.
  - In `development` / `demo` mode (`DEMO_MODE=1`): If no Authorization header is supplied, the system logs a debug warning and provides an automated demo actor context to facilitate local hackathon evaluation. Invalid or malformed tokens continue to be strictly rejected.

### 2.3 CORS Policies
- In production (`ENVIRONMENT=production`), CORS origins are strictly restricted to the authorized Vercel domain (`https://frontend-v2-seven-chi.vercel.app`).
- Wildcard `*` origins are automatically rejected in production by `backend/main.py`.

### 2.4 Input Validation & Payload Safeguards
- All incoming payloads are strictly validated using Pydantic v2 schemas (`backend/schemas/`).
- Audio voice recording uploads (`/api/emergency/{id}/voice-note`) are capped at **15 MB** and validated against authorized audio MIME types (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`, `audio/mpeg`).

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability within the EMEFast platform, please report it responsibly:

1. **Do not create a public GitHub issue.**
2. Please submit a private security advisory through the repository's GitHub **Security** tab under **Advisories** -> **Report a vulnerability**.
3. Include detailed steps to reproduce the issue, proof of concept payloads, and the affected endpoint.
4. Maintainers will acknowledge receipt within 48 hours and coordinate remediation.
