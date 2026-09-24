# EMEFast API Reference

Base URL (Production): `https://emefast-v17.onrender.com/api`  
Base URL (Local Development): `http://localhost:8000/api`

Interactive OpenAPI Documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 1. System Health & Diagnostics

### `GET /health` / `GET /api/health`
Returns service status, version number, platform name, and coordination state.

- **Authentication**: None (Public)
- **Response `200 OK`**:
```json
{
  "status": "ONLINE",
  "version": "3.0.0",
  "platform": "EMEFast",
  "coordination": "active"
}
```

---

## 2. Emergency Case Lifecycle

### `POST /api/emergency/new`
Creates an emergency incident, stores clinical requirements, discovers nearby verified hospitals, and broadcasts initial queries.

- **Authentication**: Public in demo API; Bearer JWT in reference FastAPI backend.
- **Request Body**:
```json
{
  "abha_id": "ABHA-9901-2244",
  "transport_mode": "BYSTANDER",
  "patient_name": "Rohan Sharma",
  "patient_age": 42,
  "condition": "Severe Acute Cardiac Distress",
  "priority": "CRITICAL",
  "requirements": "Cardiology, ICU, Oxygen, Ventilator",
  "vitals": "BP: 85/55, HR: 132, SpO2: 89%",
  "latitude": 26.9124,
  "longitude": 75.7873,
  "address": "MI Road, Jaipur, Rajasthan",
  "description": "Crushing retrosternal chest pain radiating to left arm."
}
```
- **Response `200 OK`**:
```json
{
  "id": 1,
  "case_code": "EME-A231ADEE4E",
  "status": "AWAITING_RESPONSE",
  "patient_name": "Rohan Sharma",
  "priority": "CRITICAL",
  "latitude": 26.9124,
  "longitude": 75.7873,
  "created_at": "2026-09-20T19:38:00Z",
  "responses": [
    {
      "hospital_id": 1,
      "response": "PENDING",
      "distance_km": 3.4,
      "eta": 9.0,
      "estimated_cost": 2500
    }
  ]
}
```
- **Errors**: `400 Bad Request` (Invalid coordinate bounds or missing required fields).

---

### `GET /api/emergency/{id}`
Retrieves complete case status, selected destination, and all hospital responses.

- **Authentication**: None (Public during incident lifecycle).
- **Response `200 OK`**: Returns full `EmergencyCaseOut` object with loaded `responses` and `selected_hospital`.
- **Errors**: `404 Not Found` if case ID does not exist.

---

### `POST /api/emergency/{id}/select-hospital`
Locks the user's chosen destination hospital for the emergency incident.

- **Authentication**: None / Bearer JWT.
- **Request Body**:
```json
{
  "hospital_id": 1
}
```
- **Response `200 OK`**:
```json
{
  "id": 1,
  "case_code": "EME-A231ADEE4E",
  "status": "HOSPITAL_SELECTED",
  "selected_hospital_id": 1,
  "selected_hospital_eta": 9.0
}
```
- **Errors**:
  - `404 Not Found`: Case or hospital not found.
  - `409 Conflict`: Hospital has not accepted the case (`HospitalResponse.response != 'ACCEPTED'`), or hospital is unverified/offline.

---

### `POST /api/emergency/{id}/voice-note`
Attaches a raw audio recording blob (`MediaRecorder`) to the emergency case.

- **Headers**:
  - `Content-Type`: `audio/webm` | `audio/ogg` | `audio/mp4` | `audio/wav` | `audio/mpeg`
  - `x-voice-transcript` *(optional)*: Browser speech transcription text.
- **Request Body**: Raw binary audio payload (max 15 MB).
- **Response `200 OK`**:
```json
{
  "status": "saved",
  "case_id": 1,
  "voice_note_path": "/api/emergency/1/voice-note/EME-A231ADEE4E-f8a1.webm",
  "transcript": "Patient unconscious, suspected myocardial infarction."
}
```
- **Errors**:
  - `400 Bad Request`: Empty body.
  - `413 Payload Too Large`: Audio exceeds 15 MB.
  - `415 Unsupported Media Type`: Unsupported audio codec.

---

### `GET /api/emergency/{id}/voice-note/{filename}`
Streams the stored emergency voice recording to the hospital ER desk for playback.

- **Response `200 OK`**: Audio binary file stream with appropriate `Content-Type`.
- **Errors**: `404 Not Found` if voice note file does not exist.

---

## 3. Hospital Operations & Coordination

### `GET /api/hospitals`
Lists all verified, active hospitals in the emergency network.

- **Authentication**: None.
- **Response `200 OK`**: Array of hospital objects with coordinates, available beds, ICU counts, and emergency status.

---

### `GET /api/hospitals/{id}/incoming`
Queries pending emergency cases broadcast to the designated hospital. Used by hospital ER dashboards via REST polling.

- **Authentication**: Public in demo API; Bearer JWT in reference FastAPI backend.
- **Response `200 OK`**:
```json
[
  {
    "id": 1,
    "case_code": "EME-A231ADEE4E",
    "condition": "Severe Acute Cardiac Distress",
    "priority": "CRITICAL",
    "vitals": "BP: 85/55, HR: 132, SpO2: 89%",
    "voice_note_path": "/api/emergency/1/voice-note/EME-A231ADEE4E-f8a1.webm",
    "voice_transcript": "Patient unconscious, suspected myocardial infarction.",
    "status": "AWAITING_RESPONSE"
  }
]
```

---

### `POST /api/hospitals/{id}/respond/{case_id}`
Hospital emergency department Accepts or Declines an incoming case.

- **Authentication**: Public in demo API; Hospital Admin Bearer JWT in reference FastAPI backend.
- **Request Body**:
```json
{
  "response": "ACCEPTED",
  "eta": 11.0,
  "rejection_reason": null
}
```
*(When declining, `response` is `"REJECTED"` and `rejection_reason` is mandatory, e.g., `"Cath lab currently at capacity"`).*
- **Response `200 OK`**:
```json
{
  "status": "success",
  "case_id": 1,
  "case_code": "EME-A231ADEE4E",
  "hospital_id": 1,
  "response": "ACCEPTED",
  "eta": 11.0,
  "rejection_reason": null
}
```
- **Errors**: `404 Not Found` if hospital, case, or response record is not found.

---

### `PUT` / `PATCH /api/hospitals/{id}/resources`
Updates live bed and resource counts for a hospital.

- **Request Body**:
```json
{
  "available_beds": 24,
  "available_icu": 5,
  "oxygen_available": true
}
```
- **Response `200 OK`**: Updated `HospitalOut` object.

---

## 4. Concurrency-Safe Resource Reservation

### `POST /api/resources/reserve`
Reserves a specific ICU bed or ER trauma bay using PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) and an in-process serialized mutex.

- **Request Body**:
```json
{
  "hospital_id": 1,
  "resource_type": "ICU_BED",
  "resource_id": 10,
  "incident_id": 1
}
```
- **Response `200 OK`**:
```json
{
  "status": "success",
  "reservation_id": 4
}
```
- **Errors**:
  - `404 Not Found`: Hospital or resource unit does not exist.
  - `409 Conflict`: `{"detail": "RESOURCE_ALREADY_RESERVED"}` (returned if a competing transaction already locked or reserved the unit).

---

### `POST /api/resources/{resource_id}/release`
Releases an occupied or held resource back to `AVAILABLE` status.

- **Response `200 OK`**:
```json
{
  "status": "success",
  "resource_id": 10,
  "unit_identifier": "ICU-1-01"
}
```

---

## 5. Administration & Auditing

### `GET /api/admin/metrics`
Returns system-wide operational metrics for the coordination platform.

- **Response `200 OK`**:
```json
{
  "total_cases": 142,
  "active_cases": 3,
  "accepted_cases": 128,
  "avg_response_time_seconds": 38.4,
  "total_hospitals": 7,
  "verified_hospitals": 7
}
```

---

### `POST` / `PATCH /api/admin/hospitals/{id}/verify`
Admin endpoint to verify or suspend a hospital in the emergency network.

- **Query Parameters**: `?verify=true` | `?verify=false`
- **Response `200 OK`**: Updated hospital details with new `verified` boolean status.
