"""Xray upload CLI. Dry-run by default -- reaches Jira only to search for
existing tests by label, never to write. `--execute` (Task 6) is the only
way to actually create or update a test.

Python 3.8 floor, standard library only. This module is pure orchestration:
classification and payload construction stay in xray_payloads.py, auth/HTTP
stays in xray_client.py. See docs/superpowers/specs/2026-09-14-agent-qa-
xray-upload-design.md for the design this implements.
"""

import argparse
import re
import sys
from pathlib import Path

from xray_client import UrllibTransport, XrayClient, XrayError, read_credentials
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


def run(folder, project_key, platform, base_url, credentials, transport,
        execute=False, cloud_host=None):
    """Load a folder, plan the upload, and either print the dry-run report
    (default) or apply it (--execute, implemented in Task 6). `transport`
    is injected so callers -- tests included -- control exactly what this
    reaches over the network. Returns 0 on success, non-zero on XrayError;
    the error is printed without ever including a credential value, since
    every XrayError raised anywhere in this call chain is built that way.
    """
    try:
        test_cases, feature_texts = load_folder(folder)
        client = XrayClient(platform, base_url, credentials, transport,
                             cloud_host=cloud_host)
        ids = [tc["id"] for tc in test_cases]
        existing_keys = client.find_tests_by_label(project_key, ids)
        plan = plan_upload(test_cases, feature_texts, existing_keys,
                            project_key=project_key)

        if not execute:
            print(render_dry_run(plan, project_key, platform, folder))
            return 0

        # The write path lands in Task 6. Reaching here with --execute
        # today would need a real import call this task does not provide,
        # so it fails loudly rather than silently doing nothing.
        raise XrayError(
            "--execute is not implemented yet; only the dry-run path exists"
        )
    except XrayError as e:
        print("Error: %s" % e, file=sys.stderr)
        return 1


def _read_config_value(config_path, key, default=""):
    """Minimal top-level scalar reader for config.yml. Only reads plain,
    unindented 'key: value' lines -- exactly the shape xray_platform,
    xray_project_key, xray_base_url and xray_cloud_host are declared in.
    Deliberately not a general YAML parser: this command has no need for
    one, and the project takes no third-party dependency."""
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

    try:
        credentials = read_credentials(args.credentials)
    except XrayError as e:
        print("Error: %s" % e, file=sys.stderr)
        return 1

    transport = UrllibTransport()
    return run(folder=args.folder, project_key=project_key, platform=platform,
               base_url=base_url, credentials=credentials, transport=transport,
               execute=args.execute, cloud_host=cloud_host)


if __name__ == "__main__":
    sys.exit(main())
