from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import PreArrivalAlert, EmergencyCase
from database import get_db
from pydantic import BaseModel
import datetime

router = APIRouter(prefix="/api/hospital/er", tags=["er-prealert"])

class PreAlertCreate(BaseModel):
    case_id: int
    hospital_id: int
    eta_minutes: int | None = None

@router.post("/prealert")
async def create_prealert(req: PreAlertCreate, db: AsyncSession = Depends(get_db)):
    case = (await db.execute(select(EmergencyCase).where(EmergencyCase.id == req.case_id))).scalar_one_or_none()
    if not case: raise HTTPException(404, "Emergency case not found")
    existing = (await db.execute(select(PreArrivalAlert).where(PreArrivalAlert.incident_id == req.case_id))).scalar_one_or_none()
    if existing:
        existing.hospital_id=req.hospital_id; existing.eta_minutes=req.eta_minutes; existing.status="PENDING"
        alert=existing
    else:
        alert=PreArrivalAlert(incident_id=req.case_id,hospital_id=req.hospital_id,eta_minutes=req.eta_minutes,
            patient_summary={"name":case.patient_name,"age":case.patient_age,"priority":case.priority,"requirements":case.requirements,"vitals":case.vitals},
            case_summary=case.description or case.condition)
        db.add(alert)
    await db.commit(); await db.refresh(alert)
    return {"status":"created","prealert_id":alert.id}

@router.get("/incoming")
async def get_incoming(db: AsyncSession = Depends(get_db)):
    rows=(await db.execute(select(PreArrivalAlert).where(PreArrivalAlert.status.in_(["PENDING","ACKNOWLEDGED","PREPARED"])).order_by(PreArrivalAlert.created_at.desc()))).scalars().all()
    return [{"id":a.id,"case_id":a.incident_id,"hospital_id":a.hospital_id,"status":a.status,"eta_minutes":a.eta_minutes,"patient_summary":a.patient_summary,"case_summary":a.case_summary} for a in rows]

async def _set_status(id:int,status_value:str,db:AsyncSession):
    alert=(await db.execute(select(PreArrivalAlert).where(PreArrivalAlert.id==id))).scalar_one_or_none()
    if not alert: raise HTTPException(404,"Pre-arrival alert not found")
    alert.status=status_value
    now=datetime.datetime.utcnow()
    if status_value=="ACKNOWLEDGED": alert.acknowledged_at=now
    if status_value=="PREPARED": alert.prepared_at=now
    if status_value=="ARRIVED": alert.arrived_at=now
    await db.commit(); return {"status":"success","prealert_id":id,"state":status_value}

@router.post("/{id}/acknowledge")
async def ack(id:int,db:AsyncSession=Depends(get_db)): return await _set_status(id,"ACKNOWLEDGED",db)
@router.post("/{id}/prepare")
async def prepare(id:int,db:AsyncSession=Depends(get_db)): return await _set_status(id,"PREPARED",db)
@router.post("/{id}/arrived")
async def arrived(id:int,db:AsyncSession=Depends(get_db)):
    alert=(await db.execute(select(PreArrivalAlert).where(PreArrivalAlert.id==id))).scalar_one_or_none()
    if not alert: raise HTTPException(404,"Pre-arrival alert not found")
    alert.status="ARRIVED"; alert.arrived_at=datetime.datetime.utcnow()
    await db.commit(); return {"status":"success","prealert_id":id,"state":"ARRIVED"}
