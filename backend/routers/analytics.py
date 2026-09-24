from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select
from models import EmergencyCase, HospitalResponse, Hospital
from database import get_db
from datetime import datetime,timedelta
router=APIRouter(prefix="/api/analytics",tags=["analytics"])
@router.get("/incidents")
async def get_analytics(time_filter:str="7D",db:AsyncSession=Depends(get_db)):
    now=datetime.utcnow(); bound=now-timedelta(days={"24H":1,"7D":7,"30D":30}.get(time_filter,3650))
    total=(await db.execute(select(func.count(EmergencyCase.id)).where(EmergencyCase.created_at>=bound))).scalar() or 0
    critical=(await db.execute(select(func.count(EmergencyCase.id)).where(EmergencyCase.priority=="CRITICAL",EmergencyCase.created_at>=bound))).scalar() or 0
    avg=(await db.execute(select(func.avg((func.julianday(HospitalResponse.responded_at)-func.julianday(HospitalResponse.created_at))*1440.0)).where(HospitalResponse.responded_at.is_not(None),HospitalResponse.created_at>=bound))).scalar()
    sev=(await db.execute(select(EmergencyCase.priority,func.count(EmergencyCase.id)).where(EmergencyCase.created_at>=bound).group_by(EmergencyCase.priority))).all()
    typ=(await db.execute(select(EmergencyCase.condition,func.count(EmergencyCase.id)).where(EmergencyCase.created_at>=bound).group_by(EmergencyCase.condition))).all()
    return {"kpis":{"total":total,"critical":critical,"avg_response":round(avg,1) if avg is not None else None},"by_severity":[{"name":x,"value":c} for x,c in sev],"by_type":[{"name":x,"value":c} for x,c in typ]}
