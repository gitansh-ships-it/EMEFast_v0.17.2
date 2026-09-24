from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
import datetime
from models.base import Base

class PreArrivalAlert(Base):
    __tablename__ = "prearrival_alerts"
    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("emergency_cases.id"), nullable=False, unique=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    status = Column(String, default="PENDING") # PENDING, ACKNOWLEDGED, PREPARED, ARRIVED
    eta_minutes = Column(Integer)
    patient_summary = Column(JSON, default=dict)
    case_summary = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    prepared_at = Column(DateTime, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
