# backend/constants/insurance_codes.py
"""
Master list of supported insurance schemes, TPAs, and private insurers in India.
Includes Ayushman Bharat (PM-JAY), RGHS, CGHS, ECHS, ESIC, public-sector insurers,
private health insurers, and TPAs.
"""

from typing import List, Tuple

MASTER_INSURANCE_LIST: List[Tuple[str, str]] = [
    # 1. Government / Public Schemes
    ("PMJAY", "Ayushman Bharat PM-JAY"),
    ("VAYVANDANA", "Ayushman Vay Vandana (70+ Senior Citizens)"),
    ("CGHS", "Central Government Health Scheme (CGHS)"),
    ("ECHS", "Ex-Servicemen Contributory Health Scheme (ECHS)"),
    ("ESIC", "Employees' State Insurance Corporation (ESIC)"),
    ("CAPF", "Central Armed Police Forces (CAPF) Scheme"),
    ("RELHS", "Railway Employees Liberalized Health Scheme"),
    ("RGHS", "Rajasthan Government Health Scheme (RGHS)"),
    ("MAA_YOJANA", "Mukhyamantri Amrutum (MAA) Yojana"),
    ("STATE_OTHER", "Other State Government Health Schemes"),

    # 2. Public-Sector General Insurers
    ("NEW_INDIA", "New India Assurance"),
    ("UNITED_INDIA", "United India Insurance"),
    ("NATIONAL", "National Insurance Company"),
    ("ORIENTAL", "Oriental Insurance Company"),

    # 3. Private Health / General Insurers
    ("STAR_HEALTH", "Star Health & Allied Insurance"),
    ("HDFC_ERGO", "HDFC ERGO General Insurance"),
    ("ICICI_LOMBARD", "ICICI Lombard General Insurance"),
    ("NIVA_BUPA", "Niva Bupa Health Insurance (Max Bupa)"),
    ("CARE_HEALTH", "Care Health Insurance (Religare)"),
    ("BAJAJ_ALLIANZ", "Bajaj Allianz General Insurance"),
    ("ADITYA_BIRLA", "Aditya Birla Health Insurance"),
    ("TATA_AIG", "Tata AIG General Insurance"),
    ("MANIPAL_CIGNA", "ManipalCigna Health Insurance"),
    ("SBI_GENERAL", "SBI General Insurance"),
    ("CHOLAMANDAL_MS", "Cholamandalam MS General Insurance"),
    ("ROYAL_SUNDARAM", "Royal Sundaram General Insurance"),
    ("UNIVERSAL_SUNDARAM", "Universal Sompo General Insurance"),
    ("FUTURE_GENERALI", "Future Generali India Insurance"),
    ("LIBERTY_GENERAL", "Liberty General Insurance"),
    ("DIGIT", "Go Digit General Insurance"),
    ("ACKO", "Acko General Insurance"),
    ("NAVI", "Navi General Insurance"),
    ("ZUNO", "Zuno General Insurance"),
    ("KOTAK_GENERAL", "Kotak Mahindra General Insurance"),
    ("IFFCO_TOKIO", "IFFCO Tokio General Insurance"),
    ("MAGMA", "Magma HDI General Insurance"),
    ("RAHEJA_QBE", "Raheja QBE General Insurance"),
    ("RELIANCE_GENERAL", "Reliance General Insurance"),
    ("SHRIRAM_GENERAL", "Shriram General Insurance"),
    ("GO_DIGIT", "Digit Health Insurance"),
    ("MAX_HEALTH", "MAX Healthcare Insurance"),
    ("RELIGARE", "Religare Health Insurance"),
    ("APOLLO_MED", "Apollo Medica"),
    ("ICICI_TPA", "ICICI Lombard TPA"),
    ("UTTAR_PRADESH_STATE", "Uttar Pradesh State Insurance"),
    ("MAHARASTRA_STATE", "Maharashtra State Insurance"),
    ("OTHERS", "Other Insurance Providers"),
    ("PRIVATE_OTHER", "Other Private Health Insurers"),

    # 4. Life Insurers with Health Cover
    ("LIC_HEALTH", "LIC Health Protection Plan"),
    ("HDFC_LIFE", "HDFC Life Health Cover"),
    ("SBI_LIFE", "SBI Life Health Cover"),
    ("MAX_LIFE", "Max Life Health Insurance"),
    ("ICICI_PRUDENTIAL", "ICICI Prudential Life Health"),
    ("LIFE_OTHER", "Other Life Health Insurance"),

    # 5. TPAs (Third-Party Administrators)
    ("MEDI_ASSIST", "Medi Assist TPA"),
    ("PARAMOUNT", "Paramount Health Services TPA"),
    ("MDINDIA", "MDIndia Health Insurance TPA"),
    ("VIDAL", "Vidal Health TPA"),
    ("HEALTH_INDIA", "Health India Insurance TPA"),
    ("FHPL", "Family Health Plan Insurance TPA (FHPL)"),
    ("RAKSHA", "Raksha TPA"),
    ("HERITAGE", "Heritage Health TPA"),
    ("SAFEWAY", "Safeway Insurance TPA"),
    ("GENINS", "Genins India TPA"),
    ("PARK_MEDICLAIM", "Park Mediclaim TPA"),
    ("TPA_OTHER", "Other Third-Party Administrators"),

    # 6. Other / Cashless / Corporate
    ("CORPORATE_GROUP", "Corporate / Employer Group Health Insurance"),
    ("CASH_SELF_PAY", "Cash / Self-Pay / Reimbursement"),
    ("NONE_NOT_SURE", "Uninsured / Not Sure"),
]

# Helper set for fast validation
_MASTER_CODES = {code for code, _ in MASTER_INSURANCE_LIST}


def validate_insurance_codes(codes: List[str]) -> List[str]:
    """Return a list of unknown insurance codes.
    Empty list means all codes are valid.
    """
    if not codes:
        return []
    return [c for c in codes if c not in _MASTER_CODES]
