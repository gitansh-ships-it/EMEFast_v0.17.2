import re
import math
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import EmergencyCase, Hospital, HospitalResponse

BROADCAST_RADIUS_KM = 25.0

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r=6371.0; dlat=math.radians(lat2-lat1); dlon=math.radians(lon2-lon1)
    a=math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return round(r*2*math.atan2(math.sqrt(a), math.sqrt(1-a)),2)

def estimate_eta_minutes(distance_km: float, speed_kmh: float=35.0, traffic_factor: float=1.15) -> float:
    if distance_km <= 0: return 1.0
    return max(round((distance_km/speed_kmh)*60*traffic_factor,1),2.0)

def required_capabilities(case: EmergencyCase) -> set[str]:
    text=' '.join([(case.condition or ''),(case.requirements or ''),(case.description or '')]).lower()
    req=set()
    # Explicit clinical requirements using word boundaries to prevent substring collisions (e.g. "Difficulty breathing" containing "icu")
    if re.search(r'\bicu\b', text): req.add('icu')
    if re.search(r'\b(ventilator|ventilation)\b', text): req.add('ventilator')
    if re.search(r'\b(oxygen|spo2)\b', text): req.add('oxygen')
    for key in ['cardiac','cardiologist','neuro','neurosurgeon','trauma','orthopedic','pediatric','maternity','obstetric','stroke']:
        if re.search(rf'\b{key}\b', text): req.add(key)
    return req

def capability_match(case: EmergencyCase, hosp: Hospital) -> tuple[bool,list[str]]:
    req=required_capabilities(case); caps=(hosp.capabilities or '').lower()
    missing=[]
    if 'icu' in req and (hosp.available_icu or 0)<=0: missing.append('ICU bed')
    if 'oxygen' in req and not hosp.oxygen_available: missing.append('oxygen')
    if 'trauma' in req and not hosp.trauma_capability: missing.append('trauma care')
    if 'ventilator' in req and 'ventilator' not in caps: missing.append('ventilator')
    mapping={'cardiac':'cardiac','cardiologist':'cardiac','neuro':'neuro','neurosurgeon':'neuro','stroke':'neuro','orthopedic':'orthopedic','pediatric':'pediatric','maternity':'maternity','obstetric':'maternity','trauma':'trauma'}
    for r, needle in mapping.items():
        if r in req and needle not in caps: missing.append(r)
    return (not missing), missing

async def evaluate_decision_engine(db: AsyncSession, case: EmergencyCase) -> Dict[str, Any]:
    rows=(await db.execute(select(HospitalResponse,Hospital).join(Hospital,HospitalResponse.hospital_id==Hospital.id).where(HospitalResponse.case_id==case.id))).all()
    accepted=[]; all_options=[]; accepted_count=rejected_count=pending_count=0
    for resp,hosp in rows:
        dist=resp.distance_km if resp.distance_km is not None else calculate_haversine_distance(case.latitude,case.longitude,hosp.latitude,hosp.longitude)
        eta=resp.eta if resp.eta is not None else estimate_eta_minutes(dist)
        cost=resp.estimated_cost if resp.estimated_cost is not None else (hosp.estimated_emergency_cost or 0)
        if resp.response=='ACCEPTED': accepted_count+=1
        elif resp.response=='REJECTED': rejected_count+=1
        else: pending_count+=1
        feasible,missing=capability_match(case,hosp)
        feasible=feasible and hosp.verified and hosp.emergency_status=='ONLINE' and (hosp.available_beds or 0)>0
        # Cost is a comparison factor (5% weight), never an eligibility substitute.
        score=0.0
        if resp.response=='ACCEPTED' and feasible:
            eta_score=max(0.0,100.0-min(eta*3,100.0))
            is_high_acuity = case.priority in {'CRITICAL', 'HIGH', 'UNASSESSED'}
            if 'icu' in required_capabilities(case):
                resource_score = min(100.0, (hosp.available_icu or 0) * 15.0)
            elif is_high_acuity:
                # Score boost for hospitals with available ICU capacity when patient is high acuity or unassessed
                base_beds = min(60.0, (hosp.available_beds or 0) * 2.0)
                icu_boost = min(40.0, (hosp.available_icu or 0) * 10.0)
                resource_score = base_beds + icu_boost
            else:
                resource_score = min(100.0, (hosp.available_beds or 0) * 2.0)
            cost_score=max(0.0,100.0-min((cost/1000.0),100.0))
            # Ranking weights: ETA 0.70, resources 0.25, cost 0.05
            score=round(eta_score*0.70 + resource_score*0.25 + cost_score*0.05,1)
        explanation=[f'Response: {resp.response}',f'ETA: {eta} min',f'Estimated emergency cost: ₹{cost:,}']
        if feasible: explanation.append('Eligibility: requirements currently satisfied')
        elif missing: explanation.append('Not feasible: missing '+', '.join(sorted(set(missing))))
        elif hosp.emergency_status!='ONLINE': explanation.append('Not feasible: ER currently offline')
        elif not hosp.verified: explanation.append('Not feasible: hospital not verified')
        elif (hosp.available_beds or 0)<=0: explanation.append('Not feasible: no emergency beds available')
        opt={'hospital_id':hosp.id,'hospital_name':hosp.name,'latitude':hosp.latitude,'longitude':hosp.longitude,'hospital_address':hosp.address,'hospital_capabilities':hosp.capabilities or '', 'response':resp.response,'rejection_reason':resp.rejection_reason,'eta':eta,'distance_km':dist,'available_icu':hosp.available_icu or 0,'available_beds':hosp.available_beds or 0,'estimated_cost':cost,'is_recommended':False,'score':score,'explanation':explanation,'capability_match':feasible}
        all_options.append(opt)
        if resp.response=='ACCEPTED' and feasible: accepted.append(opt)

    accepted.sort(key=lambda x:(-x['score'],x['eta'],x['estimated_cost']))
    partial_matches = []
    if not accepted:
        # Fallback: if an explicitly requested capability (e.g. ICU) isn't available anywhere,
        # return ranked partial matches flagged "requirement not confirmed", never an empty list.
        for opt in all_options:
            if opt['response'] == 'ACCEPTED' and (opt['available_beds'] or 0) > 0:
                eta_score = max(0.0, 100.0 - min(opt['eta'] * 3, 100.0))
                resource_score = min(100.0, (opt['available_beds'] or 0) * 2.0)
                cost_score = max(0.0, 100.0 - min((opt['estimated_cost'] / 1000.0), 100.0))
                partial_score = round(eta_score * 0.70 + resource_score * 0.25 + cost_score * 0.05, 1)
                opt['score'] = partial_score
                opt['flag'] = "requirement not confirmed"
                opt['requirement_unconfirmed'] = True
                opt['explanation'].append("Notice: requirement not confirmed (no ICU available at this facility). Ranked for emergency stabilization.")
                partial_matches.append(opt)
        partial_matches.sort(key=lambda x: (-x['score'], x['eta'], x['estimated_cost']))

    if accepted:
        recommended = accepted[0]
        recommended['is_recommended'] = True
        for o in all_options:
            if o['hospital_id'] == recommended['hospital_id']: o['is_recommended'] = True
        decision_summary = f"Recommended {recommended['hospital_name']} as the best overall accepted feasible option. {accepted_count} accepted, {rejected_count} rejected, {pending_count} pending."
    elif partial_matches:
        recommended = partial_matches[0]
        recommended['is_recommended'] = True
        for o in all_options:
            if o['hospital_id'] == recommended['hospital_id']:
                o['is_recommended'] = True
                o['flag'] = "requirement not confirmed"
                o['requirement_unconfirmed'] = True
        decision_summary = f"Notice: requirement not confirmed. Recommended {recommended['hospital_name']} for immediate emergency stabilization ({accepted_count} accepted, {rejected_count} rejected, {pending_count} pending)."
        accepted = partial_matches
    elif pending_count:
        decision_summary = f"Emergency query is live across {len(rows)} nearby verified hospitals. Awaiting ER responses."
    else:
        decision_summary = 'No feasible hospital has accepted this case yet.'

    pool = accepted if accepted else partial_matches
    fastest = min(pool, key=lambda x:(x['eta'], x['estimated_cost'])) if pool else None
    cheapest = min(pool, key=lambda x:(x['estimated_cost'], x['eta'])) if pool else None
    return {'case_id':case.id,'case_code':case.case_code,'recommended_hospital':recommended,'fastest_hospital':fastest,'cheapest_hospital':cheapest,'all_options':all_options,'total_evaluated':len(rows),'accepted_count':accepted_count,'rejected_count':rejected_count,'pending_count':pending_count,'decision_summary':decision_summary}
