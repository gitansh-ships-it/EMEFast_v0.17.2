from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
import datetime

from database import get_db
from models import Hospital, EmergencyCase, HospitalResponse, AuditLog, CaseState
from schemas import HospitalOut, HospitalUpdate, HospitalRespondRequest, EmergencyCaseOut, HospitalResponseOut
from auth import require_hospital, UserContext

router = APIRouter(prefix="/api/hospitals", tags=["hospitals"])

@router.get("", response_model=List[HospitalOut])
async def get_all_hospitals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hospital).order_by(Hospital.name.asc()))
    return result.scalars().all()

@router.get("/verified", response_model=List[HospitalOut])
async def get_verified_hospitals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Hospital).where(Hospital.verified == True).order_by(Hospital.name.asc())
    )
    return result.scalars().all()

@router.get("/{id}", response_model=HospitalOut)
async def get_hospital(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hospital).where(Hospital.id == id))
    hosp = result.scalars().first()
    if not hosp:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return hosp

@router.get("/{id}/incoming", response_model=List[EmergencyCaseOut])
async def get_incoming_requests_for_hospital(
    id: int,
    user: UserContext = Depends(require_hospital),
    db: AsyncSession = Depends(get_db)
):
    """Get pending emergency requests broadcast to this hospital."""
    if user.role == "HOSPITAL" and user.hospital_id is not None and user.hospital_id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Hospital accounts can only access their own incoming query stream"
        )
    query = await db.execute(
        select(EmergencyCase)
        .join(HospitalResponse, HospitalResponse.case_id == EmergencyCase.id)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(
            HospitalResponse.hospital_id == id,
            HospitalResponse.response == "PENDING",
            EmergencyCase.status.in_([
                CaseState.WAITING_FOR_RESPONSES.value,
                CaseState.PARTIAL_RESPONSES.value,
                CaseState.HOSPITAL_ACCEPTED.value
            ])
        )
        .order_by(EmergencyCase.created_at.desc())
    )
    return query.scalars().all()

@router.get("/{id}/active-cases", response_model=List[EmergencyCaseOut])
async def get_active_cases_for_hospital(
    id: int,
    user: UserContext = Depends(require_hospital),
    db: AsyncSession = Depends(get_db)
):
    """Get active incoming or admitted cases for this hospital."""
    if user.role == "HOSPITAL" and user.hospital_id is not None and user.hospital_id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Hospital accounts can only access their own active case records"
        )
    query = await db.execute(
        select(EmergencyCase)
        .options(selectinload(EmergencyCase.responses).selectinload(HospitalResponse.hospital), selectinload(EmergencyCase.selected_hospital))
        .where(
            (EmergencyCase.selected_hospital_id == id) |
            (EmergencyCase.id.in_(
                select(HospitalResponse.case_id).where(
                    HospitalResponse.hospital_id == id,
                    HospitalResponse.response.in_(["ACCEPTED", "SELECTED"])
                )
            )),
            EmergencyCase.status.in_([
                CaseState.HOSPITAL_ACCEPTED.value,
                CaseState.HOSPITAL_SELECTED.value
            ])
        )
        .order_by(EmergencyCase.created_at.desc())
    )
    return query.scalars().all()

@router.post("/{id}/respond/{case_id}")
async def respond_to_case(
    id: int,
    case_id: int,
    req: HospitalRespondRequest,
    user: UserContext = Depends(require_hospital),
    db: AsyncSession = Depends(get_db)
):
    """Hospital accepts or rejects an incoming emergency case."""
    if user.role == "HOSPITAL" and user.hospital_id is not None and user.hospital_id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot submit emergency response on behalf of another hospital facility"
        )
        
    hosp_query = await db.execute(select(Hospital).where(Hospital.id == id))
    hospital = hosp_query.scalars().first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    resp_query = await db.execute(
        select(HospitalResponse).where(
            HospitalResponse.case_id == case_id,
            HospitalResponse.hospital_id == id
        )
    )
    resp = resp_query.scalars().first()
    if not resp:
        raise HTTPException(status_code=404, detail="Response record not found for this hospital and case")
        
    case_query = await db.execute(select(EmergencyCase).where(EmergencyCase.id == case_id))
    case = case_query.scalars().first()
    if not case:
        raise HTTPException(status_code=404, detail="Emergency case not found")
        
    if case.status in [CaseState.COMPLETED.value, CaseState.CANCELLED.value]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot respond to an emergency case that is already {case.status}"
        )
        
    action_type = req.response.upper() # ACCEPTED or REJECTED
    resp.response = action_type
    resp.rejection_reason = req.rejection_reason if action_type == "REJECTED" else None
    resp.responded_at = datetime.datetime.utcnow()
    if req.eta is not None:
        resp.eta = req.eta
        
    # Add Audit Log
    audit = AuditLog(
        case_id=case.id,
        performed_by=hospital.name,
        action=f"HOSPITAL_{action_type}",
        details=f"Hospital '{hospital.name}' marked case {case.case_code} as {action_type}. Reason: {req.rejection_reason or 'Accepted'}"
    )
    db.add(audit)
    
    # Canonical Case Lifecycle Transitions:
    # WAITING_FOR_RESPONSES -> PARTIAL_RESPONSES (on REJECTED)
    # WAITING_FOR_RESPONSES / PARTIAL_RESPONSES -> HOSPITAL_ACCEPTED (on ACCEPTED)
    if action_type == "ACCEPTED":
        if case.status in [CaseState.WAITING_FOR_RESPONSES.value, CaseState.PARTIAL_RESPONSES.value]:
            case.status = CaseState.HOSPITAL_ACCEPTED.value
    elif action_type == "REJECTED":
        if case.status == CaseState.WAITING_FOR_RESPONSES.value:
            case.status = CaseState.PARTIAL_RESPONSES.value
        
    await db.commit()
    return {
        "status": "success",
        "case_id": case.id,
        "case_code": case.case_code,
        "hospital_id": hospital.id,
        "response": action_type,
        "eta": resp.eta,
        "rejection_reason": resp.rejection_reason
    }

@router.put("/{id}/resources", response_model=HospitalOut)
@router.patch("/{id}/resources", response_model=HospitalOut)
async def update_hospital_resources(
    id: int,
    res_in: HospitalUpdate,
    user: UserContext = Depends(require_hospital),
    db: AsyncSession = Depends(get_db)
):
    if user.role == "HOSPITAL" and user.hospital_id is not None and user.hospital_id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot update resource records of another hospital facility"
        )
    result = await db.execute(select(Hospital).where(Hospital.id == id))
    hosp = result.scalars().first()
    if not hosp:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    if res_in.emergency_status is not None:
        hosp.emergency_status = res_in.emergency_status
    if res_in.capabilities is not None:
        hosp.capabilities = res_in.capabilities
    if res_in.emergency_capacity is not None:
        hosp.emergency_capacity = res_in.emergency_capacity
    if res_in.available_beds is not None:
        hosp.available_beds = res_in.available_beds
    if res_in.available_icu is not None:
        hosp.available_icu = res_in.available_icu
    if res_in.oxygen_available is not None:
        hosp.oxygen_available = res_in.oxygen_available
    if res_in.blood_units is not None:
        hosp.blood_units = res_in.blood_units
    if res_in.trauma_capability is not None:
        hosp.trauma_capability = res_in.trauma_capability

    # New: handle supported_insurance field
    if getattr(res_in, "supported_insurance", None) is not None:
        from backend.constants.insurance import validate_insurance_codes
        unknown = validate_insurance_codes(res_in.supported_insurance)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown insurance codes: {', '.join(unknown)}")
        hosp.supported_insurance = res_in.supported_insurance

    await db.commit()
    await db.refresh(hosp)
    return hosp
