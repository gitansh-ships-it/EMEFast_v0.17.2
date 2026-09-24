export interface HospitalResponse {
  id: number;
  hospital_id: number;
  hospital_name: string;
  response: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  eta: number;
  distance_km?: number;
  estimated_cost?: number;
  rejection_reason?: string;
}

export type CaseState =
  | 'DRAFT'
  | 'BROADCASTING'
  | 'WAITING_FOR_RESPONSES'
  | 'PARTIAL_RESPONSES'
  | 'HOSPITAL_ACCEPTED'
  | 'HOSPITAL_SELECTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface EmergencyCase {
  id: number;
  case_code: string;
  patient_name: string;
  patient_age?: number;
  abha_id?: string;
  transport_mode: 'SELF_TRANSPORT' | 'AMBULANCE';
  condition: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNASSESSED';
  requirements: string;
  vitals?: string;
  latitude: number;
  longitude: number;
  address?: string;
  ambulance_details?: string;
  status: CaseState;
  responses?: HospitalResponse[];
  selected_hospital?: Hospital;
  voice_note_path?: string;
  voice_transcript?: string;
  created_at: string;
}

export interface Hospital {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capabilities: string;
  verified: boolean;
  available_icu: number;
  emergency_status?: 'ONLINE' | 'OFFLINE' | string;
  trauma_level?: string;
  available_beds?: number;
  supported_insurance?: string[];
  estimated_emergency_cost?: number;
}

export interface RecommendedOption {
  hospital_id: number;
  hospital_name: string;
  hospital_address: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  eta: number;
  available_icu: number;
  response: string;
  is_recommended: boolean;
  explanation: string[];
  rejection_reason?: string;
  hospital_capabilities?: string;
  match_score?: number;
  score?: number;
  capability_match?: boolean;
  estimated_cost: number;
  supported_insurance?: string[];
  flag?: string;

  requirement_unconfirmed?: boolean;
}

export interface DecisionEngineResult {
  case_id?: number;
  case_code?: string;
  recommended_hospital: RecommendedOption | null;
  fastest_hospital?: RecommendedOption | null;
  cheapest_hospital?: RecommendedOption | null;
  all_options: RecommendedOption[];
  total_evaluated?: number;
  accepted_count: number;
  rejected_count: number;
  pending_count: number;
  decision_summary?: string;
}

export interface AdminMetrics {
  active_emergencies: number;
  verified_hospitals: number;
  total_hospitals: number;
  cases_today: number;
  avg_response_time_minutes: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'HOSPITAL' | 'ADMIN';
  hospital_id?: number;
  voice_note_path?: string;
  voice_transcript?: string;
  created_at: string;
}
