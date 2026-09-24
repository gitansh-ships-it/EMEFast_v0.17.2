from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
import datetime
from models.base import Base

class ResourceReservation(Base):
    __tablename__ = "resource_reservations"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(Integer, ForeignKey("hospital_resource_units.id"), nullable=False)
    incident_id = Column(Integer, ForeignKey("emergency_cases.id"), nullable=False)
    status = Column(String, default="HELD") # HELD, CONFIRMED, RELEASED, EXPIRED
    reserved_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
