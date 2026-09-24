# EMEFast Architecture Specification

## 1. System Overview

**EMEFast** (Emergency Medical Fast Response System) is a real-time emergency coordination platform engineered to bridge the critical gap between pre-hospital emergency care and hospital emergency departments (EDs).

> **CRITICAL ARCHITECTURAL BOUNDARY:**  
> EMEFast is an **Emergency Hospital Coordination Platform**, NOT an ambulance dispatch system. It coordinates ambulances that already exist, connecting the paramedic, medical operator, or bystander directly with capable, verified hospitals. It does not manage municipal vehicle fleets, dispatch 108 drivers, or assign fleet numbers.

---

## 2. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients ["Client Layer (PWA)"]
        UserPWA["Paramedic / Bystander PWA"]
        HospitalPWA["Hospital ER Desk PWA"]
        AdminPWA["System Admin Console"]
    end

    subgraph CDN ["Edge & Routing Layer"]
        VercelEdge["Vercel CDN Edge"]
        RenderGateway["Render Reverse Proxy (TLS Termination)"]
    end

    subgraph Backend ["Application Layer (FastAPI)"]
        FastAPI["FastAPI Application (Python 3.12 / Uvicorn)"]
        MatchEngine["Hospital Capability & Matching Engine"]
        ResourceLocker["Resource Concurrency & Locking Guard"]
        VoiceHandler["Voice Note & Storage Handler"]
        PollingSync["State Sync Engine (Active REST Polling)"]
    end

    subgraph Data ["Persistence Layer"]
        PostgreSQL[("Render Managed PostgreSQL (asyncpg)")]
        DiskStorage[("Voice Audio Uploads (Ephemeral / Object Storage)")]
    end

    subgraph External ["External Services & APIs"]
        OSRM["OSRM Routing Engine"]
        OSM["OpenStreetMap Tiles (Leaflet)"]
    end

    UserPWA -->|HTTPS| VercelEdge
    HospitalPWA -->|HTTPS| VercelEdge
    AdminPWA -->|HTTPS| VercelEdge

    VercelEdge -->|API Requests| RenderGateway
    RenderGateway --> FastAPI

    FastAPI --> MatchEngine
    FastAPI --> ResourceLocker
    FastAPI --> VoiceHandler
    FastAPI --> PollingSync

    MatchEngine -->|Async Queries| PostgreSQL
    ResourceLocker -->|SELECT ... FOR UPDATE| PostgreSQL
    VoiceHandler --> DiskStorage
    PollingSync --> PostgreSQL

    UserPWA -.->|Map Tiles & Waypoints| OSM
    UserPWA -.->|Turn-by-turn Route Geometry| OSRM
```

---

## 3. Core Component Breakdown

### 3.1 Frontend (`frontend-v2/`)
- **Framework**: Next.js 15.5 (React 19, App Router).
- **Directory Name Rationale**: Named `frontend-v2` representing the modern Next.js 15 App Router overhaul from the legacy Pages router. Configured in `vercel.json` and root `package.json`.
- **UI Architecture**: Apple Liquid Glass + Lucid Frost dark design system (`#050505` matte black foundation, translucent glass controls, luminous red `#FF3B30` emergency accents).
- **Mapping & Routing**: Client-side Leaflet.js with OpenStreetMap raster tiles, dynamic incident markers, hospital pins, and OSRM (Open Source Routing Machine) road geometry.
- **Voice Memo Pipeline**: Audio capture via native browser `MediaRecorder` API (`audio/webm` or `audio/mp4`), optional dual-language Web Speech transcription (Hindi/English), and direct binary transmission to `/api/emergency/{id}/voice-note`.
- **State Synchronization**: Active REST polling (`setInterval` at 1.5s–5s intervals) across emergency status, incoming hospital query queues, and administrative counters.

### 3.2 Backend (`backend/`)
- **Framework**: FastAPI (Python 3.12) executed under `uvicorn[standard]` workers.
- **Authoritative Target**: All production endpoints are implemented in `backend/routers/`:
  - `emergency.py`: Emergency lifecycle (creation, status tracking, hospital selection, voice note attachment).
  - `hospitals.py`: Hospital discovery, incoming alert queues, and Accept/Decline responses.
  - `resources.py`: Row-level locked ICU/ER resource reservations with automatic 15-minute expiry cleanup.
  - `admin.py`: Hospital verification audits and aggregate coordination metrics.
  - `auth.py`: JWT issuance and bcrypt credential management.
  - `health.py` & `main.py`: Health checks (`/health`, `/api/health`).
- **Backend Architecture Separation**:
  - **Active Coordination Engine**: `backend/mock-server.mjs` (Node.js) powers the live public demo and local development. It operates as an unauthenticated in-memory coordination service with synthetic data.
  - **Reference Backend**: FastAPI (`backend/main.py`) provides the reference architecture with PostgreSQL, async SQLAlchemy row-level locks, and JWT/RBAC.

---

## 4. Emergency Coordination Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Coordinator as Paramedic / Bystander
    participant Frontend as EMEFast PWA
    participant API as FastAPI Backend
    participant DB as PostgreSQL
    actor Hospital as Hospital ER Desk

    Coordinator->>Frontend: Hold SOS Button (3s) or Complete Emergency Form
    Frontend->>Frontend: Acquire GPS Coordinates + Record Voice Memo
    Frontend->>API: POST /api/emergency/new (Vitals, Requirements, Lat/Lng)
    API->>DB: INSERT EmergencyCase (Status: SEARCHING)
    API->>API: Discover nearby verified hospitals within radius
    API->>DB: INSERT HospitalResponse (Status: PENDING) for each candidate
    API->>Frontend: Return Case (Code: EME-XXXXXXXX, Status: AWAITING_RESPONSE)
    Frontend->>API: POST /api/emergency/{id}/voice-note (Audio Binary)
    API->>DB: UPDATE EmergencyCase (voice_note_path)

    loop Active REST Polling (every 2.5s)
        Hospital->>API: GET /api/hospitals/{id}/incoming
        API->>DB: SELECT EmergencyCases WHERE HospitalResponse.status == PENDING
        API-->>Hospital: Return Incoming Case + Requirements + Audio Memo Link
    end

    Hospital->>Hospital: Review Vitals & Play Voice Note
    alt Hospital Accepts
        Hospital->>API: POST /api/hospitals/{id}/respond/{case_id} (ACCEPTED, ETA: 12m)
        API->>DB: UPDATE HospitalResponse (ACCEPTED)
    else Hospital Declines
        Hospital->>API: POST /api/hospitals/{id}/respond/{case_id} (REJECTED + Mandatory Reason)
        API->>DB: UPDATE HospitalResponse (REJECTED + Reason)
    end

    loop Active REST Polling (every 1.5s)
        Frontend->>API: GET /api/emergency/{id}
        API->>DB: SELECT EmergencyCase + HospitalResponses
        API-->>Frontend: Return Accepted Hospitals (Fastest, Cheapest, Best Overall)
    end

    Coordinator->>Frontend: Select Target Hospital
    Frontend->>API: POST /api/emergency/{id}/select-hospital
    API->>DB: UPDATE EmergencyCase (Status: HOSPITAL_SELECTED)
    Frontend->>API: POST /api/resources/reserve (ICU_BED / ER_BED)
    API->>DB: SELECT HospitalResourceUnit ... FOR UPDATE
    API->>DB: INSERT ResourceReservation (Status: HELD, Expiry: +15 mins)
    API-->>Frontend: 200 OK (Reservation Confirmed)
    Frontend->>Coordinator: Display Turn-by-Turn Route & Arrival ETA
```

---

## 5. Hospital Eligibility & Decision Rules

Hospital ranking strictly enforces clinical eligibility *before* computing distance or cost:

```mermaid
flowchart TD
    Start([Discovered Hospital within 25km]) --> Gate1{Verified & Online?}
    Gate1 -- No --> Ineligible[Reject: Hospital Offline / Unverified]
    Gate1 -- Yes --> Gate2{Available Emergency Beds > 0?}
    Gate2 -- No --> Ineligible[Reject: No Emergency Capacity]
    Gate2 -- Yes --> Gate3{Matches Required Capabilities?<br/>e.g. ICU, Ventilator, Cath Lab, Trauma}
    Gate3 -- No --> Ineligible[Reject: Missing Clinical Capability]
    Gate3 -- Yes --> Eligible[Eligible for Coordination & Ranking]

    Eligible --> ScoreEngine[Composite Scoring Engine]
    ScoreEngine --> Metric1[Fastest ETA]
    ScoreEngine --> Metric2[Lowest Emergency Cost]
    ScoreEngine --> Metric3[Best Overall Composite Score]
```

### Recommendation Invariants:
1. A hospital lacking a required capability (e.g. Trauma Surgeon, Pediatric ICU) **cannot** be recommended, regardless of proximity or cost.
2. Clinical capabilities and verified availability are hard **gates**; distance, ETA, and cost are secondary **optimization factors**.
3. All hospital rejections require an explicit, audited reason stored in `hospital_responses.rejection_reason`.

---

## 6. Realtime State Synchronization Model

- **Current Implementation**: Active REST Polling (`setInterval`).
  - Emergency Coordinator View: Polls `/api/emergency/{id}` every **1.5 seconds** while status is `AWAITING_RESPONSE`.
  - Hospital Incoming Queue: Polls `/api/hospitals/{id}/incoming` every **2.5 seconds**.
  - Admin Operations Monitor: Polls `/api/admin/metrics` every **5 seconds**.
- **Architectural Rationale**: REST polling was chosen over WebSockets for prototype resilience across varying mobile network conditions, avoiding state loss during cellular tower handoffs and simplifying deployment across serverless edge infrastructure (Vercel).
- **Future WebSocket Path**: WebSocket connection endpoints (`/ws/emergency/{id}`) are planned for dedicated bidirectional clinical telemetry streaming.

---

## 7. Storage & Persistence Architecture

1. **PostgreSQL Relational Schema**: Authoritative data store on Render for users, hospitals, cases, responses, resource units, and reservations.
2. **Audio Voice Memos**: Stored via a pluggable `VoiceStorage` abstraction (`backend/services/storage.py`), supporting local filesystem storage (`LocalVoiceStorage`) for local development, and S3-compatible cloud object stores (`S3VoiceStorage`) for production (AWS S3, Cloudflare R2, MinIO).
3. **Local Cache / Offline Fallback**: PWA service worker (`public/sw.js`) caches application shells and assets. Incomplete network requests queue locally for synchronization.
