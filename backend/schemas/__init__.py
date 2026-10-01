from pydantic import BaseModel, Field, model_validator
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
    supported_insurance: Optional[List[str]] = None

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
    supported_insurance: List[str] = Field(default_factory=list)
    available_beds: Optional[int] = None
    available_icu: Optional[int] = None
    response: str # PENDING, ACCEPTED, REJECTED, SELECTED
    rejection_reason: Optional[str] = None
    eta: Optional[float] = None
    distance_km: Optional[float] = None
    estimated_cost: Optional[int] = None
    responded_at: Optional[datetime] = None
    simulated: Optional[bool] = False

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def populate_hospital_relationship(cls, data: Any) -> Any:
        if hasattr(data, "hospital") and data.hospital is not None:
            h = data.hospital
            return {
                "id": getattr(data, "id", None),
                "case_id": getattr(data, "case_id", None),
                "hospital_id": getattr(data, "hospital_id", None),
                "hospital_name": getattr(h, "name", None),
                "hospital_address": getattr(h, "address", None),
                "hospital_capabilities": getattr(h, "capabilities", None),
                "supported_insurance": getattr(h, "supported_insurance", []) or [],
                "available_beds": getattr(h, "available_beds", None),
                "available_icu": getattr(h, "available_icu", None),
                "response": getattr(data, "response", "PENDING"),
                "rejection_reason": getattr(data, "rejection_reason", None),
                "eta": getattr(data, "eta", None),
                "distance_km": getattr(data, "distance_km", None),
                "estimated_cost": getattr(data, "estimated_cost", None),
                "responded_at": getattr(data, "responded_at", None),
                "simulated": getattr(data, "simulated", False) or False,
            }
        return data

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
    gps_accuracy: Optional[float] = None
    stored_accuracy: Optional[float] = None
    gps_source: Optional[str] = "DEVICE"
    gps_timestamp: Optional[datetime] = None
    stored_timestamp: Optional[datetime] = None

class EmergencyCaseUpdateStatus(BaseModel):
    status: str # Canonical: DRAFT, BROADCASTING, WAITING_FOR_RESPONSES, PARTIAL_RESPONSES, HOSPITAL_ACCEPTED, HOSPITAL_SELECTED, COMPLETED, CANCELLED

class SelectHospitalRequest(BaseModel):
    hospital_id: int
    override_reason: Optional[str] = None

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
    hospitals_contacted: Optional[int] = None
    selected_hospital_id: Optional[int] = None
    selected_hospital_eta: Optional[float] = None
    selected_hospital: Optional[HospitalOut] = None
    override_reason: Optional[str] = None
    gps_accuracy: Optional[float] = None
    stored_accuracy: Optional[float] = None
    gps_source: Optional[str] = None
    gps_timestamp: Optional[datetime] = None
    stored_timestamp: Optional[datetime] = None
    description: Optional[str] = None
    voice_note_path: Optional[str] = None
    voice_transcript: Optional[str] = None
    created_at: datetime
    responses: List[HospitalResponseOut] = []

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def populate_hospitals_contacted(cls, data: Any) -> Any:
        if hasattr(data, "responses"):
            resps = getattr(data, "responses", None) or []
            if not hasattr(data, "hospitals_contacted") or getattr(data, "hospitals_contacted", None) is None:
                # We can dynamically treat len(responses) as hospitals_contacted if not set
                try:
                    setattr(data, "hospitals_contacted", len(resps))
                except Exception:
                    pass
        elif isinstance(data, dict):
            if "hospitals_contacted" not in data or data.get("hospitals_contacted") is None:
                data["hospitals_contacted"] = len(data.get("responses") or [])
        return data

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
    # New: expose supported insurance codes for the hospital
    supported_insurance: List[str] = Field(default_factory=list)
    rejection_reason: Optional[str] = None
    explanation: List[str] = Field(default_factory=list)
    flag: Optional[str] = None
    requirement_unconfirmed: bool = False
    why_this: List[str] = Field(default_factory=list)
    why_not: List[str] = Field(default_factory=list)
    primary_exclusion: Optional[str] = None
    confidence: Optional[str] = "High"
    is_stale: bool = False
    simulated: bool = False

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
