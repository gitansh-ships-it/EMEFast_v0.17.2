from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import HospitalResourceUnit, ResourceReservation, Hospital
from database import get_db
from pydantic import BaseModel
from datetime import datetime, timedelta
from auth import require_authenticated, require_hospital, UserContext

import asyncio

router = APIRouter(prefix="/api/resources", tags=["resources"])
_reserve_lock = asyncio.Lock()

class ReserveRequest(BaseModel):
    hospital_id: int
    resource_type: str
    resource_id: int
    incident_id: int

async def cleanup_expired_reservations(db: AsyncSession):
    """Automatically release HELD reservations that have exceeded their 15-minute expiry."""
    now = datetime.utcnow()
    expired_stmt = select(ResourceReservation).where(
        ResourceReservation.status == "HELD",
        ResourceReservation.expires_at < now
    )
    expired_res = await db.execute(expired_stmt)
    for res in expired_res.scalars().all():
        res.status = "EXPIRED"
        unit_res = await db.execute(
            select(HospitalResourceUnit).where(HospitalResourceUnit.id == res.resource_id)
        )
        unit = unit_res.scalar_one_or_none()
        if unit and unit.status == "RESERVED" and unit.current_incident_id == res.incident_id:
            unit.status = "AVAILABLE"
            unit.current_incident_id = None
            if unit.resource_type == "ICU_BED":
                h_res = await db.execute(select(Hospital).where(Hospital.id == unit.hospital_id))
                h = h_res.scalar_one_or_none()
                if h:
                    h.available_icu += 1

@router.post("/reserve")
async def reserve_resource(
    req: ReserveRequest,
    user: UserContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db)
):
    # Automatically release any expired 15-minute holds first
    await cleanup_expired_reservations(db)

    async with _reserve_lock:
        # ROW-LEVEL LOCKING (SELECT ... FOR UPDATE) + In-Process Serialized Lock
        try:
            hospital_check = await db.execute(select(Hospital).where(Hospital.id == req.hospital_id))
            if hospital_check.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Hospital not found")
            stmt = select(HospitalResourceUnit).where(HospitalResourceUnit.id == req.resource_id).with_for_update()
            result = await db.execute(stmt)
            resource = result.scalar_one_or_none()
            
            if not resource:
                raise HTTPException(status_code=404, detail="Resource not found")
                
            if resource.hospital_id != req.hospital_id or resource.resource_type != req.resource_type:
                raise HTTPException(status_code=400, detail="Resource does not belong to requested hospital/type")
            if resource.status != "AVAILABLE":
                raise HTTPException(status_code=409, detail="RESOURCE_ALREADY_RESERVED")
                
            # Update resource status
            resource.status = "RESERVED"
            resource.current_incident_id = req.incident_id
            
            # Create Reservation
            res = ResourceReservation(
                hospital_id=req.hospital_id,
                resource_type=req.resource_type,
                resource_id=req.resource_id,
                incident_id=req.incident_id,
                status="HELD",
                expires_at=datetime.utcnow() + timedelta(minutes=15)
            )
            db.add(res)
            
            # Update aggregate counters (consistency invariant)
            if req.resource_type == "ICU_BED":
                hosp_res = await db.execute(select(Hospital).where(Hospital.id == req.hospital_id))
                hosp = hosp_res.scalar_one_or_none()
                if hosp and hosp.available_icu > 0:
                    hosp.available_icu -= 1
                    
            await db.commit()
            return {"status": "success", "reservation_id": res.id}
            
        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Resource reservation failed")

class ReleaseRequest(BaseModel):
    resource_id: int

@router.post("/{resource_id}/release")
async def release_resource(
    resource_id: int,
    user: UserContext = Depends(require_hospital),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(HospitalResourceUnit).where(HospitalResourceUnit.id == resource_id).with_for_update()
        result = await db.execute(stmt)
        resource = result.scalar_one_or_none()
        
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")
            
        if user.role == "HOSPITAL" and user.hospital_id is not None and user.hospital_id != resource.hospital_id:
            raise HTTPException(status_code=403, detail="Hospital is not authorized to release resources of another facility")

        if resource.status != "RESERVED":
            raise HTTPException(status_code=400, detail="Resource is not currently reserved")
            
        resource.status = "AVAILABLE"
        resource.current_incident_id = None
        
        res_stmt = select(ResourceReservation).where(ResourceReservation.resource_id == resource_id, ResourceReservation.status == "HELD")
        res_result = await db.execute(res_stmt)
        for reservation in res_result.scalars().all():
            reservation.status = "RELEASED"
            
        # Update aggregate
        if resource.resource_type == "ICU_BED":
            hosp_res = await db.execute(select(Hospital).where(Hospital.id == resource.hospital_id))
            hosp = hosp_res.scalar_one_or_none()
            if hosp:
                hosp.available_icu += 1
                
        await db.commit()
        return {"status": "success"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        from logging_config import logger
        logger.error(f"Resource release failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Resource release failed: {exc}")
