"""Xray upload CLI. Dry-run by default -- reaches Jira only to search for
existing tests by label, never to write. `--execute` is the only way to
actually create or update a test, and every write call lives inside that
branch of run().

Python 3.8 floor, standard library only. This module is pure orchestration:
classification and payload construction stay in xray_payloads.py, auth/HTTP
stays in xray_client.py. See docs/superpowers/specs/2026-09-14-agent-qa-
xray-upload-design.md for the design this implements.
"""

import argparse
import datetime
import re
import sys
from pathlib import Path

from xray_client import (
    UrllibTransport,
    XrayClient,
    XrayError,
    empty_results,
    merge_results,
    read_credentials,
)
from xray_payloads import TC_ID_PATTERN, build_manual_payload, classify

# A test case heading, exactly as generate-test-cases writes it in this
# fixture's shape: "## TC-<KEY>-<NNN> - <summary>". Reuses TC_ID_PATTERN so
# the two modules can never disagree on what a TC-ID looks like.
TC_HEADING_PATTERN = re.compile(
    r"^##\s+(" + TC_ID_PATTERN.pattern + r")\s*-\s*(.+?)\s*$", re.MULTILINE
)

# YAML front matter at the very top of a generated markdown file. Only its
# presence/absence matters here -- load_folder does not read any of its
# fields, so it is stripped rather than parsed.
_FRONT_MATTER_PATTERN = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)

# "**Priority**: P1" (qa-conventions.md's P1-P4 scheme). Optional: a test
# case file that omits it still uploads, just with no priority recorded.
_PRIORITY_PATTERN = re.compile(r"\*\*Priority\*\*:\s*(P[1-4])", re.IGNORECASE)

_SEPARATOR_CELL_PATTERN = re.compile(r"^:?-+:?$")

_PLATFORM_LABELS = {"cloud": "Xray Cloud", "server": "Xray Server/DC"}

# Emitted when a run imports Gherkin. Every .feature file is sent in full on
# every run and Xray's own scenario matching is what stops a re-run creating a
# second copy -- and the vendor documents no matching semantics for
# import_feature at all (api-contract.md, ## Unverified item 7). That is an
# assumption the user is entitled to know they are relying on, so it is said
# out loud rather than left in a source comment. Like the Server step notice,
# it reports something that SUCCEEDED and so must not change the exit code.
GHERKIN_REIMPORT_NOTICE = (
    "Gherkin: %d feature file(s) were re-imported in full. Agent-QA sends "
    "every .feature file on every run and relies on Xray's own scenario "
    "matching to update the existing Cucumber tests rather than duplicate "
    "them; that matching is not documented by the vendor. If you find "
    "duplicated Cucumber tests in the project after a re-run, this is the "
    "cause -- check the project before the next run."
)


def _strip_front_matter(text):
    return _FRONT_MATTER_PATTERN.sub("", text, count=1)


def _split_table_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def _is_separator_row(cells):
    return bool(cells) and all(_SEPARATOR_CELL_PATTERN.match(c) for c in cells)


def _parse_priority(block):
    match = _PRIORITY_PATTERN.search(block)
    return match.group(1).upper() if match else None


def _parse_steps_table(block, path, tc_id):
    """Parse the "| Step | Action | Data | Expected Result |" table that
    follows a test case heading in this fixture's shape. Column order is
    read from the header row rather than assumed, but the header must name
    an Action and an Expected Result column -- anything else means the file
    does not match the shape this parser understands, and that must be a
    loud failure: a test case whose steps silently come back empty is a
    test case that uploads as an empty shell, and nothing downstream would
    notice."""
    rows = [line for line in block.splitlines() if line.strip().startswith("|")]
    if not rows:
        raise XrayError(
            "%s: test case %s has no steps table (expected a Markdown table "
            "with Action and Expected Result columns)" % (path, tc_id)
        )
    header_cells = [c.lower() for c in _split_table_row(rows[0])]
    try:
        action_idx = next(i for i, c in enumerate(header_cells) if "action" in c)
        expected_idx = next(i for i, c in enumerate(header_cells) if "expected" in c)
    except StopIteration:
        raise XrayError(
            "%s: test case %s's steps table is missing an Action or an "
            "Expected Result column" % (path, tc_id)
        )
    data_idx = next((i for i, c in enumerate(header_cells) if c == "data"), None)

    steps = []
    for line in rows[1:]:
        cells = _split_table_row(line)
        if _is_separator_row(cells):
            continue
        if len(cells) <= max(action_idx, expected_idx):
            raise XrayError(
                "%s: test case %s has a steps table row with too few "
                "columns: %r" % (path, tc_id, line)
            )
        steps.append({
            "action": cells[action_idx],
            "data": cells[data_idx] if data_idx is not None else "",
            "expected": cells[expected_idx],
        })
    return steps


def _parse_test_case_file(path):
    """Parse one test-cases/*.md file into a list of test case dicts, each
    with keys id, summary, steps and priority. Raises XrayError naming the
    file for anything that does not match the expected shape -- a test case
    that silently vanishes here is one that never gets uploaded, and
    nothing downstream would notice it went missing."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        raise XrayError("could not read %s: %s" % (path, e))

    text = _strip_front_matter(text)
    headings = list(TC_HEADING_PATTERN.finditer(text))
    if not headings:
        raise XrayError(
            "%s: no test case heading found (expected '## TC-<KEY>-<NNN> - "
            "<summary>')" % path
        )

    cases = []
    for i, heading in enumerate(headings):
        start = heading.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        block = text[start:end]
        tc_id = heading.group(1)
        summary = heading.group(2).strip()
        steps = _parse_steps_table(block, path, tc_id)
        cases.append({
            "id": tc_id,
            "summary": summary,
            "steps": steps,
            "priority": _parse_priority(block),
        })
    return cases


def load_folder(folder):
    """Read an Agent-QA output folder's test-cases/*.md and gherkin/*.feature
    files. Returns (test_cases, feature_texts): test_cases is a list of
    dicts with keys id/summary/steps/priority (each step a dict with
    action/data/expected); feature_texts is a list of raw .feature file
    contents. Missing subfolders simply contribute nothing -- a folder with
    only manual tests and no Gherkin is a normal, valid input."""
    folder = Path(folder)

    test_cases = []
    for md_path in sorted((folder / "test-cases").glob("*.md")):
        test_cases.extend(_parse_test_case_file(md_path))

    feature_texts = []
    for feature_path in sorted((folder / "gherkin").glob("*.feature")):
        try:
            feature_texts.append(feature_path.read_text(encoding="utf-8"))
        except OSError as e:
            raise XrayError("could not read %s: %s" % (feature_path, e))

    return test_cases, feature_texts


def load_feature_paths(folder):
    """The .feature files load_folder() read, as paths. The execute path
    uploads the files themselves (feature import is a multipart file upload,
    and the filename is part of the request), so it needs the paths, while
    classification only ever needed the text. Same glob, same order, so the
    two views cannot disagree about which files are in play."""
    return sorted((Path(folder) / "gherkin").glob("*.feature"))


def plan_upload(test_cases, feature_texts, existing_keys, project_key=None):
    """Decide, for each test case, whether it will be created or updated,
    and whether it is Cucumber or Manual. Classification comes from
    xray_payloads.classify() and the Manual bulk-import payload from
    xray_payloads.build_manual_payload() -- both are reused here rather
    than reimplemented, so this module and Task 4's stay in agreement by
    construction rather than by convention.

    `project_key` is optional so a plan can be produced for reporting
    purposes before a project is known (build_manual_payload accepts None
    as a project key; Task 6 rebuilds the real payload once one is
    confirmed).
    """
    ids = [tc["id"] for tc in test_cases]
    classification = classify(ids, feature_texts)

    create = [tc_id for tc_id in ids if tc_id not in existing_keys]
    update = [tc_id for tc_id in ids if tc_id in existing_keys]
    cucumber = [tc_id for tc_id in ids if classification.get(tc_id) == "cucumber"]
    manual = [tc_id for tc_id in ids if classification.get(tc_id) == "manual"]

    manual_cases = [tc for tc in test_cases if classification.get(tc["id"]) == "manual"]
    manual_payload = build_manual_payload(manual_cases, existing_keys, project_key)

    return {
        "create": create,
        "update": update,
        "cucumber": cucumber,
        "manual": manual,
        "manual_payload": manual_payload,
    }


def render_dry_run(plan, project_key, platform, folder):
    """Render the dry-run report a user sees by default. Nothing here
    causes a write; it only describes what --execute would do."""
    create = list(plan.get("create", []))
    update = list(plan.get("update", []))
    cucumber = set(plan.get("cucumber", []))
    manual = set(plan.get("manual", []))

    create_cucumber = sum(1 for tc_id in create if tc_id in cucumber)
    create_manual = sum(1 for tc_id in create if tc_id in manual)
    platform_label = _PLATFORM_LABELS.get(platform, platform)

    lines = [
        "Xray upload — DRY RUN (nothing sent)",
        "  Target:  %s on %s" % (project_key, platform_label),
        "  Source:  %s" % folder,
        "",
        "  CREATE  %d tests   %d Cucumber (from gherkin/), %d Manual"
        % (len(create), create_cucumber, create_manual),
    ]
    if update:
        lines.append("  UPDATE  %d tests   %s" % (len(update), ", ".join(update)))
    else:
        lines.append("  UPDATE  %d tests" % len(update))
    lines.append("")
    lines.append("Re-run with --execute to apply.")
    return "\n".join(lines) + "\n"


def render_results(results):
    """Render what --execute actually did. Every failure names its TC-ID and
    its reason, because a run that reports "1 failed" and nothing else leaves
    the user no way to act. No credential value reaches this function."""
    created = list(results.get("created", []))
    updated = list(results.get("updated", []))
    failed = list(results.get("failed", []))
    notices = list(results.get("notices", []))

    lines = [
        "Xray upload — EXECUTED",
        "",
        "  CREATED  %d" % len(created),
    ]
    for key in created:
        lines.append("    + %s" % key)
    lines.append("  UPDATED  %d" % len(updated))
    for key in updated:
        lines.append("    ~ %s" % key)
    lines.append("  FAILED   %d" % len(failed))
    for failure in failed:
        lines.append("    ! %s: %s" % (failure.get("tc_id", "(unknown)"),
                                       failure.get("reason", "no reason given")))
    lines.append("")
    # Notices describe work that SUCCEEDED but did less than a reader would
    # assume. They print above the pass/fail line so they cannot be mistaken
    # for a failure, and they never change the exit code.
    for notice in notices:
        lines.append("  NOTE  %s" % notice)
    if notices:
        lines.append("")
    if failed:
        lines.append(
            "%d test(s) failed. What succeeded above is already in Jira and is "
            "not rolled back; re-running updates it rather than duplicating it."
            % len(failed))
    else:
        lines.append("All tests uploaded successfully.")
    return "\n".join(lines) + "\n"


def redact_account(value):
    """A recognisable prefix of an account identifier and nothing more, so a
    report can say WHICH account wrote without disclosing the identifier.
    Never called on a secret -- secrets do not reach the report at all."""
    if not value:
        return ""
    return (value[:4] + "***") if len(value) > 4 else "***"


def write_report(results, folder, project_key=None, platform=None,
                 account=None):
    """Write {folder}/xray/upload-report.md and return its path.

    Written whatever the outcome: a run where seventeen of thirty tests
    failed still has twenty-nine successes worth recording, and the failures
    are the whole reason someone opens this file.
    """
    created = list(results.get("created", []))
    updated = list(results.get("updated", []))
    failed = list(results.get("failed", []))
    notices = list(results.get("notices", []))

    out_dir = Path(folder) / "xray"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "upload-report.md"

    lines = [
        "---",
        "type: xray-upload-report",
        "generated: %s" % datetime.date.today().isoformat(),
        "platform: %s" % (platform or ""),
        "project: %s" % (project_key or ""),
    ]
    if account:
        # Redacted to a recognisable prefix. The secret itself is never
        # passed to this function, let alone written.
        lines.append("account: %s" % redact_account(account))
    lines.extend([
        "created: %d" % len(created),
        "updated: %d" % len(updated),
        "failed: %d" % len(failed),
        "---",
        "",
        "# Xray upload report",
        "",
    ])
    # Notices go first, before the counts, because a caveat about work that
    # succeeded is exactly the kind of thing that gets missed at the bottom.
    if notices:
        lines.append("## Read this")
        lines.append("")
        for notice in notices:
            lines.append("> %s" % notice)
            lines.append("")
    lines.extend([
        "## Created (%d)" % len(created),
        "",
    ])
    lines.extend(["- %s" % key for key in created] or ["_None._"])
    lines.extend(["", "## Updated (%d)" % len(updated), ""])
    lines.extend(["- %s" % key for key in updated] or ["_None._"])
    lines.extend(["", "## Failed (%d)" % len(failed), ""])
    if failed:
        lines.append("| Test case | Reason |")
        lines.append("|-----------|--------|")
        for failure in failed:
            reason = str(failure.get("reason", "no reason given"))
            lines.append("| %s | %s |" % (failure.get("tc_id", "(unknown)"),
                                          reason.replace("|", "\\|")))
    else:
        lines.append("_None._")
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def _account_identifier(credentials):
    """The account identifier worth recording in the report, if there is one.

    Only `jira_email` qualifies. An email address identifies who ran the
    upload without being credential material; `client_id` is deliberately
    NOT used, because it is one half of the Cloud credential pair and the
    report is a file the user commits to their own repository. Recording a
    redacted prefix of it would still be disclosing part of a credential,
    and the rule for this project is that no credential value reaches a
    report at all -- not even partially, not even masked.

    A Server/DC personal access token names no account, so nothing is
    recorded there. A SECRET is never returned by this function."""
    value = (credentials or {}).get("jira_email")
    return value or None


def run(folder, project_key, platform, base_url, credentials, transport,
        execute=False, cloud_host=None, test_issue_type=None):
    """Load a folder, plan the upload, and either print the dry-run report
    (default) or apply it (--execute). `transport` is injected so callers --
    tests included -- control exactly what this reaches over the network.

    Returns 0 only when the run is wholly successful. A run where some tests
    uploaded and others were rejected returns 1: partial failure is the normal
    case here, and reporting it as success is the one outcome that would let a
    broken upload pass unnoticed. The error is printed without ever including
    a credential value, since every XrayError raised anywhere in this call
    chain is built that way.
    """
    try:
        test_cases, feature_texts = load_folder(folder)
        client = XrayClient(platform, base_url, credentials, transport,
                             cloud_host=cloud_host,
                             test_issue_type=test_issue_type)
        ids = [tc["id"] for tc in test_cases]
        existing_keys = client.find_tests_by_label(project_key, ids)
        plan = plan_upload(test_cases, feature_texts, existing_keys,
                            project_key=project_key)

        if not execute:
            print(render_dry_run(plan, project_key, platform, folder))
            return 0

        # Everything below this line writes to a live Jira. Nothing above it
        # does, and nothing below it is reachable without --execute.
        results = empty_results()
        if plan["manual_payload"]:
            merge_results(results,
                          client.import_manual_tests(plan["manual_payload"]))
        imported_features = 0
        for feature_path in load_feature_paths(folder):
            # One file at a time, and one file's failure never stops the next:
            # a batch must not be abandoned at its first rejection.
            outcome = client.import_feature_file(
                str(feature_path), project_key, existing_keys=existing_keys)
            if outcome["created"] or outcome["updated"]:
                imported_features += 1
            merge_results(results, outcome)
        if imported_features:
            results["notices"].append(
                GHERKIN_REIMPORT_NOTICE % imported_features)

        print(render_results(results))
        report_path = write_report(
            results, folder, project_key=project_key, platform=platform,
            account=_account_identifier(credentials))
        print("Report: %s" % report_path)
        return 1 if results["failed"] else 0
    except XrayError as e:
        print("Error: %s" % e, file=sys.stderr)
        return 1


def _read_config_value(config_path, key, default=""):
    """Minimal top-level scalar reader for config.yml. Only reads plain,
    unindented 'key: value' lines -- exactly the shape xray_platform,
    xray_project_key, xray_base_url, xray_cloud_host and
    xray_test_issue_type are declared in. Deliberately not a general YAML
    parser: this command has no need for one, and the project takes no
    third-party dependency."""
    try:
        with open(config_path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return default
    for raw_line in lines:
        if raw_line[:1] in (" ", "\t"):
            continue  # nested key, not a top-level scalar
        line = raw_line.split("#", 1)[0]
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        if k.strip() == key:
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            return v
    return default


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="upload.py",
        description="Upload generated Xray tests from an Agent-QA output "
                     "folder. Prints a dry-run report by default; nothing "
                     "is written to Jira unless --execute is given.",
    )
    parser.add_argument(
        "--folder", required=True,
        help="Agent-QA output folder (contains test-cases/ and gherkin/)")
    parser.add_argument(
        "--execute", action="store_true", default=False,
        help="Perform the upload. Without this flag, only a dry-run "
             "report is printed and nothing is sent to Jira.")
    parser.add_argument(
        "--config", default="agent-qa/config.yml",
        help="Path to config.yml (default: agent-qa/config.yml)")
    parser.add_argument(
        "--credentials", default="agent-qa/.xray-credentials",
        help="Path to the Xray credentials file "
             "(default: agent-qa/.xray-credentials)")
    args = parser.parse_args(argv)

    platform = _read_config_value(args.config, "xray_platform")
    if not platform:
        print(
            "Xray upload is not configured: xray_platform is empty in %s. "
            "Set xray_platform to 'cloud' or 'server' to enable this "
            "command." % args.config
        )
        return 0

    project_key = _read_config_value(args.config, "xray_project_key")
    if not project_key:
        print("Error: xray_project_key is not set in %s" % args.config,
              file=sys.stderr)
        return 1

    base_url = _read_config_value(args.config, "xray_base_url") or None
    cloud_host = _read_config_value(args.config, "xray_cloud_host") or None
    test_issue_type = (
        _read_config_value(args.config, "xray_test_issue_type", "Test")
        or "Test"
    )

    try:
        credentials = read_credentials(args.credentials)
    except XrayError as e:
        print("Error: %s" % e, file=sys.stderr)
        return 1

    transport = UrllibTransport()
    return run(folder=args.folder, project_key=project_key, platform=platform,
               base_url=base_url, credentials=credentials, transport=transport,
               execute=args.execute, cloud_host=cloud_host,
               test_issue_type=test_issue_type)


if __name__ == "__main__":
    sys.exit(main())
