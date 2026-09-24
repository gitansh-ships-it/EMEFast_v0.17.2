from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
import datetime
from models.base import Base

class PatientHealthProfile(Base):
    __tablename__ = "patient_health_profiles"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, unique=True, index=True, nullable=False) # e.g., ABHA ID
    full_name = Column(String, nullable=False)
    blood_group = Column(String)
    allergies = Column(JSON, default=list)
    current_medications = Column(JSON, default=list)
    chronic_conditions = Column(JSON, default=list)
    emergency_contacts = Column(JSON, default=list)
    medical_history = Column(Text)
    vitals_summary = Column(JSON, default=dict)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
