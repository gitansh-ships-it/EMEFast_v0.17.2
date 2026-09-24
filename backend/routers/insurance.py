"""Insurance related API endpoints"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict

from backend.constants.insurance import MASTER_INSURANCE_LIST

router = APIRouter(prefix="/api/insurance", tags=["insurance"])

# Helper to group items by predefined categories
_GROUPS = {
    "GOVERNMENT / PUBLIC SCHEMES": [
        "PMJAY",
        "VAYVANDANA",
        "CGHS",
        "ECHS",
        "ESIC",
        "CAPF",
        "RELHS",
        "RGHS",
        "MAA_YOJANA",
        "STATE_OTHER",
    ],
    "PUBLIC‑SECTOR GENERAL INSURERS": [
        "NEW_INDIA",
        "UNITED_INDIA",
        "NATIONAL",
        "ORIENTAL",
    ],
    "PRIVATE HEALTH / GENERAL INSURERS": [
        "STAR_HEALTH",
        "HDFC_ERGO",
        "ICICI_LOMBARD",
        "NIVA_BUPA",
        "CARE_HEALTH",
        "BAJAJ_ALLIANZ",
        "ADITYA_BIRLA",
        "TATA_AIG",
        "MANIPAL_CIGNA",
        "SBI_GENERAL",
        "CHOLAMANDAL_MS",
        "ROYAL_SUNDARAM",
        "UNIVERSAL_SUNDARAM",
        "FUTURE_GENERALI",
        "LIBERTY_GENERAL",
        "DIGIT",
        "ACKO",
        "NAVI",
        "ZUNO",
        "KOTAK_GENERAL",
        "IFFCO_TOKIO",
        "MAGMA",
        "RAHEJA_QBE",
        "RELIANCE_GENERAL",
        "SHRIRAM_GENERAL",
        "GO_DIGIT",
        "PRIVATE_OTHER",
    ],
    "LIFE INSURERS WITH HEALTH COVER": [
        "LIC_HEALTH",
        "HDFC_LIFE",
        "SBI_LIFE",
        "MAX_LIFE",
        "ICICI_PRUDENTIAL",
        "LIFE_OTHER",
    ],
    "TPAS": [
        "MEDI_ASSIST",
        "PARAMOUNT",
        "MDINDIA",
        "VIDAL",
        "HEALTH_INDIA",
        "FHPL",
        "RAKSHA",
        "HERITAGE",
        "SAFEWAY",
        "GENINS",
        "PARK_MEDICLAIM",
        "TPA_OTHER",
    ],
    "OTHER": [
        "CORPORATE_GROUP",
        "CASH_SELF_PAY",
        "NONE_NOT_SURE",
    ],
}

@router.get("/master-list", response_model=List[Dict])
async def get_master_insurance_list():
    """Return master insurance list grouped by category."""
    result = []
    for group_name, codes in _GROUPS.items():
        items = []
        for code, name in MASTER_INSURANCE_LIST:
            if code in codes:
                items.append({"code": code, "name": name})
        if items:
            result.append({"group": group_name, "items": items})
    return result
