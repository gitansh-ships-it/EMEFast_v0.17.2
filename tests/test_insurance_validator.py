# tests/test_insurance_validator.py
"""Tests for the insurance code validator defined in backend/constants/insurance.py"""

from backend.constants.insurance import validate_insurance_codes


def test_validate_known_codes_returns_empty():
    known = ["PMJAY", "CGHS", "MAX_HEALTH"]
    assert validate_insurance_codes(known) == []


def test_validate_unknown_codes_returns_them():
    mixed = ["PMJAY", "UNKNOWN1", "UNKNOWN2"]
    unknown = validate_insurance_codes(mixed)
    assert set(unknown) == {"UNKNOWN1", "UNKNOWN2"}
