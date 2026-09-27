import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_master_list_groups_and_counts():
    resp = client.get("/api/insurance/master-list")
    assert resp.status_code == 200
    data = resp.json()
    # Expect exactly 6 groups as defined in _GROUPS
    assert len(data) == 6
    # Each group must contain at least one item
    for group in data:
        assert isinstance(group.get("items"), list)
        assert len(group["items"]) > 0
