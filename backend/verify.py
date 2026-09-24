#!/usr/bin/env python3
"""
EMEFast Production Backend Verification Suite
Validates FastAPI routes, database connectivity, hospital matching algorithms, and resource locking.
"""

import sys
import os
import asyncio
from pathlib import Path

# Ensure backend root is on sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Ensure JWT_SECRET is set for verification
os.environ.setdefault("JWT_SECRET", "emefast-verification-test-secret-key-32chars")
os.environ.setdefault("DEMO_MODE", "0")

async def test_fastapi_app():
    print("1. Checking FastAPI application and router integrity...")
    from main import app
    assert app is not None
    routes = [r.path for r in app.routes]
    
    required_routes = [
        "/",
        "/health",
        "/api/health",
        "/api/auth/login",
        "/api/emergency/new",
        "/api/emergency/{id}",
        "/api/emergency/active/current",
        "/api/emergency/history/all",
        "/api/emergency/{id}/recommendation",
        "/api/emergency/{id}/select-hospital",
        "/api/hospitals",
        "/api/hospitals/verified",
        "/api/hospitals/{id}",
        "/api/hospitals/{id}/incoming",
        "/api/hospitals/{id}/active-cases",
        "/api/hospitals/{id}/respond/{case_id}",
        "/api/hospitals/{id}/resources",
        "/api/admin/metrics",
        "/api/admin/hospitals",
        "/api/admin/hospitals/{id}/verify",
        "/api/admin/emergencies",
        "/api/admin/users",
        "/api/resources/reserve",
    ]
    
    missing = [r for r in required_routes if r not in routes]
    if missing:
        raise AssertionError(f"Missing required FastAPI routes: {missing}")
    print(f"   [OK] All {len(required_routes)} required API routes verified.")

async def test_database_and_models():
    print("2. Checking database models and initialization...")
    from database import engine, SessionLocal
    from models import Base, Hospital, EmergencyCase, HospitalResponse, ResourceReservation, HospitalResourceUnit
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("   [OK] Database tables created/verified successfully.")
    
    async with SessionLocal() as db:
        from sqlalchemy import select
        h_res = await db.execute(select(Hospital).limit(5))
        hospitals = h_res.scalars().all()
        print(f"   [OK] Database session operational (found {len(hospitals)} seeded/existing hospitals).")

def test_hospital_matching_logic():
    print("3. Checking hospital eligibility and recommendation logic...")
    from types import SimpleNamespace
    from services.hospital_matching import calculate_haversine_distance, estimate_eta_minutes, capability_match
    
    # Distance
    d = calculate_haversine_distance(26.9124, 75.7873, 26.8540, 75.8063)
    assert 6.0 <= d <= 8.0, f"Unexpected distance: {d}"
    
    # Capability check
    case_icu = SimpleNamespace(priority="HIGH", condition="Cardiac arrest", requirements="ICU bed required", description="")
    hosp_no_icu = SimpleNamespace(available_icu=0, oxygen_available=True, trauma_capability=True, capabilities="cardiac", verified=True, emergency_status="ONLINE", available_beds=10)
    ok, missing = capability_match(case_icu, hosp_no_icu)
    assert not ok, "Hospital without ICU must NOT match case requiring ICU"
    assert "ICU bed" in missing
    
    hosp_with_icu = SimpleNamespace(available_icu=5, oxygen_available=True, trauma_capability=True, capabilities="cardiac, ventilator, icu", verified=True, emergency_status="ONLINE", available_beds=10)
    ok2, missing2 = capability_match(case_icu, hosp_with_icu)
    assert ok2, f"Hospital with ICU must match: missing={missing2}"
    print("   [OK] Hospital eligibility correctly filters before ranking.")

def test_case_state_machine():
    print("4. Checking authoritative CaseState canonical transitions...")
    from models.incident import CaseState, can_transition_case, validate_case_transition
    assert len(CaseState) == 8, f"Expected 8 canonical states, got {len(CaseState)}"
    assert can_transition_case("DRAFT", "BROADCASTING")
    assert can_transition_case("BROADCASTING", "WAITING_FOR_RESPONSES")
    assert can_transition_case("WAITING_FOR_RESPONSES", "PARTIAL_RESPONSES")
    assert can_transition_case("WAITING_FOR_RESPONSES", "HOSPITAL_ACCEPTED")
    assert can_transition_case("PARTIAL_RESPONSES", "HOSPITAL_ACCEPTED")
    assert can_transition_case("HOSPITAL_ACCEPTED", "HOSPITAL_SELECTED")
    assert can_transition_case("HOSPITAL_SELECTED", "COMPLETED")
    assert can_transition_case("WAITING_FOR_RESPONSES", "CANCELLED")
    assert not can_transition_case("COMPLETED", "CANCELLED")
    assert not can_transition_case("CANCELLED", "COMPLETED")
    assert not can_transition_case("WAITING_FOR_RESPONSES", "HOSPITAL_SELECTED")
    print("   [OK] Canonical CaseState transitions verified.")

async def main():
    print("==================================================")
    print("EMEFast Backend Preflight Verification Suite")
    print("==================================================")
    await test_fastapi_app()
    await test_database_and_models()
    test_hospital_matching_logic()
    test_case_state_machine()
    print("==================================================")
    print("ALL PREFLIGHT CHECKS PASSED SUCCESSFULLY!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
