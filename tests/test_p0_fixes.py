import asyncio
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock

sys.path.append('backend')
from services.hospital_matching import evaluate_decision_engine
from models import EmergencyCase, Hospital, HospitalResponse

class TestP0Fixes(unittest.IsolatedAsyncioTestCase):
    async def test_hospital_recommendation_when_all_pending(self):
        """Verify that evaluate_decision_engine returns cleanly without UnboundLocalError when all responses are PENDING."""
        case = EmergencyCase(
            id=101,
            case_code="TEST-101",
            latitude=28.6139,
            longitude=77.2090,
            priority="CRITICAL",
            condition="Difficulty breathing",
            requirements="ICU",
            description="Testing pending responses"
        )

        hosp = Hospital(
            id=1,
            name="Apollo Hospital",
            latitude=28.6150,
            longitude=77.2100,
            address="Delhi",
            capabilities="icu, ventilator, cardiac, trauma",
            available_icu=5,
            available_beds=20,
            oxygen_available=True,
            trauma_capability=True,
            verified=True,
            emergency_status="ONLINE",
            estimated_emergency_cost=15000
        )

        resp = HospitalResponse(
            id=1,
            case_id=case.id,
            hospital_id=hosp.id,
            response="PENDING",
            distance_km=1.2,
            eta=4.0
        )

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [(resp, hosp)]
        mock_db.execute.return_value = mock_result

        result = await evaluate_decision_engine(mock_db, case)

        self.assertIsNotNone(result)
        self.assertEqual(result["case_id"], 101)
        self.assertIsNone(result["recommended_hospital"], "Recommended hospital should be None when all are PENDING")
        self.assertEqual(result["pending_count"], 1)
        self.assertEqual(result["accepted_count"], 0)
        self.assertIn("Awaiting ER responses", result["decision_summary"])
        print("[PASS] test_hospital_recommendation_when_all_pending passed successfully!")

    async def test_hospital_recommendation_when_accepted(self):
        """Verify that evaluate_decision_engine correctly assigns recommended_hospital when accepted."""
        case = EmergencyCase(
            id=102,
            case_code="TEST-102",
            latitude=28.6139,
            longitude=77.2090,
            priority="CRITICAL",
            condition="Chest pain",
            requirements="cardiac",
            description="Heart attack symptoms"
        )

        hosp = Hospital(
            id=2,
            name="Max Healthcare",
            latitude=28.6160,
            longitude=77.2120,
            address="Delhi",
            capabilities="cardiac, icu, emergency",
            available_icu=3,
            available_beds=15,
            oxygen_available=True,
            trauma_capability=False,
            verified=True,
            emergency_status="ONLINE",
            estimated_emergency_cost=18000
        )

        resp = HospitalResponse(
            id=2,
            case_id=case.id,
            hospital_id=hosp.id,
            response="ACCEPTED",
            distance_km=2.0,
            eta=6.0
        )

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [(resp, hosp)]
        mock_db.execute.return_value = mock_result

        result = await evaluate_decision_engine(mock_db, case)

        self.assertIsNotNone(result)
        self.assertIsNotNone(result["recommended_hospital"])
        self.assertEqual(result["recommended_hospital"]["hospital_name"], "Max Healthcare")
        self.assertEqual(result["accepted_count"], 1)
        self.assertEqual(result["pending_count"], 0)
        print("[PASS] test_hospital_recommendation_when_accepted passed successfully!")

if __name__ == "__main__":
    unittest.main()
