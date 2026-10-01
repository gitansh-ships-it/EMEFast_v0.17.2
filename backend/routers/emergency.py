from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pathlib import Path
from uuid import uuid4
import os

from database import get_db
from models import EmergencyCase, Hospital, HospitalResponse, AuditLog, CaseState, validate_case_transition
from schemas import EmergencyCaseCreate, EmergencyCaseOut, EmergencyCaseUpdateStatus, SelectHospitalRequest, DecisionEngineResult
from services.hospital_matching import evaluate_decision_engine, calculate_haversine_distance, estimate_eta_minutes
from services.storage import get_voice_storage
from auth import require_authenticated, UserContext

router = APIRouter(prefix="/api/emergency", tags=["emergency"])


@router.post("/{id}/voice-note")
async def upload_voice_note(
    id: int,
    request: Request,
    user: UserContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db)
):
    """Store a recorded emergency voice note and optional transcript with the case.

    The browser sends the audio Blob directly as the request body; no multipart dependency is required.
    """
    case_result = await db.execute(select(EmergencyCase).where(EmergencyCase.id == id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")

    content_type = (request.headers.get("content-type") or "audio/webm").split(";")[0].lower()
    allowed = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/mpeg": ".mp3"}
    suffix = allowed.get(content_type)
    if not suffix:
        raise HTTPException(status_code=415, detail="Unsupported audio format")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty voice recording")
    if len(body) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Voice recording exceeds 15 MB limit")

    storage = get_voice_storage()
    filename = f"{case.case_code}-{uuid4().hex}{suffix}"
    stored_name = await storage.save_voice_note(filename, body, content_type)

    transcript = request.headers.get("x-voice-transcript")
    case.voice_note_path = storage.get_public_url(id, stored_name)
    if transcript:
        case.voice_transcript = transcript[:10000]
    await db.commit()
    return {"status": "saved", "case_id": id, "voice_note_path": case.voice_note_path, "transcript": case.voice_transcript}

@router.get("/{id}/voice-note/{filename}")
async def get_voice_note(id: int, filename: str, db: AsyncSession = Depends(get_db)):
    case_result = await db.execute(select(EmergencyCase).where(EmergencyCase.id == id))
    case = case_result.scalar_one_or_none()
    if not case or not case.voice_note_path or not filename:
        raise HTTPException(status_code=404, detail="Voice note not found")
    expected = Path(case.voice_note_path).name
    if filename != expected:
        raise HTTPException(status_code=404, detail="Voice note not found")
    storage = get_voice_storage()
    try:
        data, content_type = await storage.get_voice_note(filename)
        return Response(content=data, media_type=content_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Voice note file not found")

@router.post("/new", response_model=EmergencyCaseOut)
async def create_emergency_case(
    case_in: EmergencyCaseCreate,
    user_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    # Generate authoritative permanent Incident ID e.g. EMF-2026-1001-00042
    import datetime
    from sqlalchemy import func
    today = datetime.datetime.utcnow()
    date_prefix = f"EMF-{today.strftime('%Y-%m%d')}"
    count_res = await db.execute(select(func.count(EmergencyCase.id)))
    next_seq = (count_res.scalar() or 0) + 1
    case_code = f"{date_prefix}-{next_seq:05d}"
    
    # Ensure standard emergency stabilization is always preserved
    raw_reqs = (case_in.requirements or "").strip()
    if raw_reqs:
        req_parts = [r.strip() for r in raw_reqs.split(",") if r.strip()]
        if "Emergency stabilization" not in req_parts:
            req_parts.insert(0, "Emergency stabilization")
        final_requirements = ", ".join(req_parts)
    else:
        final_requirements = "Emergency stabilization"

    gps_acc = case_in.gps_accuracy if case_in.gps_accuracy is not None else case_in.stored_accuracy
    gps_src = case_in.gps_source or ("MANUAL" if gps_acc is None else "DEVICE")
    gps_ts = case_in.gps_timestamp or case_in.stored_timestamp or datetime.datetime.utcnow()

    new_case = EmergencyCase(
        case_code=case_code,
        user_id=user_id,
        abha_id=case_in.abha_id,
        transport_mode=case_in.transport_mode.upper(),
        patient_name=case_in.patient_name,
        patient_age=case_in.patient_age,
        condition=case_in.condition,
        priority=case_in.priority.upper(),
        requirements=final_requirements,
        vitals=case_in.vitals,
        latitude=case_in.latitude,
        longitude=case_in.longitude,
        address=case_in.address,
        ambulance_details=case_in.ambulance_details,
        status=CaseState.BROADCASTING.value,
        description=case_in.description,
        voice_transcript=case_in.voice_transcript,
        gps_accuracy=gps_acc,
        gps_source=gps_src,
        gps_timestamp=gps_ts,
    )
    db.add(new_case)
    await db.flush()
    
    # 1. Discover nearby verified hospitals within the configured radius.
    from services.hospital_matching import BROADCAST_RADIUS_KM
    hosp_query = await db.execute(select(Hospital).where(Hospital.verified == True, Hospital.emergency_status == "ONLINE"))
    hospitals = [h for h in hosp_query.scalars().all() if calculate_haversine_distance(new_case.latitude, new_case.longitude, h.latitude, h.longitude) <= BROADCAST_RADIUS_KM]
    
    # 2. Broadcast to hospitals (create HospitalResponse records).
    # DEMO_MODE defaults to "0" (off). Set DEMO_MODE=1 explicitly to test automated responses.
    demo_mode = os.getenv("DEMO_MODE", "0").lower() in {"1", "true", "yes", "on"}
    raw_desk_ids = os.getenv("DEMO_DESK_HOSPITAL_IDS", "1,2")
    demo_desk_ids = {int(x.strip()) for x in raw_desk_ids.split(",") if x.strip().isdigit()}

    hospitals.sort(key=lambda h: calculate_haversine_distance(new_case.latitude, new_case.longitude, h.latitude, h.longitude))
    has_any_accepted = False
    for index, hosp in enumerate(hospitals):
        dist = calculate_haversine_distance(new_case.latitude, new_case.longitude, hosp.latitude, hosp.longitude)
        eta = estimate_eta_minutes(dist)
        response_state = "PENDING"
        is_simulated = False
        rejection_reason = None

        if demo_mode:
            if hosp.id in demo_desk_ids:
                # These hospitals always remain PENDING so their dashboard inbox receives the case!
                response_state = "PENDING"
                is_simulated = False
            elif index in (0, 1, 3, 4):
                response_state = "ACCEPTED"
                is_simulated = True
                has_any_accepted = True
            elif index in (2, 5):
                response_state = "REJECTED"
                is_simulated = True
                rejection_reason = "No matching specialist capacity for this demo case"

        resp = HospitalResponse(
            case_id=new_case.id,
            hospital_id=hosp.id,
            response=response_state,
            rejection_reason=rejection_reason,
            distance_km=dist,
            eta=eta,
            estimated_cost=hosp.estimated_emergency_cost,
            simulated=is_simulated
        )
        db.add(resp)
        
    # 3. Create Audit Log
    audit = AuditLog(
        case_id=new_case.id,
        performed_by=case_in.patient_name,
        action="EMERGENCY_CREATED",
        details=f"Case {case_code} created with transport mode {new_case.transport_mode} and priority {new_case.priority}. Broadcast to {len(hospitals)} verified hospitals."
    )
    db.add(audit)
    
    # Broadcast phase complete: transition to WAITING_FOR_RESPONSES (or HOSPITAL_ACCEPTED if any accepted)
    if has_any_accepted:
        new_case.status = CaseState.HOSPITAL_ACCEPTED.value
    else:
        new_case.status = CaseState.WAITING_FOR_RESPONSES.value
    await db.commit()
    
    # Re-fetch with loaded responses
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == new_case.id)
    )
    fetched_case = result.scalar_one()
    return fetched_case

@router.get("/active/current", response_model=Optional[EmergencyCaseOut])
async def get_active_emergency_case(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.status.not_in([CaseState.COMPLETED.value, CaseState.CANCELLED.value]))
        .order_by(EmergencyCase.created_at.desc())
    )
    case = result.scalars().first()
    return case

@router.get("/history/all", response_model=List[EmergencyCaseOut])
async def get_emergency_history(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .order_by(EmergencyCase.created_at.desc())
        .limit(50)
    )
    cases = result.scalars().all()
    return cases

@router.get("/{id}", response_model=EmergencyCaseOut)
async def get_emergency_case(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == id)
    )
    case = result.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
    return case

@router.get("/{id}/recommendation", response_model=DecisionEngineResult)
async def get_case_recommendation(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmergencyCase).where(EmergencyCase.id == id)
    )
    case = result.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
        
    engine_result = await evaluate_decision_engine(db, case)
    return engine_result

@router.post("/{id}/select-hospital", response_model=EmergencyCaseOut)
async def select_hospital(
    id: int,
    req: SelectHospitalRequest,
    user: UserContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db)
):
    case_query = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == id)
    )
    case = case_query.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
        
    if case.status != CaseState.HOSPITAL_ACCEPTED.value:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot select hospital: case status is '{case.status}', must be '{CaseState.HOSPITAL_ACCEPTED.value}'"
        )
        
    hosp_query = await db.execute(
        select(Hospital).where(Hospital.id == req.hospital_id)
    )
    hospital = hosp_query.scalars().first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    selected_response = next((r for r in case.responses if r.hospital_id == hospital.id), None)
    if not selected_response or selected_response.response != "ACCEPTED":
        raise HTTPException(status_code=409, detail="Hospital must accept the emergency case before selection")
    if hospital.emergency_status != "ONLINE" or not hospital.verified:
        raise HTTPException(status_code=409, detail="Hospital is not currently available")
    # Calculate ETA to selected hospital
    dist = calculate_haversine_distance(case.latitude, case.longitude, hospital.latitude, hospital.longitude)
    eta = estimate_eta_minutes(dist)
    
    # Update case
    case.selected_hospital_id = hospital.id
    case.selected_hospital_eta = eta
    case.override_reason = req.override_reason.strip() if req.override_reason else None
    case.status = CaseState.HOSPITAL_SELECTED.value
    
    # Mark response as SELECTED
    for r in case.responses:
        if r.hospital_id == hospital.id:
            r.response = "SELECTED"
            
    # Add Audit Log / Timeline event
    if req.override_reason and req.override_reason.strip():
        action_name = "MANUAL_OVERRIDE_SELECTED"
        audit_details = f"Manual override: Hospital '{hospital.name}' selected for case {case.case_code}. Reason: {req.override_reason.strip()}. ETA: {eta} mins ({dist} km)."
    else:
        action_name = "HOSPITAL_SELECTED"
        audit_details = f"Hospital '{hospital.name}' selected for case {case.case_code}. ETA: {eta} mins ({dist} km)."

    audit = AuditLog(
        case_id=case.id,
        performed_by="USER",
        action=action_name,
        details=audit_details
    )
    db.add(audit)
    
    await db.commit()
    
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == id)
    )
    return result.scalar_one()

@router.get("/{id}/timeline")
async def get_emergency_timeline(id: int, db: AsyncSession = Depends(get_db)):
    """Authoritative emergency timeline events recorded for this incident."""
    case_res = await db.execute(select(EmergencyCase).where(EmergencyCase.id == id))
    case = case_res.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
        
    logs_res = await db.execute(
        select(AuditLog)
        .where(AuditLog.case_id == id)
        .order_by(AuditLog.timestamp.asc())
    )
    logs = logs_res.scalars().all()
    events = [
        {
            "id": l.id,
            "incident_id": case.case_code,
            "action": l.action,
            "performed_by": l.performed_by,
            "details": l.details,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None
        }
        for l in logs
    ]
    return {
        "case_id": case.id,
        "incident_id": case.case_code,
        "events": events
    }

@router.post("/{id}/status", response_model=EmergencyCaseOut)
async def update_case_status(
    id: int,
    status_in: EmergencyCaseUpdateStatus,
    user: UserContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db)
):
    case_query = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == id)
    )
    case = case_query.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
        
    requested_status = status_in.status.upper().strip()
    
    # Normalize legacy values if sent by legacy clients
    legacy_map = {
        "SEARCHING": CaseState.WAITING_FOR_RESPONSES.value,
        "AWAITING_RESPONSE": CaseState.WAITING_FOR_RESPONSES.value,
        "ACCEPTED": CaseState.HOSPITAL_ACCEPTED.value,
        "CLOSED": CaseState.COMPLETED.value,
    }
    target_status = legacy_map.get(requested_status, requested_status)

    try:
        new_state = validate_case_transition(case.status, target_status)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))

    case.status = new_state.value
    
    audit = AuditLog(
        case_id=case.id,
        performed_by=user.role if user else "SYSTEM",
        action="STATUS_UPDATED",
        details=f"Case {case.case_code} status transitioned to {case.status}."
    )
    db.add(audit)
    await db.commit()
    
    result = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(EmergencyCase.id == id)
    )
    return result.scalar_one()

@router.post("/cleanup-audit-tests")
async def cleanup_audit_tests(db: AsyncSession = Depends(get_db)):
    """Delete test cases created during audit runs from the database."""
    result = await db.execute(
        select(EmergencyCase).where(EmergencyCase.id >= 17)
    )
    cases = result.scalars().all()
    case_ids = [c.id for c in cases]
    if case_ids:
        await db.execute(delete(AuditLog).where(AuditLog.case_id.in_(case_ids)))
        await db.execute(delete(HospitalResponse).where(HospitalResponse.case_id.in_(case_ids)))
        for c in cases:
            await db.delete(c)
        await db.commit()
    return {"status": "success", "deleted_case_ids": case_ids, "deleted_count": len(case_ids)}
