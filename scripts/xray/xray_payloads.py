"""Turn generated test cases into Xray import payloads.

Pure data transformation: no HTTP, no credentials, no file I/O, and no
knowledge of which Xray flavour (Cloud or Server/DC) the caller targets.
Xray Server has no bulk test import at all -- it is Jira `issue/bulk` plus
one call per step, a genuinely different shape from Cloud's. This module
therefore emits a single canonical structure matching Cloud's
`POST /api/v2/import/test/bulk` body, as documented in
agent-qa/framework/xray/api-contract.md ("Bulk test import -- import_tests").
Task 6 translates that structure for Server inside the client, where every
other flavour difference already lives.

Do NOT add an `xray_id` field here: the contract records it as required only
for test *sets*, not for plain tests (see api-contract.md, footnote on the
`xray_id` row of the import_tests field table).
"""

import re

from xray_endpoints import BULK_IMPORT_TEST_TYPE, CLOUD_TEST_STEP_FIELDS

# TC-{KEY}-{NNN}: "TC-", a project key (letter, then letters/digits/underscores),
# a dash-separated numeric issue part, a dash, then the zero-padded sequence
# number. `\d{3,}` requires at least 3 digits and is greedy, so on a haystack
# containing "TC-PROJ-123-001" it consumes exactly those three digits -- it
# cannot stop short of a longer run and it cannot extend past the end of the
# haystack's digits. classify() compares whole matched strings via set
# membership, not substring containment, so "TC-PROJ-123-0011" never gets
# treated as present just because "TC-PROJ-123-001" appears in the text, and
# vice versa: the two are different strings regardless of which is longer.
TC_ID_PATTERN = re.compile(r"TC-[A-Z][A-Z0-9_]*-\d+-\d{3,}")


def classify(test_case_ids, feature_texts):
    """Map each TC-ID to 'cucumber' when a feature scenario carries it as a
    Gherkin scenario reference, else 'manual'."""
    in_features = set()
    for text in feature_texts:
        in_features.update(TC_ID_PATTERN.findall(text))
    return {tc: ("cucumber" if tc in in_features else "manual")
            for tc in test_case_ids}


def _build_step(step):
    """Map a generated test case's step (action/data/expected) onto the
    Cloud manual-step schema (action/data/result) recorded as
    CLOUD_TEST_STEP_FIELDS in xray_endpoints.py. `expected` on the way in
    becomes `result` on the way out -- same value, Xray's field name."""
    values = [step["action"], step.get("data", ""), step.get("expected", "")]
    return dict(zip(CLOUD_TEST_STEP_FIELDS, values))


def build_manual_payload(test_cases, existing_keys, project_key):
    """One entry per test case, in the canonical bulk-import shape. Every
    entry carries its TC-ID label -- on both the create path (no prior key)
    and the update path (existing_keys supplies one) -- because that label
    is the only thing that lets the next upload update the test instead of
    creating a duplicate."""
    payload = []
    for case in test_cases:
        tc_id = case["id"]
        entry = {
            # Top-level, sibling to "fields"/"steps" -- the contract's
            # import_tests field table lists testtype as a per-object field,
            # not nested inside "fields". Required on every object; every
            # test this function builds is Manual (Cucumber tests go through
            # feature-import instead), so the value is a fixed constant.
            "testtype": BULK_IMPORT_TEST_TYPE,
            "fields": {
                "project": {"key": project_key},
                "summary": case["summary"],
                "labels": [tc_id],
            },
            "steps": [_build_step(step) for step in case.get("steps", [])],
        }
        if tc_id in existing_keys:
            entry["key"] = existing_keys[tc_id]
        payload.append(entry)
    return payload
