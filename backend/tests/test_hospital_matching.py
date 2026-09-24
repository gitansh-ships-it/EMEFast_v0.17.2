from types import SimpleNamespace
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.hospital_matching import calculate_haversine_distance, estimate_eta_minutes, capability_match

def case(**kw):
    base=dict(priority='HIGH', condition='', requirements='', description='')
    base.update(kw)
    return SimpleNamespace(**base)

def hospital(**kw):
    base=dict(available_icu=5, oxygen_available=True, trauma_capability=True, capabilities='cardiac, neuro, orthopedic, pediatric, maternity, trauma', verified=True, emergency_status='ONLINE', available_beds=10)
    base.update(kw)
    return SimpleNamespace(**base)

def test_distance_zero():
    assert calculate_haversine_distance(26.9,75.8,26.9,75.8)==0.0

def test_eta_positive():
    assert estimate_eta_minutes(10)>0

def test_icu_required():
    ok,_=capability_match(case(requirements='ICU required'), hospital(available_icu=0))
    assert not ok

def test_ventilator_capability_required():
    ok,missing=capability_match(case(requirements='Ventilator required'), hospital(capabilities='cardiac'))
    assert not ok and 'ventilator' in missing

def test_online_verified_hospital_with_capacity_matches():
    ok,missing=capability_match(case(requirements='ICU + oxygen'), hospital())
    assert ok and not missing
