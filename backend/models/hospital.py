from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
import datetime
from models.base import Base

class Hospital(Base):
    __tablename__ = "hospitals"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    verified = Column(Boolean, default=True)
    emergency_status = Column(String, default="ONLINE")  # ONLINE, BUSY, OFFLINE
    capabilities = Column(String, default="Emergency Stabilization, Trauma Care, Cardiac ICU")  # comma-separated list
    emergency_capacity = Column(Integer, default=50)
    available_beds = Column(Integer, default=30)
    available_icu = Column(Integer, default=10)
    oxygen_available = Column(Boolean, default=True)
    blood_units = Column(Integer, default=40)
    trauma_capability = Column(Boolean, default=True)
    estimated_emergency_cost = Column(Integer, default=25000)
    contact_phone = Column(String, default="+91 141 2560291")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
