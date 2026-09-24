from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select
from models import EmergencyCase, Hospital, HospitalResponse, CaseState
from database import get_db

router=APIRouter(prefix="/api/dashboard",tags=["dashboard"])
@router.get("/stats")
async def get_stats(db:AsyncSession=Depends(get_db)):
    active=(await db.execute(select(func.count(EmergencyCase.id)).where(EmergencyCase.status.not_in([CaseState.COMPLETED.value, CaseState.CANCELLED.value])))).scalar() or 0
    online=(await db.execute(select(func.count(Hospital.id)).where(Hospital.verified==True,Hospital.emergency_status=="ONLINE"))).scalar() or 0
    icu=(await db.execute(select(func.coalesce(func.sum(Hospital.available_icu),0)).where(Hospital.verified==True,Hospital.emergency_status=="ONLINE"))).scalar() or 0
    avg=(await db.execute(select(func.avg((func.julianday(HospitalResponse.responded_at)-func.julianday(HospitalResponse.created_at))*1440.0)).where(HospitalResponse.responded_at.is_not(None)))).scalar()
    return {"active_emergencies":active,"hospitals_online":online,"icu_beds_available":int(icu),"average_response_time":round(avg,1) if avg is not None else None}
@router.get("/live")
async def get_live_data(db:AsyncSession=Depends(get_db)):
    cases=(await db.execute(select(EmergencyCase).where(EmergencyCase.status.not_in([CaseState.COMPLETED.value, CaseState.CANCELLED.value])).order_by(EmergencyCase.created_at.desc()).limit(50))).scalars().all()
    hospitals=(await db.execute(select(Hospital).order_by(Hospital.name.asc()))).scalars().all()
    return {"cases":cases,"hospitals":hospitals}
