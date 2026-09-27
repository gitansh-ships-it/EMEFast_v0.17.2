# backend/constants/insurance.py
"""
Master list of supported insurance schemes and utilities.
Re-exports from backend.constants.insurance_codes for full compatibility.
"""

try:
    from .insurance_codes import (
        MASTER_INSURANCE_LIST,
        _MASTER_CODES,
        validate_insurance_codes,
    )
except ImportError:
    from insurance_codes import (
        MASTER_INSURANCE_LIST,
        _MASTER_CODES,
        validate_insurance_codes,
    )

__all__ = [
    "MASTER_INSURANCE_LIST",
    "_MASTER_CODES",
    "validate_insurance_codes",
]
