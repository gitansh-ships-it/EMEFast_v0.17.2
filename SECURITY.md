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
- **Demo API Scope**: The public demo API (`backend/mock-server.mjs`) is an unauthenticated coordination engine with mock credentials and synthetic data. It accepts any credentials, does not enforce authentication or RBAC, and does not conduct security testing.
- **Reference Backend Implementation**: Role-based access control and token handling are defined in the reference FastAPI backend (`backend/auth.py` and `backend/routers/auth.py`) using bcrypt password hashing and signed JWT tokens (`pyjwt`).
- **Role Hierarchy (Reference Architecture)**:
  - `ADMIN`: Operational metrics, system auditing, and hospital verification (`/api/admin/*`).
  - `HOSPITAL`: Hospital emergency operations desk (`/api/hospitals/{id}/*`) with facility-matching ownership checks.
  - `USER`: Paramedic/bystander coordination for case creation, hospital selection, and resource reservation.

### 2.3 CORS Policies
- In the reference FastAPI backend (`backend/main.py`), CORS origins can be strictly restricted to the authorized domain, rejecting wildcard origins when configured for production.

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
