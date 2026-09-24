from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from models.base import Base

from enum import Enum

class CaseState(str, Enum):
    DRAFT = "DRAFT"
    BROADCASTING = "BROADCASTING"
    WAITING_FOR_RESPONSES = "WAITING_FOR_RESPONSES"
    PARTIAL_RESPONSES = "PARTIAL_RESPONSES"
    HOSPITAL_ACCEPTED = "HOSPITAL_ACCEPTED"
    HOSPITAL_SELECTED = "HOSPITAL_SELECTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

# Canonical lifecycle transitions: exactly the approved state machine
VALID_CASE_TRANSITIONS: dict[CaseState, set[CaseState]] = {
    CaseState.DRAFT: {CaseState.BROADCASTING, CaseState.CANCELLED},
    CaseState.BROADCASTING: {CaseState.WAITING_FOR_RESPONSES, CaseState.CANCELLED},
    CaseState.WAITING_FOR_RESPONSES: {CaseState.PARTIAL_RESPONSES, CaseState.HOSPITAL_ACCEPTED, CaseState.CANCELLED},
    CaseState.PARTIAL_RESPONSES: {CaseState.HOSPITAL_ACCEPTED, CaseState.CANCELLED},
    CaseState.HOSPITAL_ACCEPTED: {CaseState.HOSPITAL_SELECTED, CaseState.CANCELLED},
    CaseState.HOSPITAL_SELECTED: {CaseState.COMPLETED, CaseState.CANCELLED},
    CaseState.COMPLETED: set(), # Terminal
    CaseState.CANCELLED: set(), # Terminal
}

def can_transition_case(current_status: str, target_status: str) -> bool:
    try:
        current_state = CaseState(current_status)
        target_state = CaseState(target_status)
    except (ValueError, KeyError):
        return False
    return target_state in VALID_CASE_TRANSITIONS.get(current_state, set())

def validate_case_transition(current_status: str, target_status: str) -> CaseState:
    try:
        current_state = CaseState(current_status)
    except ValueError:
        raise ValueError(f"Unknown current case state: '{current_status}'")
    try:
        target_state = CaseState(target_status)
    except ValueError:
        raise ValueError(f"Unknown target case state: '{target_status}'")
    if target_state not in VALID_CASE_TRANSITIONS.get(current_state, set()):
        raise ValueError(
            f"Invalid case state transition: '{current_state.value}' -> '{target_state.value}'. "
            f"Allowed transitions from '{current_state.value}': {[s.value for s in VALID_CASE_TRANSITIONS.get(current_state, set())]}"
        )
    return target_state

class EmergencyCase(Base):
    __tablename__ = "emergency_cases"
    
    id = Column(Integer, primary_key=True, index=True)
    case_code = Column(String, unique=True, index=True, nullable=False) # e.g. EME-1042
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    abha_id = Column(String, nullable=True) # e.g. 91-4829-1048-2041 or ABHA-1234-5678
    transport_mode = Column(String, default="SELF_TRANSPORT") # SELF_TRANSPORT, AMBULANCE
    patient_name = Column(String, nullable=False)
    patient_age = Column(Integer, nullable=True)
    condition = Column(String, nullable=False)
    priority = Column(String, default="HIGH") # CRITICAL, HIGH, MEDIUM, LOW
    requirements = Column(String, default="Emergency stabilization")
    vitals = Column(String, nullable=True) # e.g. "HR: 118 bpm, SpO2: 91%, BP: 90/60"
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String, nullable=True)
    ambulance_details = Column(String, nullable=True) # Used if transport_mode == AMBULANCE
    status = Column(String, default=CaseState.WAITING_FOR_RESPONSES.value, index=True) # Canonical CaseState
    selected_hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    selected_hospital_eta = Column(Float, nullable=True) # in minutes
    description = Column(Text, nullable=True)
    voice_note_path = Column(String, nullable=True)
    voice_transcript = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])
    selected_hospital = relationship("Hospital", foreign_keys=[selected_hospital_id])
    responses = relationship("HospitalResponse", back_populates="emergency_case", cascade="all, delete-orphan")

# Compatibility alias
Incident = EmergencyCase
