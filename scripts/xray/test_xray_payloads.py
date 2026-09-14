import unittest
from xray_payloads import classify, build_manual_payload


FEATURE = """Feature: Login
  @critical
  Scenario: TC-PROJ-123-001 - Successful login with valid credentials
    Given a registered user
    When they sign in
    Then the dashboard is shown
"""


class TestClassification(unittest.TestCase):

    def test_tc_id_present_in_a_feature_is_cucumber(self):
        self.assertEqual(classify(["TC-PROJ-123-001"], [FEATURE]),
                         {"TC-PROJ-123-001": "cucumber"})

    def test_tc_id_absent_from_every_feature_is_manual(self):
        self.assertEqual(classify(["TC-PROJ-123-099"], [FEATURE]),
                         {"TC-PROJ-123-099": "manual"})

    def test_no_features_at_all_makes_everything_manual(self):
        self.assertEqual(classify(["TC-PROJ-123-001"], []),
                         {"TC-PROJ-123-001": "manual"})

    def test_a_similar_but_different_id_does_not_match(self):
        # TC-PROJ-123-0011 must not be satisfied by TC-PROJ-123-001
        self.assertEqual(classify(["TC-PROJ-123-0011"], [FEATURE]),
                         {"TC-PROJ-123-0011": "manual"})


class TestManualPayload(unittest.TestCase):

    CASES = [{"id": "TC-PROJ-123-002", "summary": "Reject an empty password",
              "steps": [{"action": "Submit with no password",
                         "data": "-", "expected": "Validation error shown"}],
              "priority": "P1"}]

    def test_every_created_test_carries_its_tc_id_label(self):
        payload = build_manual_payload(self.CASES, {}, "PROJ")
        self.assertIn("TC-PROJ-123-002", payload[0]["fields"]["labels"])

    def test_a_new_test_has_no_issue_key(self):
        payload = build_manual_payload(self.CASES, {}, "PROJ")
        self.assertNotIn("key", payload[0])

    def test_an_existing_test_carries_its_key_for_update(self):
        payload = build_manual_payload(
            self.CASES, {"TC-PROJ-123-002": "PROJ-441"}, "PROJ")
        self.assertEqual(payload[0]["key"], "PROJ-441")

    def test_an_existing_test_still_carries_the_label(self):
        payload = build_manual_payload(
            self.CASES, {"TC-PROJ-123-002": "PROJ-441"}, "PROJ")
        self.assertIn("TC-PROJ-123-002", payload[0]["fields"]["labels"])

    def test_the_project_key_is_set_on_every_test(self):
        payload = build_manual_payload(self.CASES, {}, "PROJ")
        self.assertEqual(payload[0]["fields"]["project"]["key"], "PROJ")

    def test_summary_and_steps_survive(self):
        payload = build_manual_payload(self.CASES, {}, "PROJ")
        self.assertEqual(payload[0]["fields"]["summary"], "Reject an empty password")
        self.assertEqual(len(payload[0]["steps"]), 1)


if __name__ == "__main__":
    unittest.main()
