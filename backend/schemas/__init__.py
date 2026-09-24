from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_name: str
    hospital_id: Optional[int] = None

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None
    role: str = "USER" # USER, HOSPITAL, ADMIN
    hospital_id: Optional[int] = None

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    role: str
    hospital_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Hospital Schemas ---
class HospitalBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    verified: bool = True
    emergency_status: str = "ONLINE"
    capabilities: str = "Emergency Stabilization, Trauma Care, Cardiac ICU"
    emergency_capacity: int = 50
    available_beds: int = 30
    available_icu: int = 10
    oxygen_available: bool = True
    blood_units: int = 40
    trauma_capability: bool = True
    estimated_emergency_cost: int = 25000
    contact_phone: Optional[str] = "+91 141 2560291"
    supported_insurance: List[str] = []  # List of insurance codes

class HospitalUpdate(BaseModel):
    emergency_status: Optional[str] = None
    capabilities: Optional[str] = None
    emergency_capacity: Optional[int] = None
    available_beds: Optional[int] = None
    available_icu: Optional[int] = None
    oxygen_available: Optional[bool] = None
    blood_units: Optional[int] = None
    trauma_capability: Optional[bool] = None
    estimated_emergency_cost: Optional[int] = None

class HospitalOut(HospitalBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class HospitalVerifyRequest(BaseModel):
    verified: bool
    emergency_status: Optional[str] = "ONLINE"

# --- Hospital Response Schemas ---
class HospitalResponseOut(BaseModel):
    id: int
    case_id: int
    hospital_id: int
    hospital_name: Optional[str] = None
    hospital_address: Optional[str] = None
    hospital_capabilities: Optional[str] = None
    response: str # PENDING, ACCEPTED, REJECTED, SELECTED
    rejection_reason: Optional[str] = None
    eta: Optional[float] = None
    distance_km: Optional[float] = None
    estimated_cost: Optional[int] = None
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class HospitalRespondRequest(BaseModel):
    response: str # ACCEPTED, REJECTED
    rejection_reason: Optional[str] = None
    eta: Optional[float] = None

# --- Emergency Case Schemas ---
class EmergencyCaseCreate(BaseModel):
    patient_name: str
    patient_age: Optional[int] = None
    abha_id: Optional[str] = None # e.g. "91-4829-1048-2041"
    transport_mode: str = "SELF_TRANSPORT" # SELF_TRANSPORT, AMBULANCE
    condition: str
    priority: str = "HIGH" # CRITICAL, HIGH, MEDIUM, LOW
    requirements: str = "Emergency stabilization"
    vitals: Optional[str] = None # e.g. "HR: 118 bpm, SpO2: 91%, BP: 90/60"
    latitude: float
    longitude: float
    address: Optional[str] = "Jaipur, Rajasthan"
    ambulance_details: Optional[str] = None
    description: Optional[str] = None
    voice_transcript: Optional[str] = None

class EmergencyCaseUpdateStatus(BaseModel):
    status: str # Canonical: DRAFT, BROADCASTING, WAITING_FOR_RESPONSES, PARTIAL_RESPONSES, HOSPITAL_ACCEPTED, HOSPITAL_SELECTED, COMPLETED, CANCELLED

class SelectHospitalRequest(BaseModel):
    hospital_id: int

class EmergencyCaseOut(BaseModel):
    id: int
    case_code: str
    user_id: Optional[int] = None
    abha_id: Optional[str] = None
    transport_mode: str
    patient_name: str
    patient_age: Optional[int] = None
    condition: str
    priority: str
    requirements: str
    vitals: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    ambulance_details: Optional[str] = None
    status: str
    selected_hospital_id: Optional[int] = None
    selected_hospital_eta: Optional[float] = None
    selected_hospital: Optional[HospitalOut] = None
    description: Optional[str] = None
    voice_note_path: Optional[str] = None
    voice_transcript: Optional[str] = None
    created_at: datetime
    responses: List[HospitalResponseOut] = []

    class Config:
        from_attributes = True

# --- Decision Engine Schemas ---
class RecommendedOption(BaseModel):
    hospital_id: int
    hospital_name: str
    hospital_address: str
    latitude: float
    longitude: float
    hospital_capabilities: str
    response: str # ACCEPTED
    eta: float
    distance_km: float
    available_icu: int
    available_beds: int
    estimated_cost: int
    is_recommended: bool
    score: float
    capability_match: bool = False
    rejection_reason: Optional[str] = None
    explanation: List[str]
    flag: Optional[str] = None
    requirement_unconfirmed: bool = False

class DecisionEngineResult(BaseModel):
    fastest_hospital: Optional[RecommendedOption] = None
    cheapest_hospital: Optional[RecommendedOption] = None
    case_id: int
    case_code: str
    recommended_hospital: Optional[RecommendedOption] = None
    all_options: List[RecommendedOption] = []
    total_evaluated: int
    accepted_count: int
    rejected_count: int
    pending_count: int
    decision_summary: str

# --- Audit Log Schemas ---
class AuditLogOut(BaseModel):
    id: int
    case_id: Optional[int] = None
    performed_by: str
    action: str
    details: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# --- Admin Schemas ---
class AdminMetricsOut(BaseModel):
    active_emergencies: int
    verified_hospitals: int
    total_hospitals: int
    available_hospitals: int
    cases_today: int
    avg_response_time_minutes: float
