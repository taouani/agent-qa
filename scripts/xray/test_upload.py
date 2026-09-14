import os
import tempfile
import unittest

from xray_client import Transport, XrayError
from xray_endpoints import DEFAULT_CLOUD_HOST, ENDPOINTS
import upload


def _resolved(platform, name, base_url=None, cloud_host=None):
    """Resolve an endpoint template exactly the way XrayClient._endpoint()
    does, so tests compare against the real URL a client would call rather
    than a hand-copied guess."""
    url = ENDPOINTS[platform][name]
    url = url.replace("{base_url}", base_url or "")
    url = url.replace("{cloud_host}", cloud_host or DEFAULT_CLOUD_HOST)
    return url


class WriteForbiddenTransport(Transport):
    """Fails the test if anything other than a resolved READ endpoint for
    the platform under test is attempted.

    The brief's original sketch allowed any call whose URL contained the
    substring "search" -- loose enough that a write endpoint which happened
    to contain that substring would slip through undetected. This double
    instead takes a mapping of the exact resolved URLs it will answer
    (never a substring test) and raises on anything else, including a
    resolved import/write endpoint and any unexpected method.

    A cloud label lookup with no jira_email/jira_api_token configured
    (as in the test below) genuinely needs two reads, not one: XrayClient
    exchanges client_id/client_secret for a bearer token before it can
    search, because Jira Cloud search does not accept those credentials
    directly. That token exchange is a read -- it fetches credentials,
    it writes nothing -- so it is allowed here alongside the search call
    itself. Only the two resolved write endpoints (import_tests,
    import_feature) are treated as forbidden.
    """

    def __init__(self, responses):
        # responses: {resolved_url: (status, headers, body)}
        self.responses = responses
        self.calls = []

    def request(self, method, url, headers=None, body=None):
        self.calls.append((method, url))
        if method not in ("GET", "POST") or url not in self.responses:
            raise AssertionError(
                "dry-run attempted a write: %s %s" % (method, url))
        return self.responses[url]


class TestPlanUpload(unittest.TestCase):

    CASES = [{"id": "TC-PROJ-123-001", "summary": "a", "steps": []},
             {"id": "TC-PROJ-123-002", "summary": "b", "steps": []}]
    FEATURE = "Scenario: TC-PROJ-123-001 - a\n"

    def test_splits_create_from_update_using_existing_keys(self):
        plan = upload.plan_upload(self.CASES, [self.FEATURE],
                                   {"TC-PROJ-123-002": "PROJ-441"})
        self.assertEqual(plan["create"], ["TC-PROJ-123-001"])
        self.assertEqual(plan["update"], ["TC-PROJ-123-002"])

    def test_classifies_within_the_plan(self):
        plan = upload.plan_upload(self.CASES, [self.FEATURE], {})
        self.assertEqual(plan["cucumber"], ["TC-PROJ-123-001"])
        self.assertEqual(plan["manual"], ["TC-PROJ-123-002"])

    def test_nothing_to_do_is_representable(self):
        plan = upload.plan_upload([], [], {})
        self.assertEqual(plan["create"], [])
        self.assertEqual(plan["update"], [])

    def test_uses_build_manual_payload_rather_than_reimplementing_it(self):
        # The Manual test's payload must carry its TC-ID label -- exactly
        # what xray_payloads.build_manual_payload guarantees. If plan_upload
        # ever reimplemented payload building instead of calling it, a
        # regression there would not be caught here.
        plan = upload.plan_upload(self.CASES, [self.FEATURE],
                                   {"TC-PROJ-123-002": "PROJ-441"},
                                   project_key="PROJ")
        self.assertEqual(len(plan["manual_payload"]), 1)
        self.assertIn("TC-PROJ-123-002", plan["manual_payload"][0]["fields"]["labels"])
        self.assertEqual(plan["manual_payload"][0]["key"], "PROJ-441")


class TestDryRunRendering(unittest.TestCase):

    def test_report_names_counts_and_the_execute_hint(self):
        plan = {"create": ["TC-PROJ-123-001"], "update": ["TC-PROJ-123-002"],
                "cucumber": ["TC-PROJ-123-001"], "manual": ["TC-PROJ-123-002"]}
        out = upload.render_dry_run(plan, "PROJ", "cloud", "agent-qa/2026-09-14-PROJ-123/")
        self.assertIn("DRY RUN", out)
        self.assertIn("CREATE  1", out)
        self.assertIn("UPDATE  1", out)
        self.assertIn("--execute", out)
        self.assertTrue(out.rstrip("\n").endswith("Re-run with --execute to apply."))


class TestLoadFolder(unittest.TestCase):

    def test_reads_test_cases_and_feature_texts_from_the_fixture(self):
        test_cases, feature_texts = upload.load_folder("tests/fixture")
        self.assertEqual(len(test_cases), 1)
        tc = test_cases[0]
        self.assertEqual(tc["id"], "TC-PROJ-123-001")
        self.assertEqual(tc["summary"], "Successful login")
        self.assertEqual(tc["steps"], [
            {"action": "Sign in", "data": "valid user", "expected": "Dashboard shown"},
        ])
        self.assertIn("priority", tc)
        self.assertEqual(len(feature_texts), 1)
        self.assertIn("TC-PROJ-123-001", feature_texts[0])

    def test_missing_subfolders_are_simply_empty(self):
        with tempfile.TemporaryDirectory() as d:
            test_cases, feature_texts = upload.load_folder(d)
            self.assertEqual(test_cases, [])
            self.assertEqual(feature_texts, [])

    def test_raises_xrayerror_naming_the_file_when_no_heading_found(self):
        with tempfile.TemporaryDirectory() as d:
            tc_dir = os.path.join(d, "test-cases")
            os.makedirs(tc_dir)
            bad_path = os.path.join(tc_dir, "BAD-no-heading.md")
            with open(bad_path, "w") as fh:
                fh.write("---\ntype: test-cases\n---\n\nNo heading in this file.\n")
            with self.assertRaises(XrayError) as ctx:
                upload.load_folder(d)
            self.assertIn("BAD-no-heading.md", str(ctx.exception))

    def test_raises_xrayerror_naming_the_file_when_steps_table_missing(self):
        with tempfile.TemporaryDirectory() as d:
            tc_dir = os.path.join(d, "test-cases")
            os.makedirs(tc_dir)
            bad_path = os.path.join(tc_dir, "BAD-no-table.md")
            with open(bad_path, "w") as fh:
                fh.write("## TC-PROJ-1-001 - No table here\n\nJust prose, no table.\n")
            with self.assertRaises(XrayError) as ctx:
                upload.load_folder(d)
            self.assertIn("BAD-no-table.md", str(ctx.exception))

    def test_raises_xrayerror_naming_the_file_when_a_required_column_is_missing(self):
        with tempfile.TemporaryDirectory() as d:
            tc_dir = os.path.join(d, "test-cases")
            os.makedirs(tc_dir)
            bad_path = os.path.join(tc_dir, "BAD-wrong-columns.md")
            with open(bad_path, "w") as fh:
                fh.write(
                    "## TC-PROJ-1-001 - Wrong columns\n\n"
                    "| Step | Notes |\n"
                    "|------|-------|\n"
                    "| 1 | not the columns we need |\n"
                )
            with self.assertRaises(XrayError) as ctx:
                upload.load_folder(d)
            self.assertIn("BAD-wrong-columns.md", str(ctx.exception))


class TestDryRunPerformsNoWrite(unittest.TestCase):

    def test_dry_run_never_issues_an_import_request(self):
        """The central safety property: a default invocation cannot write
        to Jira. This exercises the real upload.run() -> XrayClient ->
        Transport path -- no attribute is pre-seeded, no method is
        monkeypatched -- so a genuine dry run must reach exactly the two
        resolved reads a cloud label lookup performs (token exchange, then
        search) and never either resolved write endpoint."""
        auth_url = _resolved("cloud", "auth")
        search_url = _resolved("cloud", "search", base_url=None)
        write_urls = {
            _resolved("cloud", "import_tests"),
            _resolved("cloud", "import_feature"),
        }
        # Sanity: the allowed reads and the forbidden writes must not
        # collide, or this test would prove nothing.
        self.assertFalse(write_urls & {auth_url, search_url})

        t = WriteForbiddenTransport({
            auth_url: (200, {}, b'"fake-cloud-token"'),
            search_url: (200, {}, b'{"issues":[]}'),
        })
        rc = upload.run(folder="tests/fixture", project_key="PROJ", platform="cloud",
                         base_url=None, credentials={"client_id": "i", "client_secret": "s"},
                         transport=t, execute=False)
        self.assertEqual(rc, 0)

        called_urls = {url for _, url in t.calls}
        self.assertTrue(called_urls, "dry-run made no calls at all")
        self.assertTrue(called_urls <= {auth_url, search_url},
                         "dry-run called an unexpected endpoint: %r" % (t.calls,))
        self.assertFalse(called_urls & write_urls,
                          "dry-run made a write call: %r" % (t.calls,))

    def test_execute_flag_without_task_6_still_makes_no_write(self):
        # Task 6 has not landed yet, so --execute must fail closed -- it
        # must still never reach a write endpoint, and it must not report
        # success.
        auth_url = _resolved("cloud", "auth")
        search_url = _resolved("cloud", "search", base_url=None)
        t = WriteForbiddenTransport({
            auth_url: (200, {}, b'"fake-cloud-token"'),
            search_url: (200, {}, b'{"issues":[]}'),
        })
        rc = upload.run(folder="tests/fixture", project_key="PROJ", platform="cloud",
                         base_url=None, credentials={"client_id": "i", "client_secret": "s"},
                         transport=t, execute=True)
        self.assertNotEqual(rc, 0)
        write_urls = {
            _resolved("cloud", "import_tests"),
            _resolved("cloud", "import_feature"),
        }
        called_urls = {url for _, url in t.calls}
        self.assertFalse(called_urls & write_urls)


if __name__ == "__main__":
    unittest.main()
