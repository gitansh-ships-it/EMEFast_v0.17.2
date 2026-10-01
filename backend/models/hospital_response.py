from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import datetime
from .base import Base

class HospitalResponse(Base):
    __tablename__ = "hospital_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("emergency_cases.id"), nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    response = Column(String, default="PENDING") # PENDING, ACCEPTED, REJECTED, SELECTED
    rejection_reason = Column(String, nullable=True)
    eta = Column(Float, nullable=True) # Estimated travel time in minutes
    distance_km = Column(Float, nullable=True) # Distance in kilometers
    estimated_cost = Column(Integer, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    simulated = Column(Boolean, nullable=True, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    emergency_case = relationship("EmergencyCase", back_populates="responses")
    hospital = relationship("Hospital")
