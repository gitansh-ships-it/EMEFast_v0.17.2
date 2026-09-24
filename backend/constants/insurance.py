# backend/constants/insurance.py
"""
Master list of supported insurance schemes and utilities.

NOTE: Insurance names and codes evolve over time; review this file periodically.
"""

from typing import List

# Master list grouped by category. Each entry is a tuple of (code, display_name).
MASTER_INSURANCE_LIST = [
    # Government / Public Schemes
    ("PMJAY", "Ayushman Bharat PM-JAY"),
    ("VAYVANDANA", "Ayushman Vay Vandana (70+ senior citizens)"),
    ("CGHS", "Central Government Health Scheme"),
    ("ECHS", "Ex-Servicemen Contributory Health Scheme"),
    ("ESIC", "Employees' State Insurance Corporation"),
    # Public-sector insurers
    ("UTTAR_PRADESH_STATE", "Uttar Pradesh State Insurance"),
    ("MAHARASTRA_STATE", "Maharashtra State Insurance"),
    # Private insurers
    ("APOLLO_MED", "Apollo Medica"),
    ("MAX_HEALTH", "MAX Healthcare Insurance"),
    ("RELIGARE", "Religare Health Insurance"),
    # Life insurers with health cover
    ("LIC_HEALTH", "LIC Health Insurance"),
    ("HDFC_LIFE", "HDFC Life Health Cover"),
    # Third‑party administrators (TPAs)
    ("TATA_AIG", "Tata AIG TPA"),
    ("ICICI_TPA", "ICICI Lombard TPA"),
    # Other / miscellaneous
    ("OTHERS", "Other Insurance Providers"),
]

# Helper set for fast lookup
_MASTER_CODES = {code for code, _ in MASTER_INSURANCE_LIST}


def validate_insurance_codes(codes: List[str]) -> List[str]:
    """Return a list of unknown insurance codes.

    The function does **not** raise an HTTPException; callers can decide how to
    handle the result (e.g., raise an error in the API layer).
    """
    unknown = [c for c in codes if c not in _MASTER_CODES]
    return unknown
