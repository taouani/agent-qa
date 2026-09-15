import contextlib
import io
import json
import os
import shutil
import tempfile
import unittest

from xray_client import Transport, XrayClient, XrayError
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


class RecordingTransport(Transport):
    """Records every call and returns queued responses. Forbids nothing."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])

    def request(self, method, url, headers=None, body=None):
        self.calls.append((method, url))
        if self.responses:
            return self.responses.pop(0)
        return 200, {}, b"{}"


class DetailedTransport(Transport):
    """RecordingTransport's richer sibling: keeps the body and headers of
    every call too, which is what the Server step assertions need -- a URL
    alone cannot show that a step was written with its content intact."""

    def __init__(self, responses=None):
        self.requests = []
        self.responses = list(responses or [])

    def request(self, method, url, headers=None, body=None):
        self.requests.append({"method": method, "url": url,
                              "headers": headers or {}, "body": body})
        if self.responses:
            return self.responses.pop(0)
        return 200, {}, b"{}"

    def matching(self, method=None, url_contains=None):
        return [r for r in self.requests
                if (method is None or r["method"] == method)
                and (url_contains is None or url_contains in r["url"])]


def _case_markdown(tc_id, summary, steps):
    lines = ["## %s - %s" % (tc_id, summary), "",
             "| Step | Action | Data | Expected Result |",
             "|------|--------|------|-----------------|"]
    for number, (action, data, expected) in enumerate(steps, start=1):
        lines.append("| %d | %s | %s | %s |" % (number, action, data, expected))
    return "\n".join(lines) + "\n"


def _make_folder(directory, cases, feature_text=None):
    """Write a minimal Agent-QA output folder. `cases` is a list of
    (tc_id, summary, [(action, data, expected), ...])."""
    tc_dir = os.path.join(directory, "test-cases")
    os.makedirs(tc_dir)
    with open(os.path.join(tc_dir, "cases.md"), "w") as fh:
        fh.write("\n".join(_case_markdown(*case) for case in cases))
    if feature_text is not None:
        gherkin_dir = os.path.join(directory, "gherkin")
        os.makedirs(gherkin_dir)
        with open(os.path.join(gherkin_dir, "f.feature"), "w") as fh:
            fh.write(feature_text)
    return directory


def _read_report(folder):
    """The upload report run() wrote into a folder, read and closed."""
    with open(os.path.join(folder, "xray", "upload-report.md"),
              encoding="utf-8") as fh:
        return fh.read()


def _quiet_run(**kwargs):
    """upload.run() with its progress output captured, so a suite that
    exercises the execute path does not bury its own failures in reports."""
    with contextlib.redirect_stdout(io.StringIO()):
        return upload.run(**kwargs)


class FastPollMixin(unittest.TestCase):
    """Collapse the Cloud poll ceiling for the duration of one test.

    XrayClient's real defaults are 60 polls two seconds apart, and upload.run()
    constructs its own client, so a timeout test driven through run() would
    otherwise spend two real minutes asleep. Patched on the class and restored
    afterwards, so the production defaults stay the production defaults.
    """

    POLLS = 3

    def use_fast_polling(self):
        original = (XrayClient.POLL_MAX_ATTEMPTS, XrayClient.POLL_INTERVAL_SECONDS)

        def restore():
            XrayClient.POLL_MAX_ATTEMPTS, XrayClient.POLL_INTERVAL_SECONDS = original

        self.addCleanup(restore)
        XrayClient.POLL_MAX_ATTEMPTS = self.POLLS
        XrayClient.POLL_INTERVAL_SECONDS = 0.0


TWO_MANUAL_CASES = [
    ("TC-PROJ-123-001", "First case", [("Sign in", "valid user", "Dashboard"),
                                       ("Open profile", "", "Profile shown")]),
    ("TC-PROJ-123-002", "Second case", [("Sign out", "", "Landing page")]),
]


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

    # Task 5's test_execute_flag_without_task_6_still_makes_no_write was
    # removed here, deliberately and with its own paragraph of explanation.
    # It asserted that --execute fails closed *because Task 6 had not landed*
    # -- its name says so. Task 6 is this change, so the behaviour it pinned
    # is exactly the behaviour being replaced. The property worth keeping is
    # the one above it: a DEFAULT invocation cannot write. That test is
    # untouched, and the class TestExecuteCannotBeReachedByAccident below
    # re-asserts from the other side that the write calls live only inside
    # the --execute branch.


class TestExecuteCannotBeReachedByAccident(unittest.TestCase):

    def test_dry_run_and_execute_differ_only_in_the_writes(self):
        """The dry-run safety property from the other direction: the same
        folder, credentials and transport, run both ways, must produce write
        calls in exactly one of the two runs."""
        auth_url = _resolved("cloud", "auth")
        search_url = _resolved("cloud", "search", base_url=None)
        write_urls = {_resolved("cloud", "import_tests"),
                      _resolved("cloud", "import_feature")}

        def urls_for(execute, folder):
            t = RecordingTransport([(200, {}, b'"tok"'),
                                    (200, {}, b'{"issues":[]}')])
            _quiet_run(folder=folder, project_key="PROJ", platform="cloud",
                       base_url=None,
                       credentials={"client_id": "i", "client_secret": "s"},
                       transport=t, execute=execute)
            return {url.split("?")[0] for _, url in t.calls}

        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, TWO_MANUAL_CASES)
            self.assertFalse(urls_for(False, d) & write_urls,
                             "dry-run reached a write endpoint")
            self.assertTrue(urls_for(True, d) & write_urls,
                            "--execute reached no write endpoint")
            self.assertTrue({auth_url, search_url} <= urls_for(False, d))


class TestExecutePath(unittest.TestCase):

    def tearDown(self):
        # run() writes its report into {folder}/xray/. The test below runs
        # against the checked-in fixture folder, so clean up after it rather
        # than leaving an untracked artefact in the repository.
        shutil.rmtree(os.path.join("tests", "fixture", "xray"),
                      ignore_errors=True)

    def test_execute_issues_the_import_request(self):
        t = RecordingTransport([(200, {}, b'{"issues":[]}'),
                                (200, {}, b'{"created":["PROJ-501"],"updated":[],"failed":[]}')])
        rc = upload.run(folder="tests/fixture", project_key="PROJ", platform="cloud",
                        base_url=None, credentials={"client_id": "i", "client_secret": "s"},
                        transport=t, execute=True)
        self.assertEqual(rc, 0)
        self.assertTrue(any("import" in url for _, url in t.calls),
                        "execute made no import call")

    def test_partial_failure_is_reported_and_does_not_raise(self):
        results = {"created": ["PROJ-501"], "updated": [],
                   "failed": [{"tc_id": "TC-PROJ-123-002", "reason": "missing summary"}]}
        text = upload.render_results(results)
        self.assertIn("PROJ-501", text)
        self.assertIn("TC-PROJ-123-002", text)
        self.assertIn("missing summary", text)

    def test_report_is_written_with_front_matter(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as d:
            path = upload.write_report(
                {"created": ["PROJ-501"], "updated": [], "failed": []}, d)
            body = open(path).read()
            self.assertTrue(body.startswith("---"))
            self.assertIn("type: xray-upload-report", body)
            self.assertTrue(os.path.basename(path) == "upload-report.md")

    def test_a_failed_run_still_writes_what_succeeded(self):
        results = {"created": ["PROJ-501"], "updated": [],
                   "failed": [{"tc_id": "TC-PROJ-123-002", "reason": "boom"}]}
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            body = open(upload.write_report(results, d)).read()
            self.assertIn("PROJ-501", body)
            self.assertIn("boom", body)


class TestReportRedaction(unittest.TestCase):

    def test_account_appears_only_as_a_prefix_and_never_the_secret(self):
        with tempfile.TemporaryDirectory() as d:
            path = upload.write_report(
                {"created": [], "updated": [], "failed": []}, d,
                project_key="PROJ", platform="cloud",
                account="abcdef-client-id")
            with open(path, encoding="utf-8") as fh:
                body = fh.read()
            self.assertIn("account: abcd***", body)
            self.assertNotIn("abcdef-client-id", body)

    def test_no_credential_value_reaches_the_report(self):
        credentials = {"client_id": "abcdef-client-id",
                       "client_secret": "SUPERSECRET"}
        t = RecordingTransport([(200, {}, b'"tok"'), (200, {}, b'{"issues":[]}'),
                                (200, {}, b'{"jobId":"J1"}'),
                                (200, {}, b'{"status":"successful","result":'
                                          b'{"issues":[{"key":"PROJ-501"},'
                                          b'{"key":"PROJ-502"}],"errors":[]}}')])
        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, TWO_MANUAL_CASES)
            _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                       base_url=None, credentials=credentials, transport=t,
                       execute=True)
            body = _read_report(d)
        self.assertNotIn("SUPERSECRET", body)
        self.assertNotIn("abcdef-client-id", body)


class TestCloudExecutePath(FastPollMixin):
    """Cloud is ONE asynchronous job: POST the batch, get a jobId, poll the
    status URL until terminal, then read result.issues / result.errors."""

    CREDENTIALS = {"client_id": "i", "client_secret": "s"}

    def _run(self, responses, cases=None, feature_text=None):
        t = RecordingTransport(responses)
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        _make_folder(d, cases or TWO_MANUAL_CASES, feature_text)
        rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                        base_url=None, credentials=self.CREDENTIALS,
                        transport=t, execute=True)
        report = _read_report(d)
        return rc, t, report

    def test_successful_job_posts_the_batch_then_polls_the_job(self):
        rc, t, report = self._run([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"jobId":"JOB-7"}'),
            (200, {}, b'{"status":"successful","result":{"issues":'
                      b'[{"key":"PROJ-501"},{"key":"PROJ-502"}],"errors":[]}}'),
        ])
        self.assertEqual(rc, 0)
        import_url = _resolved("cloud", "import_tests")
        self.assertIn(("POST", import_url), t.calls)
        poll_calls = [c for c in t.calls
                      if c[0] == "GET" and "JOB-7" in c[1] and c[1].endswith("/status")]
        self.assertEqual(len(poll_calls), 1,
                         "the jobId from the import response must be polled")
        self.assertIn("created: 2", report)
        self.assertIn("PROJ-501", report)

    def test_a_job_that_never_resolves_is_a_failure_not_a_success(self):
        working = (200, {}, b'{"status":"working"}')
        client = XrayClient("cloud", None, self.CREDENTIALS,
                            RecordingTransport([(200, {}, b'{"jobId":"J"}')]
                                               + [working] * 5))
        client._token = "tok"
        client.POLL_MAX_ATTEMPTS = 4
        client.POLL_INTERVAL_SECONDS = 0.0
        slept = []
        client._sleep = lambda seconds: slept.append(seconds)

        payload = [{"testtype": "Manual",
                    "fields": {"summary": "a", "labels": ["TC-PROJ-123-001"]},
                    "steps": []}]
        results = client.import_manual_tests(payload)

        self.assertEqual(results["created"], [])
        self.assertEqual(results["updated"], [])
        self.assertEqual(len(results["failed"]), 1)
        self.assertEqual(results["failed"][0]["tc_id"], "TC-PROJ-123-001")
        self.assertIn("still running", results["failed"][0]["reason"])
        self.assertEqual(len(slept), client.POLL_MAX_ATTEMPTS - 1,
                         "the poll loop must wait between attempts")

    def test_timeout_makes_the_whole_run_exit_non_zero(self):
        self.use_fast_polling()
        rc, _t, report = self._run([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"jobId":"J"}'),
        ] + [(200, {}, b'{"status":"working"}')] * 10)
        self.assertEqual(rc, 1)
        self.assertIn("failed: 2", report)

    def test_an_unrecognised_job_status_stops_loudly(self):
        client = XrayClient("cloud", None, self.CREDENTIALS, RecordingTransport([
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"probably_fine"}'),
        ]))
        client._token = "tok"
        with self.assertRaises(XrayError) as ctx:
            client.import_manual_tests(
                [{"fields": {"labels": ["TC-PROJ-123-001"]}, "steps": []}])
        self.assertIn("probably_fine", str(ctx.exception))

    def test_an_existing_key_is_reported_as_updated_not_created(self):
        # Idempotency, end to end: the label lookup finds TC-...-001 already
        # in Jira, plan_upload sends it with its key, and the job's returned
        # issue must land in "updated". If it landed in "created" the user
        # would be told a duplicate had been made.
        rc, _t, report = self._run([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[{"key":"PROJ-441","fields":{"labels":'
                      b'["TC-PROJ-123-001"]}}]}'),
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"successful","result":{"issues":'
                      b'[{"key":"PROJ-441"},{"key":"PROJ-502"}],"errors":[]}}'),
        ])
        self.assertEqual(rc, 0)
        self.assertIn("updated: 1", report)
        self.assertIn("created: 1", report)

    def test_a_job_reporting_fewer_outcomes_than_tests_sent_is_flagged(self):
        # Two tests sent, one outcome reported, no errors: the missing one
        # must not be allowed to vanish into a clean "1 created".
        rc, _t, report = self._run([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"successful","result":{"issues":'
                      b'[{"key":"PROJ-501"}],"errors":[]}}'),
        ])
        self.assertEqual(rc, 1)
        self.assertIn("(unreported)", report)


class TestCloudImportBody(FastPollMixin):
    """What is actually SENT to Cloud's bulk-import endpoint.

    Cloud carries its manual steps inline in the import body, so nothing else
    in the suite can notice if they go missing: strip "steps" from every entry
    and the job still returns issue keys, the run still exits 0, and every
    test lands in Jira empty. That is the Ruling 10 failure class on the
    flavour that was never pinned, so the request body is pinned here by key
    set AND by content, exactly as the Server step body is.
    """

    CREDENTIALS = {"client_id": "i", "client_secret": "s"}

    def _sent_body(self, search_body=b'{"issues":[]}'):
        self.use_fast_polling()
        t = DetailedTransport([
            (200, {}, b'"tok"'),
            (200, {}, search_body),
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"successful","result":{"issues":'
                      b'[{"key":"PROJ-501"},{"key":"PROJ-502"}],"errors":[]}}'),
        ])
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        _make_folder(d, TWO_MANUAL_CASES)
        rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                        base_url=None, credentials=self.CREDENTIALS,
                        transport=t, execute=True)
        sent = t.matching("POST", "/api/v2/import/test/bulk")
        self.assertEqual(len(sent), 1, "expected exactly one bulk import POST")
        return rc, json.loads(sent[0]["body"].decode())

    def test_every_step_of_every_test_is_in_the_import_body(self):
        _rc, body = self._sent_body()
        self.assertEqual(len(body), 2)
        for entry in body:
            self.assertIn("steps", entry,
                          "an import entry reached Cloud with no steps key at "
                          "all -- the test would land in Jira empty")
        self.assertEqual([len(entry["steps"]) for entry in body], [2, 1],
                         "the import body must carry every step of every test")

    def test_the_steps_carry_the_contracts_keys_and_the_real_content(self):
        _rc, body = self._sent_body()
        for entry in body:
            self.assertTrue(entry.get("steps"),
                            "an import entry reached Cloud with no steps")
            for step in entry["steps"]:
                # api-contract.md pins exactly three lowercase keys for a
                # Cloud manual step: action, data, result. Renaming any of
                # them is silently accepted and produces an empty step.
                self.assertEqual(sorted(step), ["action", "data", "result"])
        self.assertEqual(
            [(s["action"], s["data"], s["result"]) for s in body[0]["steps"]],
            [("Sign in", "valid user", "Dashboard"),
             ("Open profile", "", "Profile shown")])
        self.assertEqual(body[1]["steps"],
                         [{"action": "Sign out", "data": "",
                           "result": "Landing page"}])

    def test_every_entry_carries_its_tc_id_label_and_test_type(self):
        _rc, body = self._sent_body()
        self.assertEqual([e["testtype"] for e in body], ["Manual", "Manual"])
        self.assertEqual([e["fields"]["labels"] for e in body],
                         [["TC-PROJ-123-001"], ["TC-PROJ-123-002"]])

    def test_ASSUMPTION_an_existing_test_is_sent_with_a_top_level_key(self):
        """PINNED ASSUMPTION, not a verified vendor behaviour.

        The top-level "key" field is how this client asks Cloud's bulk import
        to update an existing test instead of creating a new one -- but "key"
        is NOT in the contract's import_tests field table
        (api-contract.md, ## Unverified item 8). If Cloud ignores it, a re-run
        creates duplicates. That failure is at least VISIBLE, since the new
        keys are reported as created rather than updated, which is why this is
        pinned rather than redesigned.

        This test exists so the mechanism is asserted rather than incidental:
        if someone removes the "key" field, idempotency on Cloud silently
        becomes "create a duplicate every run" and this test fails.
        """
        _rc, body = self._sent_body(
            search_body=b'{"issues":[{"key":"PROJ-441","fields":{"labels":'
                        b'["TC-PROJ-123-001"]}}]}')
        by_label = dict((e["fields"]["labels"][0], e) for e in body)
        self.assertEqual(by_label["TC-PROJ-123-001"].get("key"), "PROJ-441")
        self.assertNotIn("key", by_label["TC-PROJ-123-002"],
                         "a test that does not exist yet must carry no key")


class TestGherkinReimportAssumption(unittest.TestCase):
    """Every .feature file is re-sent in full on every run, and Xray's own
    scenario matching is the only thing stopping a re-run duplicating the
    Cucumber tests. The vendor documents no matching semantics for
    import_feature (api-contract.md, ## Unverified item 7)."""

    FEATURE = ("Feature: Login\n"
               "  Scenario: TC-PROJ-123-001 - First case\n"
               "    Given a registered user\n")
    NOTICE_MARKER = "re-imported in full"

    def _run(self, search_body, feature_response):
        t = DetailedTransport([
            (200, {}, b'"tok"'),
            (200, {}, search_body),
            feature_response,
        ])
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        _make_folder(d, [TWO_MANUAL_CASES[0]], self.FEATURE)
        rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                        base_url=None,
                        credentials={"client_id": "i", "client_secret": "s"},
                        transport=t, execute=True)
        return rc, t, _read_report(d)

    EXISTING = (b'{"issues":[{"key":"PROJ-601","fields":{"labels":'
                b'["TC-PROJ-123-001"]}}]}')
    ALREADY_IMPORTED = (200, {}, b'{"errors":[],"updatedOrCreatedTests":'
                                 b'[{"id":"1","key":"PROJ-601","self":"u"}],'
                                 b'"updatedOrCreatedPreconditions":[]}')

    def test_ASSUMPTION_a_feature_already_in_jira_is_still_re_imported(self):
        """PINNED ASSUMPTION. There is deliberately NO client-side skipping:
        even when the label lookup already found the feature's test in Jira,
        the whole file is sent again and Xray is trusted to match it. If this
        test starts failing because someone added skipping, that is a
        deliberate design change and needs its own decision -- it is not a
        bug in this test."""
        rc, t, report = self._run(self.EXISTING, self.ALREADY_IMPORTED)
        self.assertEqual(rc, 0)
        self.assertEqual(len(t.matching("POST", "/api/v2/import/feature")), 1,
                         "the feature file must be re-sent, not skipped")
        # ...and the key that came back is classified as updated, because the
        # label lookup already knew it. That classification is this client's
        # only defence against reporting a duplicate as a fresh creation.
        self.assertIn("updated: 1", report)
        self.assertIn("created: 0", report)

    def test_the_reimport_caveat_is_stated_in_the_report(self):
        rc, _t, report = self._run(self.EXISTING, self.ALREADY_IMPORTED)
        self.assertIn(self.NOTICE_MARKER, report)
        self.assertIn("duplicated Cucumber tests", report)
        self.assertEqual(rc, 0, "a caveat must not change the exit code")

    def test_the_caveat_is_absent_when_no_feature_was_imported(self):
        t = RecordingTransport([(200, {}, b'"tok"'), (200, {}, b'{"issues":[]}'),
                                (200, {}, b'{"jobId":"J"}'),
                                (200, {}, b'{"status":"successful","result":'
                                          b'{"issues":[{"key":"PROJ-501"}],'
                                          b'"errors":[]}}')])
        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, [TWO_MANUAL_CASES[0]])      # no gherkin/ at all
            rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                            base_url=None,
                            credentials={"client_id": "i", "client_secret": "s"},
                            transport=t, execute=True)
            report = _read_report(d)
        self.assertEqual(rc, 0)
        self.assertNotIn(self.NOTICE_MARKER, report)


class TestCloudPartialFailure(FastPollMixin):

    def test_one_rejected_test_keeps_the_rest_and_exits_non_zero(self):
        t = RecordingTransport([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"partially_successful","result":{"issues":'
                      b'[{"key":"PROJ-501"}],"errors":[{"elementNumber":1,'
                      b'"message":"Field \'customfield_101\' is required"}]}}'),
        ])
        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, TWO_MANUAL_CASES)
            rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                            base_url=None,
                            credentials={"client_id": "i", "client_secret": "s"},
                            transport=t, execute=True)
            report = _read_report(d)

        # The count split: one kept, one failed -- not an aborted batch.
        self.assertEqual(rc, 1, "a partially failed run must not exit 0")
        self.assertIn("created: 1", report)
        self.assertIn("failed: 1", report)
        # The failure names the test and says enough to act on it.
        self.assertIn("TC-PROJ-123-002", report)
        self.assertIn("customfield_101", report)
        # ...and what succeeded is still recorded.
        self.assertIn("PROJ-501", report)


class TestServerExecutePath(unittest.TestCase):
    """Server/DC is a different implementation behind the same result
    contract: synchronous Jira bulk create, then N per-step calls."""

    BASE = "https://jira.example.com"
    CREDENTIALS = {"personal_access_token": "a-pat"}

    def _run(self, responses, cases=None, test_issue_type=None):
        t = DetailedTransport(responses)
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        _make_folder(d, cases or TWO_MANUAL_CASES)
        rc = _quiet_run(folder=d, project_key="PROJ", platform="server",
                        base_url=self.BASE, credentials=self.CREDENTIALS,
                        transport=t, execute=True,
                        test_issue_type=test_issue_type)
        report = _read_report(d)
        return rc, t, report

    CREATE_OK = [
        (200, {}, b'{"name":"a-user"}'),                       # auth probe
        (200, {}, b'{"issues":[],"total":0}'),                 # label search
        (200, {}, b'{"issues":[{"key":"PROJ-501"},{"key":"PROJ-502"}],'
                  b'"errors":[]}'),                            # issue/bulk
    ]

    def test_bulk_create_goes_to_jiras_own_endpoint_not_an_xray_one(self):
        rc, t, report = self._run(self.CREATE_OK)
        self.assertEqual(rc, 0)
        bulk = t.matching("POST", "/rest/api/2/issue/bulk")
        self.assertEqual(len(bulk), 1)
        self.assertEqual(bulk[0]["url"],
                         _resolved("server", "import_tests", base_url=self.BASE))
        body = json.loads(bulk[0]["body"].decode())
        self.assertEqual(len(body["issueUpdates"]), 2)
        # Jira's bulk create needs a Jira issuetype; the canonical payload's
        # Xray "testtype" is not a Jira field and must not be forwarded.
        self.assertEqual(body["issueUpdates"][0]["fields"]["issuetype"],
                         {"name": "Test"})
        self.assertNotIn("testtype", body["issueUpdates"][0])
        self.assertIn("created: 2", report)

    def test_configured_issue_type_reaches_the_bulk_create_payload(self):
        """xray_test_issue_type overrides the "Test" default for instances
        that renamed the issue type -- otherwise their bulk create is a
        guaranteed 400, config key or not."""
        rc, t, _report = self._run(self.CREATE_OK,
                                   test_issue_type="QA Test")
        self.assertEqual(rc, 0)
        bulk = t.matching("POST", "/rest/api/2/issue/bulk")
        body = json.loads(bulk[0]["body"].decode())
        self.assertEqual(body["issueUpdates"][0]["fields"]["issuetype"],
                         {"name": "QA Test"})
        self.assertEqual(body["issueUpdates"][1]["fields"]["issuetype"],
                         {"name": "QA Test"})

    def test_every_step_of_every_test_gets_its_own_call(self):
        """RULING 10, as a test. The fixture has three steps across two
        tests. Jira's bulk create makes the ISSUES and nothing else, so a
        version of _create_server_steps that dropped the loop, or that wrote
        the steps to the v2.0 URL with the v1.0 body, would still produce two
        happy-looking created tests. These assertions fail in that case."""
        _rc, t, _report = self._run(self.CREATE_OK)

        step_calls = t.matching("PUT", "/api/test/")
        self.assertEqual(len(step_calls), 3,
                         "3 steps across 2 tests must produce 3 step calls, "
                         "one per step -- got %d" % len(step_calls))

        # LITERAL ON PURPOSE. Deriving this from SERVER_TEST_STEP_URL would
        # make the test read its expectation out of the very constant it is
        # checking -- so the v1.0 -> v2.0 URL swap that this whole test exists
        # to catch could never fail it. A test that takes its expectation from
        # the thing under test is a test that cannot fail.
        expected_url = "https://jira.example.com/rest/raven/1.0/api/test/%s/step"
        self.assertEqual(
            [c["url"] for c in step_calls],
            [expected_url % "PROJ-501",
             expected_url % "PROJ-501",
             expected_url % "PROJ-502"])

        bodies = [json.loads(c["body"].decode()) for c in step_calls]
        # v1.0's FLAT, lowercase body. If someone swaps the URL to the 2.0
        # "/steps" path and leaves this body shape, Xray answers 2xx and
        # writes EMPTY steps -- so pin the shape here, not just the URL.
        for body in bodies:
            self.assertEqual(sorted(body), ["data", "result", "step"])
            self.assertNotIn("fields", body)
        self.assertEqual(
            [(b["step"], b["data"], b["result"]) for b in bodies],
            [("Sign in", "valid user", "Dashboard"),
             ("Open profile", "", "Profile shown"),
             ("Sign out", "", "Landing page")],
            "step content must survive the Cloud-schema -> v1.0 translation")

    def test_no_call_is_made_to_the_v2_plural_step_url(self):
        _rc, t, _report = self._run(self.CREATE_OK)
        self.assertEqual(t.matching(url_contains="/rest/raven/2.0/"), [])
        self.assertEqual(t.matching(url_contains="/steps"), [])

    def test_a_failing_step_call_fails_only_that_test(self):
        responses = list(self.CREATE_OK) + [
            (200, {}, b"{}"),      # PROJ-501 step 1 ok
            (200, {}, b"{}"),      # PROJ-501 step 2 ok
            (400, {}, b"nope"),    # PROJ-502 step 1 rejected
        ]
        rc, _t, report = self._run(responses)
        self.assertEqual(rc, 1)
        self.assertIn("created: 1", report)
        self.assertIn("failed: 1", report)
        self.assertIn("PROJ-501", report)
        self.assertIn("TC-PROJ-123-002", report)
        self.assertIn("step 1 of 1", report)

    def test_a_rejected_issue_keeps_the_rest_and_names_the_test(self):
        responses = [
            (200, {}, b'{"name":"a-user"}'),
            (200, {}, b'{"issues":[],"total":0}'),
            (200, {}, b'{"issues":[{"key":"PROJ-501"}],"errors":[{'
                      b'"status":400,"failedElementNumber":1,"elementErrors":'
                      b'{"errorMessages":[],"errors":{"customfield_101":'
                      b'"Field is required"}}}]}'),
        ]
        rc, _t, report = self._run(responses)
        self.assertEqual(rc, 1)
        self.assertIn("created: 1", report)
        self.assertIn("failed: 1", report)
        self.assertIn("TC-PROJ-123-002", report)
        self.assertIn("customfield_101", report)

    # One test already in Jira (TC-...-001 -> PROJ-441), one not.
    ONE_EXISTING = [
        (200, {}, b'{"name":"a-user"}'),                        # auth probe
        (200, {}, b'{"issues":[{"key":"PROJ-441","fields":{"labels":'
                  b'["TC-PROJ-123-001"]}}],"total":1}'),        # label search
        (204, {}, b""),                                         # PUT issue/PROJ-441
        (200, {}, b'{"issues":[{"key":"PROJ-502"}],"errors":[]}'),   # issue/bulk
    ]

    def test_an_existing_test_is_updated_in_place_not_duplicated(self):
        rc, t, report = self._run(self.ONE_EXISTING)
        self.assertEqual(rc, 0, "an unchanged existing test is not a failure")
        self.assertIn("updated: 1", report)
        self.assertIn("created: 1", report)
        self.assertIn("failed: 0", report)

        # Updated through Jira core PUT /rest/api/2/issue/{key}...
        put = t.matching("PUT", "/rest/api/2/issue/PROJ-441")
        self.assertEqual(len(put), 1)
        body = json.loads(put[0]["body"].decode())
        self.assertEqual(body["fields"]["summary"], "First case")
        self.assertIn("TC-PROJ-123-001", body["fields"]["labels"])
        # ...with the two fields Jira refuses on an existing issue stripped.
        self.assertNotIn("project", body["fields"])
        self.assertNotIn("issuetype", body["fields"])

        # ...and NOT re-created through bulk create.
        bulk = t.matching("POST", "/rest/api/2/issue/bulk")
        created_body = json.loads(bulk[0]["body"].decode())
        self.assertEqual(len(created_body["issueUpdates"]), 1,
                         "the already-existing test must not be re-created")

    def test_no_step_call_is_issued_for_an_updated_test(self):
        """Steps on an updated test are deliberately untouched: the pinned
        v1.0 step API only creates, so a step call here would append a second
        full set of steps on every re-run."""
        _rc, t, _report = self._run(self.ONE_EXISTING)
        step_calls = t.matching("PUT", "/api/test/")
        self.assertEqual(  # literal, for the reason given in the test above
            [c["url"] for c in step_calls],
            ["https://jira.example.com/rest/raven/1.0/api/test/PROJ-502/step"],
            "only the newly created test may get step calls")
        self.assertEqual(t.matching("PUT", "/api/test/PROJ-441/"), [])

    def test_a_re_run_of_an_unchanged_folder_exits_zero(self):
        """The idempotency promise, end to end: run the same folder twice
        against a Jira that now holds both tests. Nothing is created, nothing
        fails, and the process exits 0 -- so a non-zero exit stays meaningful."""
        responses = [
            (200, {}, b'{"name":"a-user"}'),
            (200, {}, b'{"issues":['
                      b'{"key":"PROJ-441","fields":{"labels":["TC-PROJ-123-001"]}},'
                      b'{"key":"PROJ-442","fields":{"labels":["TC-PROJ-123-002"]}}'
                      b'],"total":2}'),
            (204, {}, b""),      # PUT issue/PROJ-441
            (204, {}, b""),      # PUT issue/PROJ-442
        ]
        rc, t, report = self._run(responses)
        self.assertEqual(rc, 0)
        self.assertIn("updated: 2", report)
        self.assertIn("created: 0", report)
        self.assertIn("failed: 0", report)
        self.assertEqual(t.matching("POST", "/rest/api/2/issue/bulk"), [],
                         "a re-run must create nothing")
        self.assertEqual(t.matching("PUT", "/api/test/"), [],
                         "a re-run must not append steps to existing tests")

    def test_a_failed_field_update_is_reported_and_does_not_stop_the_rest(self):
        responses = list(self.ONE_EXISTING)
        responses[2] = (400, {}, b"nope")       # the PUT is rejected
        rc, _t, report = self._run(responses)
        self.assertEqual(rc, 1)
        self.assertIn("updated: 0", report)
        self.assertIn("created: 1", report)     # the other test still landed
        self.assertIn("TC-PROJ-123-001", report)
        self.assertIn("PROJ-441", report)


class TestServerStepLimitationNotice(unittest.TestCase):
    """On Server/DC an edited step does not propagate on re-run. That is a
    real functional gap, so it has to be visible OUTPUT, not a code comment --
    and it must not be emitted when it does not apply, or it becomes noise
    people learn to skip."""

    BASE = "https://jira.example.com"
    MARKER = "STEPS were NOT modified"

    def _report_for(self, responses, cases):
        t = DetailedTransport(responses)
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        _make_folder(d, cases)
        rc = _quiet_run(folder=d, project_key="PROJ", platform="server",
                        base_url=self.BASE,
                        credentials={"personal_access_token": "a-pat"},
                        transport=t, execute=True)
        return rc, _read_report(d)

    def test_the_notice_appears_when_a_test_was_updated(self):
        rc, report = self._report_for(TestServerExecutePath.ONE_EXISTING,
                                      TWO_MANUAL_CASES)
        self.assertIn(self.MARKER, report)
        self.assertIn("apply that change by hand in Jira", report)
        self.assertEqual(rc, 0, "the notice must not change the exit code")

    def test_the_notice_is_absent_when_nothing_was_updated(self):
        rc, report = self._report_for(TestServerExecutePath.CREATE_OK,
                                      TWO_MANUAL_CASES)
        self.assertNotIn(self.MARKER, report)
        self.assertEqual(rc, 0)

    def test_the_notice_also_reaches_the_printed_output(self):
        results = {"created": [], "updated": ["PROJ-441"], "failed": [],
                   "notices": ["Xray Server/DC: 1 existing test(s) ... "
                               "STEPS were NOT modified."]}
        text = upload.render_results(results)
        self.assertIn(self.MARKER, text)
        self.assertIn("All tests uploaded successfully.", text)


class TestFeatureImport(unittest.TestCase):

    FEATURE = ("Feature: Login\n"
               "  Scenario: TC-PROJ-123-001 - First case\n"
               "    Given a registered user\n")

    def test_cloud_feature_import_reads_the_object_response_shape(self):
        t = RecordingTransport([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"errors":[],"updatedOrCreatedTests":'
                      b'[{"id":"1","key":"PROJ-601","self":"u"}],'
                      b'"updatedOrCreatedPreconditions":[]}'),
        ])
        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, [TWO_MANUAL_CASES[0]], self.FEATURE)
            rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                            base_url=None,
                            credentials={"client_id": "i", "client_secret": "s"},
                            transport=t, execute=True)
            report = _read_report(d)
        self.assertEqual(rc, 0)
        self.assertIn("PROJ-601", report)
        feature_calls = [c for c in t.calls if "import/feature" in c[1]]
        self.assertEqual(len(feature_calls), 1)
        self.assertIn("projectKey=PROJ", feature_calls[0][1])

    def test_server_feature_import_reads_the_bare_array_response_shape(self):
        # Server answers a JSON ARRAY, labelled application/octet-stream.
        # A client that trusted the Content-Type, or that assumed Cloud's
        # object-with-three-lists, would report zero tests imported.
        t = DetailedTransport([
            (200, {}, b'{"name":"a-user"}'),
            (200, {}, b'{"issues":[],"total":0}'),
            (200, {"Content-Type": "application/octet-stream"},
             b'[{"id":"1","key":"PROJ-601","self":"u","issueType":"Test"}]'),
        ])
        with tempfile.TemporaryDirectory() as d:
            _make_folder(d, [TWO_MANUAL_CASES[0]], self.FEATURE)
            rc = _quiet_run(folder=d, project_key="PROJ", platform="server",
                            base_url="https://jira.example.com",
                            credentials={"personal_access_token": "a-pat"},
                            transport=t, execute=True)
            report = _read_report(d)
        self.assertEqual(rc, 0)
        self.assertIn("created: 1", report)
        self.assertIn("PROJ-601", report)
        sent = t.matching("POST", "/rest/raven/1.0/import/feature")
        self.assertEqual(len(sent), 1)
        self.assertIn("multipart/form-data; boundary=",
                      sent[0]["headers"]["Content-Type"])
        self.assertIn(b'name="file"; filename="f.feature"', sent[0]["body"])
        self.assertIn(b"Given a registered user", sent[0]["body"])

    def test_a_failing_feature_import_does_not_stop_the_run(self):
        t = RecordingTransport([
            (200, {}, b'"tok"'),
            (200, {}, b'{"issues":[]}'),
            (200, {}, b'{"jobId":"J"}'),
            (200, {}, b'{"status":"successful","result":{"issues":'
                      b'[{"key":"PROJ-501"}],"errors":[]}}'),
            (400, {}, b"Bad Gherkin"),
        ])
        with tempfile.TemporaryDirectory() as d:
            # Case 002 is in the feature file, so 001 is Manual and 002 is
            # Cucumber: both paths run in one invocation.
            _make_folder(d, TWO_MANUAL_CASES,
                         "Feature: X\n  Scenario: TC-PROJ-123-002 - Second case\n")
            rc = _quiet_run(folder=d, project_key="PROJ", platform="cloud",
                            base_url=None,
                            credentials={"client_id": "i", "client_secret": "s"},
                            transport=t, execute=True)
            report = _read_report(d)
        self.assertEqual(rc, 1)
        self.assertIn("created: 1", report)      # the Manual test survived
        self.assertIn("PROJ-501", report)
        self.assertIn("f.feature", report)
        self.assertIn("HTTP 400", report)


if __name__ == "__main__":
    unittest.main()
