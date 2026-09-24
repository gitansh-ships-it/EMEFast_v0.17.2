from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import PatientHealthProfile
from database import get_db

router = APIRouter(prefix="/api/patients", tags=["health"])

@router.get("/{patient_id}/health-card")
async def get_health_card(patient_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PatientHealthProfile).where(PatientHealthProfile.patient_id == patient_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Health profile not found")
    return profile

