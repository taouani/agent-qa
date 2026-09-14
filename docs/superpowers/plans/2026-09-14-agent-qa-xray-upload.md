# Agent-QA Xray Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command, `upload-to-xray`, that takes a generated output folder and puts its test cases into Jira as Xray tests — Cucumber where a Gherkin feature exists, Manual otherwise — updating rather than duplicating on a second run, with no credential ever passing through a command line.

**Architecture:** Markdown says what and when (`agent-qa/framework/xray/`, `agent-qa/commands/upload-to-xray/`); Python says how (`scripts/xray/`). The client dispatches Cloud versus Server/DC from one config key, the way `repository_platform` already switches GitLab, GitHub and Azure DevOps. Every HTTP call goes through an injectable transport, so the logic is unit-testable without a Jira instance.

**Tech Stack:** Python 3.8+, standard library only (`urllib.request`, `json`, `base64`, `unittest`). No `requests`, no `pip install`, no virtualenv. Markdown phase files. Bash + PowerShell installers.

**Spec:** `docs/superpowers/specs/2026-09-14-agent-qa-xray-upload-design.md`

## Global Constraints

- **Standard library only.** `urllib.request`, `json`, `base64`, `unittest`. Adding a third-party dependency is a plan violation — every one is something that must be present before a QA command works.
- **Python 3.8 is the floor.** The development machine runs 3.9.6, so nothing may rely on 3.10+ syntax (no `match`, no `X | Y` type unions at runtime). Write code that parses on 3.8.
- **Dry-run is the default.** No invocation writes to Jira without an explicit `--execute`. A unit test asserts this against a transport that fails if a write is attempted.
- **The TC-ID label is applied on create, always.** It is the only thing making a second run idempotent. A unit test asserts every created-test payload carries it.
- **No secret on a command line.** The client reads `agent-qa/.xray-credentials` itself. No credential appears in an argument, a log line, a report or an exception message.
- **Refuse if tracked.** Before reading the credentials file, run `git ls-files --error-unmatch` against it. If git knows the file, abort and write nothing.
- **Endpoints come from Task 1, never from memory.** Any task needing a URL, an API version or a payload shape reads `scripts/xray/xray_endpoints.py`. Inventing one is a plan violation.
- **Phase file idiom:** `# Phase N: Title`, `## Core Responsibilities`, `## Workflow Steps`, `### Step N: ...`, `## Data Storage`, `## Constraints`.
- **Twin entry points.** Every command exists at `agent-qa/commands/{name}/{name}.md` and `agent-qa/ide/claude/commands/agent-qa/{name}.md` with identical `{{PHASE N: @...}}` markers.
- **Every new harness check must be proven able to fail** — break the thing it guards, watch the named failure, restore, confirm the tree is byte-identical. Six guards on the previous branch were found unable to fire; two of those were written by a reviewer and one by the coordinator.
- **`bash scripts/check-repo.sh` exits 0 at the end of every task.**
- **Commit after every task.** Conventional Commits, subject <= 50 characters.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01K6RBw4n6TMrNKy1Cndrp75`
- Do not push, do not merge, do not modify git config.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `agent-qa/framework/xray/api-contract.md` | The pinned vendor contract: endpoints, auth flows, payload shapes, each with its source URL and retrieval date |
| `scripts/xray/xray_endpoints.py` | Those same values as Python constants — the single place a URL or API version appears |
| `scripts/xray/xray_client.py` | Transport boundary, auth, search, import. No CLI concerns |
| `scripts/xray/upload.py` | The CLI phases invoke: argument parsing, dry-run rendering, report writing |
| `scripts/xray/test_xray_client.py` | Unit tests for the client |
| `scripts/xray/test_upload.py` | Unit tests for the CLI, including the no-write-on-dry-run assertion |
| `scripts/xray/README.md` | What this is, how phases invoke it, why it exists |
| `agent-qa/framework/xray/xray-framework-index.md` | Entry map, mirroring `framework/git-repository/framework-index.md` |
| `agent-qa/framework/xray/config/validate-xray.md` | Platform detection, credential presence, refuse-if-tracked |
| `agent-qa/framework/xray/operations/upload-tests.md` | The neutral operation phases call |
| `agent-qa/framework/xray/operations/match-existing.md` | Label-based lookup semantics |
| `agent-qa/framework/xray/formats/upload-report.md` | Shape of the dry-run output and the written report |
| `agent-qa/commands/upload-to-xray/` | 4 phases + entry point |
| `agent-qa/ide/claude/commands/agent-qa/upload-to-xray.md` | Slash-command twin |

**Modified:** `agent-qa/config.yml.template`; `scripts/project-install.sh` and `.ps1`; `scripts/project-update.sh`; `scripts/check-repo.sh`; `agent-qa/commands/health-check/1-validate-configuration.md`; `agent-qa/commands/validate-outputs/2-validate-deliverables.md`; `agent-qa/rules/qa-conventions.md`; `agent-qa/rules/output-standards.md`; `CLAUDE.md`; `README.md`; `USER_GUIDE.md`; `INSTALLATION.md`.

---

## Task 1: Pin the Xray API contract

No code depends on a URL until this task produces one. The spec refuses to state endpoints from
memory because Cloud and Server/DC differ in base URL, API version, auth and the multipart shape of
feature import, and a wrong path produces an integration that fails on first contact while the plan
reads as authoritative.

**Files:**
- Create: `agent-qa/framework/xray/api-contract.md`
- Create: `scripts/xray/xray_endpoints.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/xray/xray_endpoints.py` exposing exactly this shape, which Tasks 2-6 import:

```python
ENDPOINTS = {
    "cloud": {
        "auth": "<url>",            # POST, returns a bearer token
        "search": "<url>",          # Jira issue search (JQL)
        "import_tests": "<url>",    # bulk import of test definitions
        "import_feature": "<url>",  # multipart .feature upload
    },
    "server": { ... same four keys ... },
}
AUTH_STYLE = {"cloud": "<style>", "server": "<style>"}
```

- [ ] **Step 1: Research the Cloud API**

Using WebFetch or WebSearch against Xray's official documentation (`docs.getxray.app` and its Cloud
REST reference), establish for **Xray Cloud**: the authentication endpoint and the exact request and
response shape for obtaining a token; the token's lifetime and the header format for using it; the
bulk test import endpoint, its request payload shape, and whether it is synchronous or returns a job
id to poll; the Gherkin feature import endpoint and its multipart form field names; and how a JQL
search is issued against Jira Cloud.

Record the URL you retrieved each fact from, and the date.

- [ ] **Step 2: Research the Server/DC API**

Repeat for **Xray Server/Data Center**: the base path on the Jira host, the authentication model
(personal access token versus basic), the bulk import endpoint, the feature import endpoint, and the
JQL search path. Note explicitly every place it differs from Cloud — those differences are what the
client's dispatch exists for.

- [ ] **Step 3: Write the contract document**

Create `agent-qa/framework/xray/api-contract.md` with one section per flavour. For each endpoint
record: the method, the path, the auth header, the request shape, the success response shape, the
error response shape, whether it is async, and the source URL with retrieval date. Where the two
flavours differ, say so explicitly rather than describing only one.

Add a heading `## Unverified` listing anything the documentation did not settle. That section is how
the next task knows what it may not assume.

- [ ] **Step 4: Write the endpoint constants**

Create `scripts/xray/xray_endpoints.py` containing the `ENDPOINTS` and `AUTH_STYLE` structures above,
filled from the contract document, with a module docstring pointing back at
`agent-qa/framework/xray/api-contract.md` as the source of record.

- [ ] **Step 5: Verify it parses on the floor version**

```bash
python3 -m py_compile scripts/xray/xray_endpoints.py && echo "parses"
python3 -c "from importlib import util; s=util.spec_from_file_location('e','scripts/xray/xray_endpoints.py'); m=util.module_from_spec(s); s.loader.exec_module(m); assert set(m.ENDPOINTS)=={'cloud','server'}; assert all(set(v)=={'auth','search','import_tests','import_feature'} for v in m.ENDPOINTS.values()); print('shape ok')"
```
Expected: `parses` then `shape ok`.

- [ ] **Step 6: Commit**

```bash
git add agent-qa/framework/xray/api-contract.md scripts/xray/xray_endpoints.py
git commit -m "docs: pin the Xray API contract"
```

---

## Task 2: Transport boundary and authentication

**Files:**
- Create: `scripts/xray/xray_client.py`
- Create: `scripts/xray/test_xray_client.py`

**Interfaces:**
- Consumes: `ENDPOINTS`, `AUTH_STYLE` from Task 1.
- Produces, imported by Tasks 3-6:
  - `class XrayError(Exception)` — every failure this client raises
  - `class Transport` with `request(method, url, headers=None, body=None) -> (int, dict, bytes)`
  - `class UrllibTransport(Transport)` — the real one
  - `class XrayClient(platform, base_url, credentials, transport)` with `.authenticate() -> str`
  - `read_credentials(path) -> dict` — reads the secrets file, raising `XrayError` if git tracks it

- [ ] **Step 1: Write the failing tests**

Create `scripts/xray/test_xray_client.py`:

```python
import unittest
from xray_client import XrayClient, XrayError, Transport


class FakeTransport(Transport):
    """Records every call and returns canned responses."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = responses or []

    def request(self, method, url, headers=None, body=None):
        self.calls.append({"method": method, "url": url,
                           "headers": headers or {}, "body": body})
        if self.responses:
            return self.responses.pop(0)
        return 200, {}, b"{}"


class TestAuthentication(unittest.TestCase):

    def test_cloud_auth_posts_to_the_configured_endpoint(self):
        from xray_endpoints import ENDPOINTS
        t = FakeTransport([(200, {}, b'"a-token"')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, t)
        c.authenticate()
        self.assertEqual(t.calls[0]["method"], "POST")
        self.assertEqual(t.calls[0]["url"], ENDPOINTS["cloud"]["auth"])

    def test_token_is_reused_not_refetched(self):
        t = FakeTransport([(200, {}, b'"a-token"')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, t)
        first = c.authenticate()
        second = c.authenticate()
        self.assertEqual(first, second)
        self.assertEqual(len(t.calls), 1, "authenticate() must cache its token")

    def test_auth_failure_raises_xrayerror_without_the_secret(self):
        t = FakeTransport([(401, {}, b'{"error":"bad creds"}')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "SUPERSECRET"}, t)
        with self.assertRaises(XrayError) as ctx:
            c.authenticate()
        self.assertNotIn("SUPERSECRET", str(ctx.exception))

    def test_unknown_platform_raises(self):
        with self.assertRaises(XrayError):
            XrayClient("bitbucket", None, {}, FakeTransport()).authenticate()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd scripts/xray && python3 -m unittest test_xray_client -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'xray_client'`.

- [ ] **Step 3: Implement the client's transport and auth**

Create `scripts/xray/xray_client.py`. Use the auth flow Task 1 recorded for each flavour — do not
guess it. The structure:

```python
"""Xray REST client. Endpoints come from xray_endpoints.py, which is generated
from agent-qa/framework/xray/api-contract.md. Never hardcode a URL here."""

import json
import subprocess
import urllib.request
import urllib.error

from xray_endpoints import ENDPOINTS, AUTH_STYLE


class XrayError(Exception):
    """Every failure this client raises. Never contains a credential."""


class Transport:
    def request(self, method, url, headers=None, body=None):
        raise NotImplementedError


class UrllibTransport(Transport):
    def request(self, method, url, headers=None, body=None):
        req = urllib.request.Request(url, data=body, method=method)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers or {}), e.read()
        except urllib.error.URLError as e:
            raise XrayError("could not reach Xray: %s" % e.reason)


def read_credentials(path):
    """Read the secrets file, refusing if git tracks it."""
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", path],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    if tracked:
        raise XrayError(
            "%s is tracked by git. Remove it from version control before uploading; "
            "a credential must never be committed." % path
        )
    creds = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    return creds


class XrayClient:
    def __init__(self, platform, base_url, credentials, transport):
        self.platform = platform
        self.base_url = base_url
        self.credentials = credentials
        self.transport = transport
        self._token = None

    def _endpoint(self, name):
        if self.platform not in ENDPOINTS:
            raise XrayError("unknown xray_platform: %r (expected cloud or server)"
                            % self.platform)
        url = ENDPOINTS[self.platform][name]
        return url.replace("{base_url}", self.base_url or "")

    def authenticate(self):
        if self._token:
            return self._token
        # Build the request exactly as api-contract.md records for this flavour.
        status, _, payload = self.transport.request(
            "POST", self._endpoint("auth"),
            headers={"Content-Type": "application/json"},
            body=json.dumps(self._auth_body()).encode(),
        )
        if status != 200:
            raise XrayError("Xray authentication failed with HTTP %d" % status)
        self._token = json.loads(payload.decode()).strip('"') \
            if payload.strip().startswith(b'"') else json.loads(payload.decode())
        return self._token

    def _auth_body(self):
        raise NotImplementedError  # filled from AUTH_STYLE in step 3
```

Fill `_auth_body` per flavour using `AUTH_STYLE`. The error message must never interpolate a
credential value — the test asserts that.

- [ ] **Step 4: Run to verify they pass**

```bash
cd scripts/xray && python3 -m unittest test_xray_client -v
```
Expected: 4 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/xray/xray_client.py scripts/xray/test_xray_client.py
git commit -m "feat: add Xray transport and auth"
```

---

## Task 3: Label matching — find what already exists

**Files:**
- Modify: `scripts/xray/xray_client.py`
- Modify: `scripts/xray/test_xray_client.py`

**Interfaces:**
- Consumes: `XrayClient` from Task 2.
- Produces: `XrayClient.find_tests_by_label(project_key, labels) -> dict` mapping each found label to its Jira issue key. Labels with no match are absent from the returned dict. Tasks 5 and 6 use this to partition create from update.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/xray/test_xray_client.py`:

```python
class TestLabelMatching(unittest.TestCase):

    def _client(self, transport):
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, transport)
        c._token = "cached"          # skip the auth round-trip
        return c

    def test_returns_label_to_issue_key_for_matches(self):
        body = b'{"issues":[{"key":"PROJ-441","fields":{"labels":["TC-PROJ-123-001"]}}]}'
        t = FakeTransport([(200, {}, body)])
        found = self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        self.assertEqual(found, {"TC-PROJ-123-001": "PROJ-441"})

    def test_unmatched_labels_are_absent_not_none(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        found = self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-002"])
        self.assertEqual(found, {})

    def test_labels_are_batched_into_one_query(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        labels = ["TC-PROJ-123-%03d" % n for n in range(1, 21)]
        self._client(t).find_tests_by_label("PROJ", labels)
        self.assertEqual(len(t.calls), 1,
                         "20 labels must not produce 20 requests")

    def test_query_names_the_project_and_the_labels(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        sent = str(t.calls[0]["url"]) + str(t.calls[0]["body"])
        self.assertIn("PROJ", sent)
        self.assertIn("TC-PROJ-123-001", sent)

    def test_empty_label_list_makes_no_request(self):
        t = FakeTransport()
        self.assertEqual(self._client(t).find_tests_by_label("PROJ", []), {})
        self.assertEqual(t.calls, [])
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd scripts/xray && python3 -m unittest test_xray_client.TestLabelMatching -v
```
Expected: FAIL — `AttributeError: 'XrayClient' object has no attribute 'find_tests_by_label'`.

- [ ] **Step 3: Implement it**

Add to `XrayClient`, issuing the search exactly as `api-contract.md` records for this flavour:

```python
    JQL_BATCH = 50

    def find_tests_by_label(self, project_key, labels):
        """Map each label that already exists in Jira to its issue key.
        Labels with no match are simply absent from the result."""
        found = {}
        if not labels:
            return found
        for start in range(0, len(labels), self.JQL_BATCH):
            chunk = labels[start:start + self.JQL_BATCH]
            quoted = ", ".join('"%s"' % l for l in chunk)
            jql = 'project = %s AND labels in (%s)' % (project_key, quoted)
            status, _, payload = self._get_json(
                self._endpoint("search"), {"jql": jql, "fields": "labels"})
            if status != 200:
                raise XrayError("Jira search failed with HTTP %d" % status)
            for issue in json.loads(payload.decode()).get("issues", []):
                for label in issue.get("fields", {}).get("labels", []):
                    if label in chunk:
                        found[label] = issue["key"]
        return found
```

Add the `_get_json` helper that attaches the bearer token from `authenticate()` and issues the
request through `self.transport`.

- [ ] **Step 4: Run to verify they pass**

```bash
cd scripts/xray && python3 -m unittest test_xray_client -v
```
Expected: all tests PASS, including Task 2's four.

- [ ] **Step 5: Commit**

```bash
git add scripts/xray/xray_client.py scripts/xray/test_xray_client.py
git commit -m "feat: match existing Xray tests by label"
```

---

## Task 4: Classification and payload building

**Files:**
- Create: `scripts/xray/xray_payloads.py`
- Create: `scripts/xray/test_xray_payloads.py`

**Interfaces:**
- Consumes: nothing from earlier tasks — this module is pure data transformation and imports no client.
- Produces, used by Tasks 5 and 6:
  - `classify(test_case_ids, feature_texts) -> dict` mapping each TC-ID to `"cucumber"` or `"manual"`
  - `build_manual_payload(test_cases, existing_keys, project_key) -> list` of per-test dicts, each carrying its TC-ID label, and an issue key when the test already exists
  - `TC_ID_PATTERN` — the compiled regex recognising `TC-{KEY}-{NNN}`

- [ ] **Step 1: Write the failing tests**

Create `scripts/xray/test_xray_payloads.py`:

```python
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
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd scripts/xray && python3 -m unittest test_xray_payloads -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'xray_payloads'`.

- [ ] **Step 3: Implement it**

Create `scripts/xray/xray_payloads.py`. The field names inside `fields` and `steps` must match what
`agent-qa/framework/xray/api-contract.md` records for the bulk import endpoint — read it rather than
assuming Jira's generic issue shape.

```python
"""Turn generated test cases into Xray import payloads.
Pure data transformation: no HTTP, no credentials, no I/O."""

import re

TC_ID_PATTERN = re.compile(r"TC-[A-Z][A-Z0-9_]*-\d+-\d{3,}")


def classify(test_case_ids, feature_texts):
    """Map each TC-ID to 'cucumber' when a feature scenario carries it, else 'manual'."""
    in_features = set()
    for text in feature_texts:
        in_features.update(TC_ID_PATTERN.findall(text))
    return {tc: ("cucumber" if tc in in_features else "manual")
            for tc in test_case_ids}


def build_manual_payload(test_cases, existing_keys, project_key):
    """One entry per test case. Existing tests carry their key so the import
    updates rather than duplicates. Every entry carries its TC-ID label --
    that label is what makes the next run idempotent."""
    payload = []
    for case in test_cases:
        tc_id = case["id"]
        entry = {
            "fields": {
                "project": {"key": project_key},
                "summary": case["summary"],
                "labels": [tc_id],
            },
            "steps": [
                {"action": s["action"], "data": s.get("data", ""),
                 "result": s.get("expected", "")}
                for s in case.get("steps", [])
            ],
        }
        if tc_id in existing_keys:
            entry["key"] = existing_keys[tc_id]
        payload.append(entry)
    return payload
```

Note the regex: `TC-PROJ-123-0011` must not be matched by a pattern for `TC-PROJ-123-001`. The test
asserts that, so if your pattern is loose it will fail.

- [ ] **Step 4: Run to verify they pass**

```bash
cd scripts/xray && python3 -m unittest test_xray_payloads -v
```
Expected: 10 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/xray/xray_payloads.py scripts/xray/test_xray_payloads.py
git commit -m "feat: classify and build Xray payloads"
```

---

## Task 5: The CLI — dry-run path

This task delivers a working `--dry-run` that reaches Jira only to search, never to write. The
no-write guarantee is asserted by a test, not by inspection.

**Files:**
- Create: `scripts/xray/upload.py`
- Create: `scripts/xray/test_upload.py`

**Interfaces:**
- Consumes: `XrayClient`, `read_credentials`, `XrayError` (Task 2); `find_tests_by_label` (Task 3); `classify`, `build_manual_payload` (Task 4).
- Produces, used by Task 6:
  - `load_folder(path) -> (test_cases, feature_texts)` reading `test-cases/` and `gherkin/`
  - `plan_upload(test_cases, feature_texts, existing_keys) -> dict` with keys `create`, `update`, `cucumber`, `manual`
  - `render_dry_run(plan, project_key, platform, folder) -> str`
  - `main(argv) -> int` — the entry point phases invoke

- [ ] **Step 1: Write the failing tests**

Create `scripts/xray/test_upload.py`:

```python
import unittest
from xray_client import Transport, XrayError
import upload


class WriteForbiddenTransport(Transport):
    """Fails the test if anything other than a read is attempted."""

    def __init__(self, search_response):
        self.search_response = search_response
        self.calls = []

    def request(self, method, url, headers=None, body=None):
        self.calls.append((method, url))
        if method not in ("GET", "POST") or "search" not in url:
            raise AssertionError(
                "dry-run attempted a write: %s %s" % (method, url))
        return self.search_response


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


class TestDryRunRendering(unittest.TestCase):

    def test_report_names_counts_and_the_execute_hint(self):
        plan = {"create": ["TC-PROJ-123-001"], "update": ["TC-PROJ-123-002"],
                "cucumber": ["TC-PROJ-123-001"], "manual": ["TC-PROJ-123-002"]}
        out = upload.render_dry_run(plan, "PROJ", "cloud", "agent-qa/2026-09-14-PROJ-123/")
        self.assertIn("DRY RUN", out)
        self.assertIn("CREATE  1", out)
        self.assertIn("UPDATE  1", out)
        self.assertIn("--execute", out)


class TestDryRunPerformsNoWrite(unittest.TestCase):

    def test_dry_run_never_issues_an_import_request(self):
        """The central safety property: a default invocation cannot write to Jira."""
        t = WriteForbiddenTransport((200, {}, b'{"issues":[]}'))
        rc = upload.run(folder="tests/fixture", project_key="PROJ", platform="cloud",
                        base_url=None, credentials={"client_id": "i", "client_secret": "s"},
                        transport=t, execute=False)
        self.assertEqual(rc, 0)
        self.assertTrue(all("search" in url for _, url in t.calls),
                        "dry-run made a non-search call: %r" % (t.calls,))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Create the fixture the last test reads**

```bash
mkdir -p scripts/xray/tests/fixture/test-cases scripts/xray/tests/fixture/gherkin
cat > scripts/xray/tests/fixture/test-cases/PROJ-123-test-cases.md <<'EOF'
---
type: test-cases
source_requirements: [PROJ-123]
language: en
version: 1.0.0
---

## TC-PROJ-123-001 - Successful login

| Step | Action | Data | Expected Result |
|------|--------|------|-----------------|
| 1 | Sign in | valid user | Dashboard shown |
EOF
cat > scripts/xray/tests/fixture/gherkin/PROJ-123.feature <<'EOF'
Feature: Login
  Scenario: TC-PROJ-123-001 - Successful login
    Given a registered user
EOF
```

- [ ] **Step 3: Run to verify the tests fail**

```bash
cd scripts/xray && python3 -m unittest test_upload -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'upload'`.

- [ ] **Step 4: Implement the dry-run CLI**

Create `scripts/xray/upload.py` with `load_folder`, `plan_upload`, `render_dry_run`, `run` and
`main`. `run` takes an injected transport so the test can forbid writes; `main` builds a real
`UrllibTransport`, reads config and credentials, and calls `run`. Argument parsing uses `argparse`
with `--folder`, `--execute` (default False) and `--config`.

`plan_upload` must call `classify` and `build_manual_payload` from Task 4 rather than reimplementing
either. `render_dry_run` must produce the exact shape the spec shows, including the trailing
`Re-run with --execute to apply.`

`run` must return 0 on success and a non-zero code on `XrayError`, printing the error without any
credential value.

- [ ] **Step 5: Run to verify they pass**

```bash
cd scripts/xray && python3 -m unittest discover -p 'test_*.py' -v
```
Expected: every test from Tasks 2, 3, 4 and 5 passes.

- [ ] **Step 6: Commit**

```bash
git add scripts/xray/upload.py scripts/xray/test_upload.py scripts/xray/tests/
git commit -m "feat: add Xray upload dry-run"
```

---

## Task 6: The CLI — execute path, partial failure, report

**Files:**
- Modify: `scripts/xray/upload.py`
- Modify: `scripts/xray/test_upload.py`
- Modify: `scripts/xray/xray_client.py`

**Interfaces:**
- Consumes: everything from Tasks 2-5.
- Produces:
  - `XrayClient.import_manual_tests(payload) -> dict` with keys `created`, `updated`, `failed`
  - `XrayClient.import_feature_file(path, project_key) -> dict` with the same three keys
  - `upload.write_report(results, folder) -> str` writing `{folder}/xray/upload-report.md` and returning its path

- [ ] **Step 1: Write the failing tests**

Append to `scripts/xray/test_upload.py`:

```python
class TestExecutePath(unittest.TestCase):

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
```

Add this helper beside `WriteForbiddenTransport` — same shape, but it records calls and returns
queued responses without forbidding anything:

```python
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
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd scripts/xray && python3 -m unittest test_upload.TestExecutePath -v
```
Expected: FAIL — `AttributeError` on `upload.render_results` / `upload.write_report`.

- [ ] **Step 3: Implement import, results rendering and the report**

Add `import_manual_tests` and `import_feature_file` to `XrayClient`, issuing the requests exactly as
`api-contract.md` records — including polling a job id if that flavour's import is asynchronous, and
returning `{"created": [...], "updated": [...], "failed": [{"tc_id":..., "reason":...}]}` in both
cases so callers do not branch on flavour.

Add `render_results` and `write_report` to `upload.py`. The report carries YAML front matter:

```
---
type: xray-upload-report
generated: YYYY-MM-DD
platform: cloud
project: PROJ
created: 1
updated: 0
failed: 1
---
```

followed by a section per outcome. A failure must name its TC-ID and its reason. The account
identifier may appear only redacted to a recognisable prefix; the secret never appears.

- [ ] **Step 4: Run the whole suite**

```bash
cd scripts/xray && python3 -m unittest discover -p 'test_*.py' -v
```
Expected: every test passes, including Task 5's no-write assertion — confirm that one still runs and
still passes, since this task is where a stray write could be introduced.

- [ ] **Step 5: Commit**

```bash
git add scripts/xray/upload.py scripts/xray/xray_client.py scripts/xray/test_upload.py
git commit -m "feat: execute Xray upload and report"
```

---

## Task 7: The framework markdown

**Files:**
- Create: `agent-qa/framework/xray/xray-framework-index.md`
- Create: `agent-qa/framework/xray/config/validate-xray.md`
- Create: `agent-qa/framework/xray/operations/upload-tests.md`
- Create: `agent-qa/framework/xray/operations/match-existing.md`
- Create: `agent-qa/framework/xray/formats/upload-report.md`

**Interfaces:**
- Consumes: the CLI built in Tasks 5-6; `api-contract.md` from Task 1.
- Produces: instruction files the command's phases reference by `@agent-qa/framework/xray/...` path, exactly as commands already reference `@agent-qa/framework/git-repository/...`.

Read `agent-qa/framework/git-repository/framework-index.md` and one of its `operations/` files first
— these five mirror that structure, and following it matters more than any preference of yours.

- [ ] **Step 1: Write `validate-xray.md`** — the preflight every phase runs first. It must state:
  read `xray_platform` from `agent-qa/config.yml` and report **SKIP — Xray not configured** when it
  is empty; confirm `xray_project_key` is set, and `xray_base_url` too when the platform is `server`;
  confirm `agent-qa/.xray-credentials` exists; and STOP with an explanation if
  `git ls-files --error-unmatch agent-qa/.xray-credentials` succeeds, because a tracked credentials
  file must never be read. Never print the file's contents.

- [ ] **Step 2: Write `match-existing.md`** — the label lookup's semantics in prose: tests are found
  by a Jira label equal to their TC-ID; a label found means update, absent means create; the label is
  applied at creation and must never be omitted, because it is the only thing preventing a second run
  from duplicating every test.

- [ ] **Step 3: Write `upload-tests.md`** — the neutral operation. It states the invocation
  (`python3 scripts/xray/upload.py --folder {selected_folder}`, adding `--execute` only after
  approval), that the default is a dry run that writes nothing, that Gherkin wins where a feature
  carries the TC-ID and Manual covers the rest, and that a partial failure is resumable because
  matching is label-based.

- [ ] **Step 4: Write `formats/upload-report.md`** — the report's front matter and sections, matching
  exactly what `upload.write_report` emits in Task 6. If the two disagree, the code is right and this
  file is wrong.

- [ ] **Step 5: Write `xray-framework-index.md`** — the entry map naming the four files above and
  pointing at `api-contract.md` as the source of record for every endpoint.

- [ ] **Step 6: Verify and commit**

```bash
bash scripts/check-repo.sh
git add agent-qa/framework/xray/
git commit -m "docs: add the Xray framework instructions"
```

---

## Task 8: The `upload-to-xray` command

**Files:**
- Create: `agent-qa/commands/upload-to-xray/upload-to-xray.md`
- Create: `agent-qa/commands/upload-to-xray/1-find-and-select-tests.md`
- Create: `agent-qa/commands/upload-to-xray/2-classify-and-build.md`
- Create: `agent-qa/commands/upload-to-xray/3-dry-run-and-confirm.md`
- Create: `agent-qa/commands/upload-to-xray/4-upload-and-report.md`
- Create: `agent-qa/ide/claude/commands/agent-qa/upload-to-xray.md`
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: the framework files from Task 7; `check_command_phases` already in `check-repo.sh`.
- Produces: the command. `check_command_phases upload-to-xray` must pass, which requires the entry point and the twin to carry identical phase markers.

- [ ] **Step 1: Write the failing check**

Add to `scripts/check-repo.sh` and register in `run_checks`:

```bash
check_upload_to_xray() {
    check_command_phases upload-to-xray \
        1-find-and-select-tests.md 2-classify-and-build.md \
        3-dry-run-and-confirm.md 4-upload-and-report.md
    grep -q 'execute' agent-qa/commands/upload-to-xray/3-dry-run-and-confirm.md \
        && pass "phase 3 names the --execute gate" \
        || fail "phase 3 does not mention the --execute gate"
    if grep -rq 'client_secret\|XRAY_TOKEN\|--secret' agent-qa/commands/upload-to-xray/; then
        fail "a command phase names a credential value or flag - secrets belong in the client"
    else
        pass "no phase handles a credential directly"
    fi
}
```

- [ ] **Step 2: Run to verify it fails** — expected: missing entry point, wrapper and four phases.

- [ ] **Step 3: Write the entry point and twin**

Identical content in both `agent-qa/commands/upload-to-xray/upload-to-xray.md` and
`agent-qa/ide/claude/commands/agent-qa/upload-to-xray.md`:

```markdown
# Upload To Xray Command

You are uploading generated test cases into Jira as Xray tests — Cucumber tests where a Gherkin
feature exists for that test case, Manual tests otherwise.

Nothing is written to Jira until you have seen a dry run and approved it.

**Input**: An output folder from a previous `generate-test-cases` run
**Output**: Xray tests in Jira, plus `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/xray/upload-report.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/upload-to-xray/1-find-and-select-tests.md}}

{{PHASE 2: @agent-qa/commands/upload-to-xray/2-classify-and-build.md}}

{{PHASE 3: @agent-qa/commands/upload-to-xray/3-dry-run-and-confirm.md}}

{{PHASE 4: @agent-qa/commands/upload-to-xray/4-upload-and-report.md}}
```

- [ ] **Step 4: Write phase 1** — mirror `generate-gherkin/1-find-and-select-test-cases.md` for folder
selection, then follow `@agent-qa/framework/xray/config/validate-xray.md` and stop if it stops.

- [ ] **Step 5: Write phase 2** — read the selected folder's `test-cases/` and `gherkin/`, and state
that classification is the client's job via `@agent-qa/framework/xray/operations/upload-tests.md`.
This phase supplies inputs; it does not reimplement the matching or the payload shape.

- [ ] **Step 6: Write phase 3** — run the dry run, present its output verbatim to the engineer, and
STOP for approval. The phase must state plainly that nothing has been written yet and that proceeding
requires `--execute`. It must not offer to skip the dry run.

- [ ] **Step 7: Write phase 4** — re-run with `--execute`, then follow
`@agent-qa/commands/common/generate-output-index.md` and
`@agent-qa/commands/common/execute-post-hooks.md`. Report created and updated issue keys, and name
every failure with its reason. If the run partially failed, say explicitly that re-running is safe
because matching is label-based.

- [ ] **Step 8: Verify and commit**

```bash
bash scripts/check-repo.sh
git add agent-qa/commands/upload-to-xray agent-qa/ide/claude/commands/agent-qa/upload-to-xray.md scripts/check-repo.sh
git commit -m "feat: add upload-to-xray command"
```

---

## Task 9: Configuration, installer, and credential safety

**Files:**
- Modify: `agent-qa/config.yml.template`
- Modify: `scripts/project-install.sh`, `scripts/project-install.ps1`
- Modify: `scripts/project-update.sh`
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: `scripts/xray/` and `agent-qa/framework/xray/` from earlier tasks.
- Produces: the three config keys; both new directories synced by install and update; `.gitignore` carrying the credentials path.

Sub-project 2's two worst defects were both here — an installer that silently shipped zero agents
because it read a path that no longer existed, and a check that passed because its grep matched a
comment. Assert that each sync routine is **defined and called**, not merely mentioned.

- [ ] **Step 1: Write the failing check**

```bash
check_xray_installed() {
    echo "== installers sync the xray framework and client =="
    local f
    for f in scripts/project-install.sh scripts/project-update.sh; do
        if grep -v '^[[:space:]]*#' "$f" | grep -q 'agent-qa/framework/xray' \
           && grep -v '^[[:space:]]*#' "$f" | grep -q 'scripts/xray'; then
            pass "$(basename "$f") syncs both xray directories"
        else
            fail "$(basename "$f") does not sync agent-qa/framework/xray and scripts/xray"
        fi
    done
    grep -v '^[[:space:]]*#' scripts/project-install.sh | grep -q 'xray-credentials' \
        && pass "install gitignores the credentials file" \
        || fail "project-install.sh does not add .xray-credentials to .gitignore"
    local k
    for k in 'xray_platform:' 'xray_project_key:' 'xray_base_url:'; do
        grep -q "^[[:space:]]*$k" agent-qa/config.yml.template \
            && pass "config.yml.template declares $k" \
            || fail "config.yml.template missing key: $k"
    done
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: six failures.

- [ ] **Step 3: Add the config keys**

Append to `agent-qa/config.yml.template`:

```yaml
# ================================================
# Xray Upload
# Upload generated test cases into Jira as Xray tests.
# Leave xray_platform empty to disable the upload-to-xray command entirely.
#
# Credentials are NEVER stored here. They live in agent-qa/.xray-credentials,
# which the installer adds to .gitignore. The upload client refuses to run if
# git is tracking that file.
# ================================================
xray_platform: ""        # cloud | server — empty disables upload-to-xray
xray_project_key: ""     # the Jira project tests are created in
xray_base_url: ""        # Server/DC only: your Jira host, e.g. https://jira.example.com
```

- [ ] **Step 4: Sync the two directories** in `project-install.sh`, `project-install.ps1` and
`project-update.sh`, following each script's existing pattern for `agent-qa/framework/` and
`agent-qa/roles/`. Read the surrounding code first; do not invent a mechanism.

- [ ] **Step 5: Add the credentials file to `.gitignore`** during install, and verify the entry took
effect rather than assuming it did — re-read the file after writing and confirm the line is present.

- [ ] **Step 6: Verify**

```bash
bash -n scripts/project-install.sh scripts/project-update.sh
bash scripts/check-repo.sh
```

Then prove the guard is real: temporarily delete the `scripts/xray` sync call, confirm the check
fails naming that script, restore, confirm the tree is byte-identical.

- [ ] **Step 7: Commit**

```bash
git add agent-qa/config.yml.template scripts/
git commit -m "feat: install the xray client and config"
```

---

## Task 10: health-check, validate-outputs, and the rules

**Files:**
- Modify: `agent-qa/commands/health-check/1-validate-configuration.md`
- Modify: `agent-qa/commands/validate-outputs/2-validate-deliverables.md`
- Modify: `agent-qa/rules/qa-conventions.md`
- Modify: `agent-qa/rules/output-standards.md`
- Modify: `scripts/check-repo.sh`

- [ ] **Step 1: Write the failing check**

```bash
check_xray_documented_in_commands() {
    echo "== health-check probes xray, validate-outputs knows the report =="
    grep -q 'xray_platform' agent-qa/commands/health-check/1-validate-configuration.md \
        && pass "health-check validates xray_platform" \
        || fail "health-check does not validate xray_platform"
    grep -q 'xray-credentials' agent-qa/commands/health-check/1-validate-configuration.md \
        && pass "health-check probes the credentials file" \
        || fail "health-check does not probe the credentials file"
    grep -q 'xray-upload-report' agent-qa/commands/validate-outputs/2-validate-deliverables.md \
        && pass "validate-outputs knows the upload report" \
        || fail "validate-outputs does not validate the xray upload report"
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: three failures.

- [ ] **Step 3: Extend health-check phase 1** with a step that skips entirely when `xray_platform` is
empty, and otherwise validates: the platform is `cloud` or `server`; `xray_project_key` is non-empty;
`xray_base_url` is set when the platform is `server`; `agent-qa/.xray-credentials` exists; its
permissions are not world-readable; its path is gitignored; and **git does not track it** — a FAIL,
not a warning, because reading a tracked credentials file is what the client refuses to do. Print no
part of the file's contents.

- [ ] **Step 4: Extend validate-outputs** with the new deliverable:

```markdown
| `xray-upload-report` | `xray/upload-report.md` | `platform`, `project`, `created`, `updated`, `failed` | A `## Failures` section when `failed` is greater than zero |
```

- [ ] **Step 5: Extend the rules** — add `xray/` to the deliverable-subfolder table in
`qa-conventions.md`, and add `xray/` to the output tree plus `| Xray Upload Report | `upload-report.md` |`
to the file-naming table in `output-standards.md`.

- [ ] **Step 6: Verify and commit**

```bash
bash scripts/check-repo.sh
git add agent-qa/commands/health-check agent-qa/commands/validate-outputs agent-qa/rules scripts/check-repo.sh
git commit -m "feat: validate xray config and outputs"
```

---

## Task 11: Harness coverage for the Python client

The repository has never had executable code with tests. This task makes the harness run them, so a
broken client fails the same command everything else fails.

**Files:**
- Modify: `scripts/check-repo.sh`

- [ ] **Step 1: Write the failing checks**

```bash
check_python_compiles() {
    echo "== the xray client parses =="
    local found=0 f
    for f in scripts/xray/*.py; do
        [[ -e "$f" ]] || continue
        found=1
        python3 -m py_compile "$f" 2>/dev/null \
            && pass "$(basename "$f") parses" \
            || fail "$(basename "$f") does not parse (py_compile)"
    done
    (( found == 0 )) && fail "no python files found in scripts/xray/ - nothing was parsed"
    return 0
}

check_python_tests_pass() {
    echo "== the xray unit tests pass =="
    if ! command -v python3 >/dev/null 2>&1; then
        fail "python3 not on PATH - the xray client cannot be verified"
        return 0
    fi
    local out
    if out=$(cd scripts/xray && python3 -m unittest discover -p 'test_*.py' 2>&1); then
        pass "xray unit tests pass"
    else
        fail "xray unit tests FAILED: $(echo "$out" | tail -3 | tr '\n' ' ')"
    fi
}
```

Register both in `run_checks`.

- [ ] **Step 2: Prove each can fail.** Introduce a syntax error into one client file, confirm
`check_python_compiles` names it, restore. Then break one assertion in `test_xray_payloads.py`,
confirm `check_python_tests_pass` fails and its message names the failure, restore. After each,
confirm `git status --porcelain` shows only the pre-existing untracked entries.

Do not skip this. Six guards on the previous branch were found unable to fire, including one added by
the wave meant to end them — a check that cannot fail reads as coverage while providing none.

- [ ] **Step 3: Confirm `__pycache__` cannot be committed** — `py_compile` creates it. Add it to
`.gitignore` if the repository does not already ignore it, and verify with
`git status --porcelain` after running the harness.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-repo.sh .gitignore
git commit -m "test: run the xray client tests in the harness"
```

---

## Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `USER_GUIDE.md`, `INSTALLATION.md`
- Modify: `scripts/check-repo.sh`

- [ ] **Step 1: Write the failing check**

```bash
check_xray_documented() {
    echo "== documentation describes the xray upload =="
    local n
    n=$(find agent-qa/commands -maxdepth 1 -mindepth 1 -type d ! -name common | wc -l | tr -d ' ')
    grep -q "$n commands" CLAUDE.md \
        && pass "CLAUDE.md states $n commands" \
        || fail "CLAUDE.md does not state the current command count ($n)"
    grep -q 'upload-to-xray' CLAUDE.md \
        && pass "CLAUDE.md documents upload-to-xray" || fail "CLAUDE.md omits upload-to-xray"
    grep -q 'xray-credentials' INSTALLATION.md \
        && pass "INSTALLATION.md documents the credentials file" \
        || fail "INSTALLATION.md does not document the credentials file"
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: three failures.

- [ ] **Step 3: Update `CLAUDE.md`** — the command count (computed, not guessed), `upload-to-xray` in
the dependency chain under `generate-test-cases`, `agent-qa/framework/xray/` in the structure tree
beside `framework/git-repository/`, `scripts/xray/` noted as the repository's only executable client
with its stdlib-only and Python 3.8 constraints, and the three config keys.

- [ ] **Step 4: Update `README.md` and `USER_GUIDE.md`** — the command in the available-commands list;
in `USER_GUIDE.md` a short workflow showing `generate-test-cases` → `generate-gherkin` →
`upload-to-xray`, stating that the first run is always a dry run and that a second run updates rather
than duplicates.

- [ ] **Step 5: Update `INSTALLATION.md`** — Python 3.8+ as a prerequisite for this command only, how
to create `agent-qa/.xray-credentials`, which keys it holds for each flavour, that the installer
gitignores it, and that the client refuses to run if git tracks it.

The file is created by the user, not the installer — so the instructions must show the permission
step explicitly, or it will not happen:

```bash
cat > agent-qa/.xray-credentials <<'EOF'
# Xray Cloud
client_id=...
client_secret=...
EOF
chmod 600 agent-qa/.xray-credentials
```

`health-check` reports a world-readable file as a failure, so omitting `chmod` surfaces loudly rather
than silently.

- [ ] **Step 6: Verify and commit**

```bash
bash scripts/check-repo.sh
git add CLAUDE.md README.md USER_GUIDE.md INSTALLATION.md scripts/check-repo.sh
git commit -m "docs: document the xray upload command"
```

---

## Final verification

Runs in development:

- [ ] `cd scripts/xray && python3 -m unittest discover -p 'test_*.py' -v` — every test passes
- [ ] The no-write assertion specifically still passes: `python3 -m unittest test_upload.TestDryRunPerformsNoWrite -v`
- [ ] `bash scripts/check-repo.sh` — all checks including the five added by this plan
- [ ] `bash -n` on every modified shell script
- [ ] Each new harness check proven able to fail, and the tree byte-identical afterwards
- [ ] `git status --porcelain` shows no `__pycache__`

Requires a real Jira project with Xray — the acceptance checklist:

- [ ] **Against a throwaway Jira project, never the real one.** Run the dry run; inspect the plan.
- [ ] Run with `--execute`; confirm the created tests carry their TC-ID labels in Jira.
- [ ] **Re-run the dry run. Every test must report UPDATE and none CREATE.** This is the gate — the
      design's central claim is that a second run does not duplicate, and nothing else proves it.
- [ ] Include one deliberately invalid test; confirm the others still land and the report names the
      failure with its reason.
- [ ] Repeat the first three against the other Xray flavour if both are in use — the dispatch is
      untested until each path has run once.
- [ ] Run once from Windows. Unlike the previous sub-projects this needs no separate implementation,
      only confirmation that the same file behaves identically.
