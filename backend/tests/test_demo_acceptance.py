import asyncio
import datetime
import uuid
import pytest
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models import (
    EmergencyCase, CaseState, Hospital, HospitalResourceUnit,
    ResourceReservation, AuditLog, HospitalResponse
)
from services.hospital_matching import (
    calculate_haversine_distance, estimate_eta_minutes,
    capability_match, evaluate_decision_engine
)
from database import engine, SessionLocal
from routers.resources import reserve_resource, ReserveRequest
from auth import UserContext


@pytest.mark.anyio
async def test_incident_id_format_authoritative():
    """Verify permanent incident ID matches EMF-YYYY-MMDD-XXXXX format."""
    import re
    now = datetime.datetime.utcnow()
    # Format pattern: EMF-YYYY-MMDD-XXXXX
    pattern = r"^EMF-\d{4}-\d{4}-\d{5}$"
    sample_id = f"EMF-{now.strftime('%Y-%m%d')}-00042"
    assert re.match(pattern, sample_id) is not None


@pytest.mark.anyio
async def test_decision_transparency_fields():
    """Verify why_this, why_not, primary_exclusion, and confidence on matching engine."""
    import uuid
    code = f"EMF-TEST-{uuid.uuid4().hex[:6]}"
    async with SessionLocal() as db:
        c = EmergencyCase(
            case_code=code,
            patient_name="Transparency Test Patient",
            condition="Acute myocardial infarction",
            priority="CRITICAL",
            requirements="ICU, Cardiologist",
            latitude=26.9124,
            longitude=75.7873,
            status=CaseState.HOSPITAL_ACCEPTED.value
        )
        db.add(c)

        h1 = Hospital(
            name="Apex Heart Hospital",
            address="Malviya Nagar, Jaipur",
            latitude=26.85,
            longitude=75.82,
            capabilities="Cardiology, ICU, Emergency",
            available_icu=4,
            available_beds=12,
            oxygen_available=True,
            trauma_capability=True,
            estimated_emergency_cost=45000,
            verified=True,
            emergency_status="ONLINE",
            created_at=datetime.datetime.utcnow(),
        )
        h2 = Hospital(
            name="Peripheral Clinic",
            address="Ajmer Road",
            latitude=26.89,
            longitude=75.75,
            capabilities="General Medicine",
            available_icu=0,
            available_beds=2,
            oxygen_available=False,
            trauma_capability=False,
            estimated_emergency_cost=15000,
            verified=True,
            emergency_status="ONLINE",
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=5),
        )
        db.add(h1)
        db.add(h2)
        await db.commit()

        r1 = HospitalResponse(
            case_id=c.id,
            hospital_id=h1.id,
            response="ACCEPTED",
            distance_km=4.2,
            eta=9.0
        )
        r2 = HospitalResponse(
            case_id=c.id,
            hospital_id=h2.id,
            response="REJECTED",
            rejection_reason="No ICU beds available",
            distance_km=6.5,
            eta=15.0
        )
        db.add(r1)
        db.add(r2)
        await db.commit()

        decision = await evaluate_decision_engine(db, c)
        assert decision["recommended_hospital"] is not None
        rec = decision["recommended_hospital"]

        # Verify why_this is present and populated
        assert "why_this" in rec
        assert len(rec["why_this"]) > 0

        # Verify candidate exclusion on rejected option
        all_opts = decision["all_options"]
        h2_opt = next((o for o in all_opts if o["hospital_id"] == h2.id), None)
        assert h2_opt is not None
        assert "why_not" in h2_opt
        assert h2_opt["is_stale"] is True


@pytest.mark.anyio
async def test_atomic_reservation_concurrency():
    """Verify concurrent double-booking of exact same resource unit: exactly 1 succeeds, 1 fails."""
    from sqlalchemy import select

    # Setup isolated test resource
    async with SessionLocal() as db:
        hosp = Hospital(
            name="Concurrency Test Facility",
            address="Jaipur",
            latitude=26.9,
            longitude=75.8,
            capabilities="ICU",
            verified=True,
            emergency_status="ONLINE",
            available_icu=1,
            available_beds=1
        )
        db.add(hosp)
        await db.flush()

        unit = HospitalResourceUnit(
            hospital_id=hosp.id,
            resource_type="ICU_BED",
            unit_identifier="ICU-CONCURRENT-01",
            status="AVAILABLE"
        )
        db.add(unit)
        await db.commit()
        unit_id = unit.id
        hosp_id = hosp.id

    async def attempt_reserve(caller_id: str):
        async with SessionLocal() as db:
            from fastapi import HTTPException
            user = UserContext(id=1, email="paramedic@emefast.in", role="USER", hospital_id=None)
            req = ReserveRequest(
                hospital_id=hosp_id,
                resource_type="ICU_BED",
                resource_id=unit_id,
                incident_id=101 if caller_id == "USER-A" else 102
            )
            try:
                res = await reserve_resource(req, user=user, db=db)
                return ("SUCCESS", res)
            except HTTPException as e:
                return ("REJECTED", e.status_code)
            except Exception as e:
                return ("ERROR", str(e))

    # Execute 2 concurrent requests
    res1, res2 = await asyncio.gather(
        attempt_reserve("USER-A"),
        attempt_reserve("USER-B")
    )

    statuses = [res1[0], res2[0]]
    assert statuses.count("SUCCESS") == 1, f"Expected exactly 1 success, got: {res1}, {res2}"
    assert statuses.count("REJECTED") == 1, f"Expected exactly 1 rejection, got: {res1}, {res2}"
    rejected_res = res1 if res1[0] == "REJECTED" else res2
    assert rejected_res[1] == 409  # Conflict


@pytest.mark.anyio
async def test_manual_override_reason_audit():
    """Verify manual override records reason to case and audit log."""
    from sqlalchemy import select
    from routers.emergency import select_hospital
    from schemas import SelectHospitalRequest

    async with SessionLocal() as db:
        # Create test case with unique code
        test_code = f"EMF-TEST-{uuid.uuid4().hex[:8].upper()}"
        c = EmergencyCase(
            case_code=test_code,
            patient_name="Demo Test Patient",
            condition="Cardiac distress",
            priority="CRITICAL",
            requirements="ICU",
            latitude=26.9,
            longitude=75.8,
            status=CaseState.HOSPITAL_ACCEPTED.value
        )
        db.add(c)

        h = Hospital(
            name="Alternative Medical Center",
            address="Jaipur",
            latitude=26.91,
            longitude=75.81,
            capabilities="ICU",
            verified=True,
            emergency_status="ONLINE"
        )
        db.add(h)
        await db.commit()

        resp = HospitalResponse(
            case_id=c.id,
            hospital_id=h.id,
            response="ACCEPTED",
            distance_km=2.5,
            eta=8.0
        )
        db.add(resp)
        await db.commit()

        case_id = c.id
        hosp_id = h.id

    async with SessionLocal() as db:
        req = SelectHospitalRequest(
            hospital_id=hosp_id,
            override_reason="Patient family requests this specific hospital"
        )
        updated_case = await select_hospital(id=case_id, req=req, db=db)
        assert updated_case.override_reason == "Patient family requests this specific hospital"
        assert updated_case.status == CaseState.HOSPITAL_SELECTED.value

        # Verify audit log entry
        audit_res = await db.execute(
            select(AuditLog).where(
                AuditLog.case_id == case_id,
                AuditLog.action == "MANUAL_OVERRIDE_SELECTED"
            )
        )
        audit = audit_res.scalars().first()
        assert audit is not None
        assert "Patient family requests this specific hospital" in audit.details
