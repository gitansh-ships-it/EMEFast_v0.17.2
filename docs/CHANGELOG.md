# Changelog

All notable technical milestones for **EMEFast** are documented in this file.

---

## Releases & Milestones

### v1.0.0 — Production Architecture & Hardening (2026-09-20)
- **Deployment Architecture**: Configured FastAPI & PostgreSQL deployment on Render alongside Next.js PWA edge deployment on Vercel.
- **Resource Concurrency Engine**: Implemented database row-level locking (`SELECT FOR UPDATE`) with in-process async serialization and automatic 15-minute reservation cleanup.
- **Verification Suites**: Added automated router integrity suite (`backend/verify.py`) and E2E integration test suite (`test_emefast_e2e.py`).
- **UI & Contrast Refinement**: Standardized dark theme (`#050505`) with WCAG AA compliance across clinical dashboards and responsive layouts.
- **Documentation**: Established system architecture, API specifications, and database entity models under `docs/`.

### v0.9.0 — Telemetry & Triage Workflows (2026-09-16)
- **Audio Telemetry**: Paramedic voice recording via browser `MediaRecorder` API with ER desk playback.
- **Road Mapping**: Leaflet and OpenStreetMap integration with OSRM turn-by-turn routing (no proprietary API key required).
- **Triage Workflows**: Multi-hospital alert broadcast with required clinical rejection justification.
- **SOS Trigger**: 3-second sustained hold emergency activation button with haptic feedback.
- **Location Guard**: 100m GPS accuracy gate to prevent inaccurate location broadcasts.

### v0.8.0 — Initial Prototype (2026-09-10)
- **Scaffold**: Next.js 15 App Router frontend with standalone Node.js coordination mock server.
- **Matching Engine**: Clinical capability evaluation (ICU, trauma, ventilator, cardiac, neuro, pediatric) before distance ranking.
- **Workspaces**: Dedicated operational views for Paramedics, Hospital ER desks, and Network Admins.
