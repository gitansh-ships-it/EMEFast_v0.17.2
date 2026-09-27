import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token

client = TestClient(app)

def get_hospital_token(hospital_id: int = 1):
    payload = {
        "sub": f"hospital{hospital_id}@emefast.example",
        "role": "HOSPITAL",
        "hospital_id": hospital_id,
        "user_id": 1,
    }
    return create_access_token(payload)

def test_put_valid_supported_insurance():
    # Update hospital 1 with valid insurance codes
    resp = client.patch(
        "/api/hospitals/1/resources",
        json={"supported_insurance": ["PMJAY", "CGHS"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["supported_insurance"] == ["PMJAY", "CGHS"]

def test_put_invalid_supported_insurance():
    resp = client.patch(
        "/api/hospitals/1/resources",
        json={"supported_insurance": ["UNKNOWN_CODE"]},
    )
    assert resp.status_code == 400
    assert "UNKNOWN_CODE" in resp.json()["detail"]

def test_hospital_cannot_update_other():
    token = get_hospital_token(hospital_id=2)
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.patch(
        "/api/hospitals/1/resources",
        json={"supported_insurance": ["PMJAY"]},
        headers=headers,
    )
    assert resp.status_code == 403

def test_update_without_trauma_and_insurance():
    # Ensure other fields still update correctly
    resp = client.patch(
        "/api/hospitals/1/resources",
        json={"available_beds": 7},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["available_beds"] == 7

def test_hospital_none_cannot_update_any():
    # Hospital token with hospital_id=None must be rejected
    payload = {
        "sub": "hospital_none@example.com",
        "role": "HOSPITAL",
        "hospital_id": None,
        "user_id": 1,
    }
    token = create_access_token(payload)
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.patch(
        "/api/hospitals/1/resources",
        json={"supported_insurance": ["PMJAY"]},
        headers=headers,
    )
    assert resp.status_code == 403

def test_put_hospital_insurances_endpoint_valid():
    token = get_hospital_token(hospital_id=1)
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.put(
        "/api/hospitals/1/insurances",
        json={"supported_insurance": ["RGHS", "PMJAY", "CGHS", "STAR_HEALTH"]},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "RGHS" in data["supported_insurance"]
    assert "STAR_HEALTH" in data["supported_insurance"]

    # Verify GET returns same
    get_resp = client.get("/api/hospitals/1/insurances")
    assert get_resp.status_code == 200
    assert "RGHS" in get_resp.json()["supported_insurance"]

def test_put_hospital_insurances_endpoint_invalid_code():
    token = get_hospital_token(hospital_id=1)
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.put(
        "/api/hospitals/1/insurances",
        json={"supported_insurance": ["INVALID_SCHEME_XYZ"]},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "INVALID_SCHEME_XYZ" in resp.json()["detail"]
