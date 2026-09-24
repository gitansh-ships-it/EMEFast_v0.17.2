import unittest
import sys
from pathlib import Path

# Ensure backend root is on path
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from models.incident import (
    CaseState,
    VALID_CASE_TRANSITIONS,
    can_transition_case,
    validate_case_transition
)

class TestCaseStateMachine(unittest.TestCase):
    def test_canonical_states_exact_set(self):
        expected_states = {
            "DRAFT",
            "BROADCASTING",
            "WAITING_FOR_RESPONSES",
            "PARTIAL_RESPONSES",
            "HOSPITAL_ACCEPTED",
            "HOSPITAL_SELECTED",
            "COMPLETED",
            "CANCELLED"
        }
        actual_states = {s.value for s in CaseState}
        self.assertEqual(actual_states, expected_states, "CaseState enum must match the 8 canonical states exactly")

    def test_valid_transitions(self):
        valid_pairs = [
            ("DRAFT", "BROADCASTING"),
            ("BROADCASTING", "WAITING_FOR_RESPONSES"),
            ("WAITING_FOR_RESPONSES", "PARTIAL_RESPONSES"),
            ("WAITING_FOR_RESPONSES", "HOSPITAL_ACCEPTED"),
            ("PARTIAL_RESPONSES", "HOSPITAL_ACCEPTED"),
            ("HOSPITAL_ACCEPTED", "HOSPITAL_SELECTED"),
            ("HOSPITAL_SELECTED", "COMPLETED"),
            # Active states to CANCELLED
            ("DRAFT", "CANCELLED"),
            ("BROADCASTING", "CANCELLED"),
            ("WAITING_FOR_RESPONSES", "CANCELLED"),
            ("PARTIAL_RESPONSES", "CANCELLED"),
            ("HOSPITAL_ACCEPTED", "CANCELLED"),
            ("HOSPITAL_SELECTED", "CANCELLED"),
        ]
        for src, dst in valid_pairs:
            with self.subTest(src=src, dst=dst):
                self.assertTrue(
                    can_transition_case(src, dst),
                    f"Expected transition {src} -> {dst} to be valid"
                )
                res = validate_case_transition(src, dst)
                self.assertEqual(res.value, dst)

    def test_invalid_transitions(self):
        invalid_pairs = [
            # Terminal states cannot transition anywhere
            ("COMPLETED", "DRAFT"),
            ("COMPLETED", "BROADCASTING"),
            ("COMPLETED", "WAITING_FOR_RESPONSES"),
            ("COMPLETED", "PARTIAL_RESPONSES"),
            ("COMPLETED", "HOSPITAL_ACCEPTED"),
            ("COMPLETED", "HOSPITAL_SELECTED"),
            ("COMPLETED", "COMPLETED"),
            ("COMPLETED", "CANCELLED"),
            ("CANCELLED", "DRAFT"),
            ("CANCELLED", "BROADCASTING"),
            ("CANCELLED", "WAITING_FOR_RESPONSES"),
            ("CANCELLED", "HOSPITAL_ACCEPTED"),
            ("CANCELLED", "HOSPITAL_SELECTED"),
            ("CANCELLED", "COMPLETED"),
            ("CANCELLED", "CANCELLED"),
            # Illegal leaps
            ("WAITING_FOR_RESPONSES", "HOSPITAL_SELECTED"),
            ("PARTIAL_RESPONSES", "COMPLETED"),
            ("HOSPITAL_ACCEPTED", "COMPLETED"),
            ("DRAFT", "HOSPITAL_SELECTED"),
            ("BROADCASTING", "COMPLETED"),
            # Non-existent states
            ("WAITING_FOR_RESPONSES", "EN_ROUTE"),
            ("HOSPITAL_SELECTED", "ARRIVED"),
        ]
        for src, dst in invalid_pairs:
            with self.subTest(src=src, dst=dst):
                self.assertFalse(
                    can_transition_case(src, dst),
                    f"Expected transition {src} -> {dst} to be invalid"
                )
                with self.assertRaises(ValueError):
                    validate_case_transition(src, dst)

if __name__ == "__main__":
    unittest.main()
