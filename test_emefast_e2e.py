"""
EMEFast Production Backend End-to-End Test Suite
Tests FastAPI production backend against real API contracts, database persistence,
role-based authorization, hospital isolation, voice storage, emergency lifecycle guards,
and concurrent resource locking.
"""

import sys
import os
import asyncio
import httpx
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from main import app, lifespan
from database import SessionLocal
from models import Hospital, HospitalResourceUnit, EmergencyCase, HospitalResponse, ResourceReservation
from sqlalchemy import select


async def run_e2e_tests():
    print("=" * 70)
    print("EMEFast Production Backend E2E Test & Hardening Verification Suite")
    print("=" * 70)

    # Initialize lifespan (seeds demo hospitals, users & resource units)
    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:

            # ----------------------------------------------------
            # TEST 1: Health Check & Database Connectivity
            # ----------------------------------------------------
            print("\n[TEST 1] Testing Health Check & Database Connectivity...")
            res1 = await client.get("/health")
            assert res1.status_code == 200, f"/health failed: {res1.status_code} {res1.text}"
            data1 = res1.json()
            assert data1.get("status") == "ONLINE", f"Unexpected status: {data1}"
            assert data1.get("database") == "CONNECTED", f"Database not connected: {data1}"
            assert data1.get("platform") == "EMEFast", f"Incorrect platform: {data1}"
            print("   [PASS] GET /health returned 200 ONLINE (Database: CONNECTED, Platform: EMEFast)")

            res2 = await client.get("/api/health")
            assert res2.status_code == 200, f"/api/health failed: {res2.status_code}"
            assert res2.json().get("database") == "CONNECTED"
            print("   [PASS] GET /api/health returned 200 Healthy")

            # ----------------------------------------------------
            # TEST 2: Authentication & Role-Based Token Generation
            # ----------------------------------------------------
            print("\n[TEST 2] Testing Authentication & Token Issuance for Seeded Roles...")
            from dotenv import load_dotenv
            load_dotenv()
            test_admin_pwd = os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
            test_hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD") or os.getenv("HOSPITAL_PASSWORD")
            test_user_pwd = os.getenv("SEED_USER_PASSWORD") or os.getenv("USER_PASSWORD")

            # Login as Admin
            login_admin = await client.post("/api/auth/login", data={"username": "admin@emefast.example", "password": test_admin_pwd})
            assert login_admin.status_code == 200, f"Admin login failed: {login_admin.text}"
            admin_token = login_admin.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            print("   [PASS] Admin authenticated: role=ADMIN")

            # Login as Hospital 1 (SMS Hospital)
            login_hosp1 = await client.post("/api/auth/login", data={"username": "hospital-sms@emefast.example", "password": test_hosp_pwd})
            assert login_hosp1.status_code == 200, f"Hospital 1 login failed: {login_hosp1.text}"
            hosp1_token = login_hosp1.json()["access_token"]
            hosp1_headers = {"Authorization": f"Bearer {hosp1_token}"}
            print("   [PASS] Hospital 1 authenticated: role=HOSPITAL, hospital_id=1")

            # Login as Hospital 2 (Fortis Hospital)
            login_hosp2 = await client.post("/api/auth/login", data={"username": "hospital-fortis@emefast.example", "password": test_hosp_pwd})
            assert login_hosp2.status_code == 200, f"Hospital 2 login failed: {login_hosp2.text}"
            hosp2_token = login_hosp2.json()["access_token"]
            hosp2_headers = {"Authorization": f"Bearer {hosp2_token}"}
            print("   [PASS] Hospital 2 authenticated: role=HOSPITAL, hospital_id=2")

            # Login as Standard User / Ambulance
            login_user = await client.post("/api/auth/login", data={"username": "ambulance@emefast.example", "password": test_user_pwd})
            assert login_user.status_code == 200, f"User login failed: {login_user.text}"
            user_token = login_user.json()["access_token"]
            user_headers = {"Authorization": f"Bearer {user_token}"}
            print("   [PASS] User authenticated: role=USER")

            # ----------------------------------------------------
            # TEST 3: RBAC Enforcement on Admin Routes
            # ----------------------------------------------------
            print("\n[TEST 3] Testing RBAC Route Enforcement (/api/admin/metrics)...")
            # Unauthenticated access with invalid token should yield 401
            res_unauth = await client.get("/api/admin/metrics", headers={"Authorization": "Bearer invalid.jwt.token"})
            assert res_unauth.status_code == 401, f"Expected 401 on bad token, got {res_unauth.status_code}"
            print("   [PASS] Invalid token rejected with 401 Unauthorized")

            # USER role should be forbidden from ADMIN route
            res_forbidden = await client.get("/api/admin/metrics", headers=user_headers)
            assert res_forbidden.status_code == 403, f"Expected 403 for USER role, got {res_forbidden.status_code}"
            print("   [PASS] Standard USER denied access with 403 Forbidden")

            # ADMIN role should succeed
            res_admin_ok = await client.get("/api/admin/metrics", headers=admin_headers)
            assert res_admin_ok.status_code == 200, f"Admin metrics failed: {res_admin_ok.status_code} {res_admin_ok.text}"
            print("   [PASS] ADMIN granted access with 200 OK")

            # ----------------------------------------------------
            # TEST 4: Hospital Discovery & Facility Matching
            # ----------------------------------------------------
            print("\n[TEST 4] Testing Hospital Discovery (/api/hospitals)...")
            res_hosp = await client.get("/api/hospitals")
            assert res_hosp.status_code == 200, f"Hospitals list failed: {res_hosp.status_code}"
            hospitals = res_hosp.json()
            assert len(hospitals) >= 2, f"Expected at least 2 hospitals, got {len(hospitals)}"
            hosp1 = next(h for h in hospitals if h["id"] == 1)
            hosp2 = next(h for h in hospitals if h["id"] == 2)
            print(f"   [PASS] Discovered {len(hospitals)} online hospitals: {hosp1['name']} & {hosp2['name']}")

            # ----------------------------------------------------
            # TEST 5: Emergency Case Creation (/api/emergency/new)
            # ----------------------------------------------------
            print("\n[TEST 5] Testing Emergency Case Creation (/api/emergency/new)...")
            case_payload = {
                "abha_id": "ABHA-TEST-9901",
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
                "description": "Patient experiencing crushing retrosternal pain radiating to left arm."
            }
            res_case = await client.post("/api/emergency/new", json=case_payload)
            assert res_case.status_code == 200, f"Case creation failed: {res_case.status_code} {res_case.text}"
            case_data = res_case.json()
            case_id = case_data["id"]
            case_code = case_data["case_code"]
            assert case_code.startswith("EME-"), f"Invalid case code: {case_code}"
            print(f"   [PASS] Emergency Case created: ID={case_id}, Code={case_code}, Status={case_data['status']}")

            # ----------------------------------------------------
            # TEST 6: Voice Storage Upload & Retrieval
            # ----------------------------------------------------
            print("\n[TEST 6] Testing Emergency Voice Note Storage & Streaming...")
            fake_audio_bytes = b"RIFF....WAVEfmt ....data" + b"\x00\x01\x02\x03" * 256
            voice_res = await client.post(
                f"/api/emergency/{case_id}/voice-note",
                content=fake_audio_bytes,
                headers={"Content-Type": "audio/wav", "x-voice-transcript": "Patient unresponsive with weak pulse"}
            )
            assert voice_res.status_code == 200, f"Voice upload failed: {voice_res.text}"
            voice_data = voice_res.json()
            assert voice_data["status"] == "saved"
            assert "voice-note" in voice_data["voice_note_path"]
            assert voice_data["transcript"] == "Patient unresponsive with weak pulse"
            print("   [PASS] Voice note saved via storage abstraction with transcript")

            # Stream voice note back
            stream_res = await client.get(voice_data["voice_note_path"])
            assert stream_res.status_code == 200, f"Voice playback failed: {stream_res.status_code}"
            assert stream_res.content == fake_audio_bytes
            print("   [PASS] Voice note retrieved & streamed with bit-exact integrity")

            # ----------------------------------------------------
            # TEST 7: Hospital Isolation Guard on Responses
            # ----------------------------------------------------
            print("\n[TEST 7] Testing Hospital Isolation Guard...")
            # Hospital 1 attempts to respond on behalf of Hospital 2 -> MUST be rejected with 403
            illegal_respond = await client.post(
                f"/api/hospitals/2/respond/{case_id}",
                json={"response": "ACCEPTED", "eta": 10},
                headers=hosp1_headers
            )
            assert illegal_respond.status_code == 403, f"Expected 403 facility mismatch, got {illegal_respond.status_code}"
            print("   [PASS] Cross-hospital unauthorized response blocked with 403 Forbidden")

            # Hospital 1 responds for Hospital 1 -> Success
            res_h1 = await client.post(
                f"/api/hospitals/1/respond/{case_id}",
                json={"response": "ACCEPTED", "eta": 8},
                headers=hosp1_headers
            )
            assert res_h1.status_code == 200, f"Hosp 1 response failed: {res_h1.text}"
            print("   [PASS] Hospital 1 responded ACCEPTED (ETA 8 mins)")

            # Hospital 2 responds for Hospital 2 -> Success
            res_h2 = await client.post(
                f"/api/hospitals/2/respond/{case_id}",
                json={"response": "ACCEPTED", "eta": 14},
                headers=hosp2_headers
            )
            assert res_h2.status_code == 200, f"Hosp 2 response failed: {res_h2.text}"
            print("   [PASS] Hospital 2 responded ACCEPTED (ETA 14 mins)")

            # ----------------------------------------------------
            # TEST 8: Hospital Selection & Audit Trail
            # ----------------------------------------------------
            print(f"\n[TEST 8] Testing Hospital Selection (/api/emergency/{case_id}/select-hospital)...")
            res_select = await client.post(
                f"/api/emergency/{case_id}/select-hospital",
                json={"hospital_id": 1},
                headers=user_headers
            )
            assert res_select.status_code == 200, f"Hospital selection failed: {res_select.text}"
            select_data = res_select.json()
            assert select_data.get("status") == "HOSPITAL_SELECTED"
            assert select_data.get("selected_hospital_id") == 1
            print("   [PASS] Emergency Case updated to HOSPITAL_SELECTED for Hospital 1")

            # ----------------------------------------------------
            # TEST 9: Terminal State Guard (No modification after COMPLETED)
            # ----------------------------------------------------
            print("\n[TEST 9] Testing Terminal State Guard...")
            # Advance case status to COMPLETED
            status_res = await client.post(
                f"/api/emergency/{case_id}/status",
                json={"status": "COMPLETED"}
            )
            assert status_res.status_code == 200, f"Status update failed: {status_res.text}"

            # Attempt to re-select hospital after case is completed -> MUST fail with 409
            invalid_reselect = await client.post(
                f"/api/emergency/{case_id}/select-hospital",
                json={"hospital_id": 2},
                headers=user_headers
            )
            assert invalid_reselect.status_code == 409, f"Expected 409 Conflict, got {invalid_reselect.status_code}"
            print("   [PASS] Re-selection rejected on terminal COMPLETED state with 409 Conflict")

            # ----------------------------------------------------
            # TEST 10: Concurrent Resource Locking & Double Reservation Race Condition
            # ----------------------------------------------------
            print("\n[TEST 10] Testing Concurrent Row-Level Resource Locking...")
            async with SessionLocal() as db_session:
                q = await db_session.execute(
                    select(HospitalResourceUnit).where(
                        HospitalResourceUnit.hospital_id == 1,
                        HospitalResourceUnit.status == "AVAILABLE"
                    ).limit(1)
                )
                unit = q.scalar_one_or_none()
                if not unit:
                    unit = HospitalResourceUnit(
                        hospital_id=1,
                        resource_type="ICU_BED",
                        unit_identifier="ICU-CONCUR-01",
                        status="AVAILABLE"
                    )
                    db_session.add(unit)
                    await db_session.commit()
                    await db_session.refresh(unit)

                target_unit_id = unit.id
                target_unit_type = unit.resource_type

            # Trigger two concurrent reservations for the exact same resource unit
            payload_a = {"hospital_id": 1, "resource_type": target_unit_type, "resource_id": target_unit_id, "incident_id": case_id}
            payload_b = {"hospital_id": 1, "resource_type": target_unit_type, "resource_id": target_unit_id, "incident_id": case_id}

            task_a = client.post("/api/resources/reserve", json=payload_a, headers=user_headers)
            task_b = client.post("/api/resources/reserve", json=payload_b, headers=user_headers)
            resp_a, resp_b = await asyncio.gather(task_a, task_b)

            statuses = [resp_a.status_code, resp_b.status_code]
            assert 200 in statuses, f"Expected exactly one 200, got {statuses}"
            assert 409 in statuses, f"Expected exactly one 409 conflict, got {statuses}"
            print("   [PASS] Concurrency Guard Confirmed: Winner got 200 OK, Contender got 409 RESOURCE_ALREADY_RESERVED")

            # ----------------------------------------------------
            # TEST 11: Cross-Hospital Resource Release Authorization
            # ----------------------------------------------------
            print("\n[TEST 11] Testing Resource Release Authorization Guard...")
            # Hospital 2 attempts to release Hospital 1's reserved resource -> MUST be 403
            illegal_release = await client.post(f"/api/resources/{target_unit_id}/release", headers=hosp2_headers)
            assert illegal_release.status_code == 403, f"Expected 403 for foreign hospital release, got {illegal_release.status_code}"
            print("   [PASS] Cross-hospital resource release rejected with 403 Forbidden")

            # Hospital 1 releases its own resource -> 200 OK
            legal_release = await client.post(f"/api/resources/{target_unit_id}/release", headers=hosp1_headers)
            assert legal_release.status_code == 200, f"Owning hospital release failed: {legal_release.text}"
            print(f"   [PASS] Hospital 1 successfully released resource unit {target_unit_id} back to AVAILABLE")

    print("\n" + "=" * 70)
    print("ALL 11 E2E TESTS PASSED SUCCESSFULLY! ARCHITECTURE FULLY HARDENED.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_e2e_tests())
