"""
EMEFast Strict Security & RBAC Audit Test Suite
Verifies all 10 security constraints (A through J) in PRODUCTION mode:
A. unauthenticated emergency mutation -> 401
B. unauthenticated hospital accept/decline -> 401
C. unauthenticated resource modification -> 401
D. unauthenticated admin operation -> 401
E. hospital attempting admin operation -> 403
F. ambulance attempting admin operation -> 403
G. hospital attempting another hospital's resource mutation -> 403
H. expired JWT -> 401
I. invalid JWT -> 401
J. malformed authorization header -> 401
"""

import sys
import os
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import jwt
import httpx

# Set strict testing environment with DEMO_MODE disabled (no fallback permitted)
os.environ["ENVIRONMENT"] = "testing"
os.environ["DEMO_MODE"] = "0"
os.environ["JWT_SECRET"] = "production-super-secret-key-that-is-at-least-32-chars-long"

REPO_ROOT = Path(__file__).resolve().parent
backend_dir = REPO_ROOT / "backend"
sys.path.insert(0, str(backend_dir))

from main import app, lifespan
from auth import create_access_token, SECRET_KEY, ALGORITHM
from database import SessionLocal
from models import Hospital, HospitalResourceUnit, EmergencyCase, HospitalResponse, ResourceReservation
from sqlalchemy import select


async def run_security_audit():
    print("=" * 70)
    print("EMEFast Production Security & RBAC Strict Audit")
    print("=" * 70)

    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:

            # 0. Setup test case and resource
            print("\n[SETUP] Creating test emergency case and resources...")
            # Create a case for testing mutations
            case_res = await client.post("/api/emergency/new", json={
                "abha_id": "ABHA-SEC-01",
                "transport_mode": "AMBULANCE",
                "patient_name": "Demo Patient",
                "patient_age": 35,
                "condition": "Acute Trauma",
                "priority": "CRITICAL",
                "requirements": "ICU, Trauma",
                "vitals": "BP: 100/70",
                "latitude": 26.9124,
                "longitude": 75.7873,
                "address": "MI Road, Jaipur"
            })
            assert case_res.status_code == 200
            case_id = case_res.json()["id"]

            # Acquire credentials using environment variables
            from dotenv import load_dotenv
            load_dotenv(os.path.join(REPO_ROOT, ".env"))
            test_admin_pwd = os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
            test_hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD") or os.getenv("HOSPITAL_PASSWORD")
            test_user_pwd = os.getenv("SEED_USER_PASSWORD") or os.getenv("USER_PASSWORD")

            h1_login = await client.post("/api/auth/login", data={"username": "hospital-sms@emefast.example", "password": test_hosp_pwd})
            assert h1_login.status_code == 200
            hosp1_token = h1_login.json()["access_token"]
            hosp1_headers = {"Authorization": f"Bearer {hosp1_token}"}

            h2_login = await client.post("/api/auth/login", data={"username": "hospital-fortis@emefast.example", "password": test_hosp_pwd})
            assert h2_login.status_code == 200
            hosp2_token = h2_login.json()["access_token"]
            hosp2_headers = {"Authorization": f"Bearer {hosp2_token}"}

            user_login = await client.post("/api/auth/login", data={"username": "ambulance@emefast.example", "password": test_user_pwd})
            assert user_login.status_code == 200
            user_token = user_login.json()["access_token"]
            user_headers = {"Authorization": f"Bearer {user_token}"}

            admin_login = await client.post("/api/auth/login", data={"username": "admin@emefast.example", "password": test_admin_pwd})
            assert admin_login.status_code == 200
            admin_token = admin_login.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            # Query resource for hospital 2
            async with SessionLocal() as db_session:
                q2 = await db_session.execute(select(HospitalResourceUnit).where(HospitalResourceUnit.hospital_id == 2).limit(1))
                h2_unit = q2.scalar_one_or_none()
                if not h2_unit:
                    h2_unit = HospitalResourceUnit(hospital_id=2, resource_type="ICU_BED", unit_identifier="ICU-H2-01", status="RESERVED")
                    db_session.add(h2_unit)
                    await db_session.commit()
                    await db_session.refresh(h2_unit)
                else:
                    h2_unit.status = "RESERVED"
                    await db_session.commit()
                h2_unit_id = h2_unit.id

            # ----------------------------------------------------
            # A. Unauthenticated emergency mutation
            # ----------------------------------------------------
            print("\n[TEST A] Unauthenticated emergency mutation...")
            res_a1 = await client.post(f"/api/emergency/{case_id}/select-hospital", json={"hospital_id": 1})
            assert res_a1.status_code == 401, f"Expected 401, got {res_a1.status_code}: {res_a1.text}"

            res_a2 = await client.post(f"/api/emergency/{case_id}/status", json={"status": "COMPLETED"})
            assert res_a2.status_code == 401, f"Expected 401, got {res_a2.status_code}: {res_a2.text}"
            print("   [PASS] Both emergency mutations rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # B. Unauthenticated hospital accept/decline
            # ----------------------------------------------------
            print("\n[TEST B] Unauthenticated hospital accept/decline...")
            res_b = await client.post(f"/api/hospitals/1/respond/{case_id}", json={"response": "ACCEPTED", "eta": 10})
            assert res_b.status_code == 401, f"Expected 401, got {res_b.status_code}: {res_b.text}"
            print("   [PASS] Unauthenticated hospital response rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # C. Unauthenticated resource modification
            # ----------------------------------------------------
            print("\n[TEST C] Unauthenticated resource modification...")
            res_c1 = await client.post("/api/resources/reserve", json={"hospital_id": 1, "resource_type": "ICU_BED", "resource_id": 1, "incident_id": case_id})
            assert res_c1.status_code == 401, f"Expected 401, got {res_c1.status_code}"

            res_c2 = await client.post(f"/api/resources/{h2_unit_id}/release")
            assert res_c2.status_code == 401, f"Expected 401, got {res_c2.status_code}"

            res_c3 = await client.patch("/api/hospitals/1/resources", json={"available_icu": 5})
            assert res_c3.status_code == 401, f"Expected 401, got {res_c3.status_code}"
            print("   [PASS] All unauthenticated resource modifications rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # D. Unauthenticated admin operation
            # ----------------------------------------------------
            print("\n[TEST D] Unauthenticated admin operation...")
            res_d1 = await client.get("/api/admin/metrics")
            assert res_d1.status_code == 401, f"Expected 401, got {res_d1.status_code}"

            res_d2 = await client.patch("/api/admin/hospitals/1/verify?verify=true")
            assert res_d2.status_code == 401, f"Expected 401, got {res_d2.status_code}"
            print("   [PASS] Unauthenticated admin operations rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # E. Hospital attempting admin operation
            # ----------------------------------------------------
            print("\n[TEST E] Hospital role attempting admin operation...")
            res_e = await client.get("/api/admin/metrics", headers=hosp1_headers)
            assert res_e.status_code == 403, f"Expected 403 Forbidden, got {res_e.status_code}"
            print("   [PASS] Hospital role denied access to admin routes with 403 Forbidden")

            # ----------------------------------------------------
            # F. Ambulance/User attempting admin operation
            # ----------------------------------------------------
            print("\n[TEST F] Ambulance role attempting admin operation...")
            res_f = await client.get("/api/admin/metrics", headers=user_headers)
            assert res_f.status_code == 403, f"Expected 403 Forbidden, got {res_f.status_code}"
            print("   [PASS] Ambulance role denied access to admin routes with 403 Forbidden")

            # ----------------------------------------------------
            # G. Hospital attempting another hospital's resource mutation
            # ----------------------------------------------------
            print("\n[TEST G] Cross-facility mutation attempts...")
            # Hospital 1 attempts to respond for Hospital 2
            res_g1 = await client.post(f"/api/hospitals/2/respond/{case_id}", json={"response": "ACCEPTED", "eta": 10}, headers=hosp1_headers)
            assert res_g1.status_code == 403, f"Expected 403, got {res_g1.status_code}"

            # Hospital 1 attempts to release Hospital 2's resource unit
            res_g2 = await client.post(f"/api/resources/{h2_unit_id}/release", headers=hosp1_headers)
            assert res_g2.status_code == 403, f"Expected 403, got {res_g2.status_code}"

            # Hospital 1 attempts to update Hospital 2's capacity
            res_g3 = await client.patch("/api/hospitals/2/resources", json={"available_icu": 50}, headers=hosp1_headers)
            assert res_g3.status_code == 403, f"Expected 403, got {res_g3.status_code}"
            print("   [PASS] All cross-facility actions blocked with 403 Forbidden")

            # ----------------------------------------------------
            # H. Expired JWT
            # ----------------------------------------------------
            print("\n[TEST H] Expired JWT...")
            expired_payload = {
                "sub": "admin@emefast.example",
                "role": "ADMIN",
                "exp": datetime.utcnow() - timedelta(minutes=30)
            }
            expired_jwt = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
            res_h = await client.get("/api/admin/metrics", headers={"Authorization": f"Bearer {expired_jwt}"})
            assert res_h.status_code == 401, f"Expected 401 for expired token, got {res_h.status_code}"
            assert "expired" in res_h.text.lower()
            print("   [PASS] Expired token rejected with 401 Unauthorized ('expired')")

            # ----------------------------------------------------
            # I. Invalid JWT signature
            # ----------------------------------------------------
            print("\n[TEST I] Invalid JWT signature...")
            bad_token = jwt.encode({"sub": "admin@emefast.example", "role": "ADMIN"}, "wrong-secret-key", algorithm=ALGORITHM)
            res_i = await client.get("/api/admin/metrics", headers={"Authorization": f"Bearer {bad_token}"})
            assert res_i.status_code == 401, f"Expected 401 for invalid signature, got {res_i.status_code}"
            print("   [PASS] Invalid signature rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # J. Malformed Authorization header
            # ----------------------------------------------------
            print("\n[TEST J] Malformed authorization headers...")
            res_j1 = await client.get("/api/admin/metrics", headers={"Authorization": "MalformedBearerWithoutSpace"})
            assert res_j1.status_code == 401, f"Expected 401, got {res_j1.status_code}"

            res_j2 = await client.get("/api/admin/metrics", headers={"Authorization": "Basic dXNlcjpwYXNz"})
            assert res_j2.status_code == 401, f"Expected 401, got {res_j2.status_code}"
            print("   [PASS] Malformed headers rejected with 401 Unauthorized")

            # ----------------------------------------------------
            # K. Database Row-Locking, Release, Expiry & Re-reservation
            # ----------------------------------------------------
            print("\n[TEST K] Resource Lifecycle: Concurrency -> Release -> Expiry -> Re-reservation...")
            # Prepare unit 1 as AVAILABLE
            async with SessionLocal() as db_session:
                u1 = await db_session.get(HospitalResourceUnit, 1)
                u1.status = "AVAILABLE"
                u1.current_incident_id = None
                await db_session.commit()

            # 1. Simultaneous concurrent reservation
            task_a = client.post("/api/resources/reserve", json={"hospital_id": 1, "resource_type": "ICU_BED", "resource_id": 1, "incident_id": case_id}, headers=user_headers)
            task_b = client.post("/api/resources/reserve", json={"hospital_id": 1, "resource_type": "ICU_BED", "resource_id": 1, "incident_id": case_id}, headers=user_headers)
            resp_a, resp_b = await asyncio.gather(task_a, task_b)
            statuses = [resp_a.status_code, resp_b.status_code]
            assert 200 in statuses and 409 in statuses, f"Expected [200, 409], got {statuses}"
            print("   [PASS] Simultaneous reservation: winner 200 OK, contender 409 Conflict")

            # 2. Release
            rel_res = await client.post("/api/resources/1/release", headers=hosp1_headers)
            assert rel_res.status_code == 200, f"Release failed: {rel_res.text}"
            print("   [PASS] Resource release: 200 OK")

            # 3. Re-reservation after release
            re_res = await client.post("/api/resources/reserve", json={"hospital_id": 1, "resource_type": "ICU_BED", "resource_id": 1, "incident_id": case_id}, headers=user_headers)
            assert re_res.status_code == 200, f"Re-reservation failed: {re_res.text}"
            print("   [PASS] Re-reservation after release: 200 OK")

            # 4. Expiry simulation & automatic recovery
            async with SessionLocal() as db_session:
                q_res = await db_session.execute(select(ResourceReservation).where(ResourceReservation.resource_id == 1, ResourceReservation.status == "HELD"))
                res_obj = q_res.scalar_one_or_none()
                assert res_obj is not None
                res_obj.expires_at = datetime.utcnow() - timedelta(minutes=20)
                await db_session.commit()

            # Attempting new reservation now automatically detects expired hold, frees unit, and reserves it
            exp_res = await client.post("/api/resources/reserve", json={"hospital_id": 1, "resource_type": "ICU_BED", "resource_id": 1, "incident_id": case_id}, headers=user_headers)
            assert exp_res.status_code == 200, f"Reservation after expiry failed: {exp_res.text}"
            print("   [PASS] Automatic 15-minute hold expiry & re-reservation: 200 OK")

    print("\n" + "=" * 70)
    print("ALL AUDIT TESTS PASSED (A through K). SYSTEM SECURITY & LOCKS VERIFIED.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_security_audit())
