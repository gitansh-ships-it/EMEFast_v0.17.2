from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
import datetime
from models.base import Base

class HospitalResourceUnit(Base):
    __tablename__ = "hospital_resource_units"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    resource_type = Column(String, nullable=False) # e.g., ICU_BED, ER_BED
    unit_identifier = Column(String, nullable=False) # e.g., BED-042
    status = Column(String, default="AVAILABLE") # AVAILABLE, RESERVED, OCCUPIED, MAINTENANCE
    current_incident_id = Column(Integer, ForeignKey("emergency_cases.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
