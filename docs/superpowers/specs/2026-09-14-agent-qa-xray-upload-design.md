# Agent-QA — Automated Xray Upload

**Date:** 2026-09-14
**Status:** Approved design, ready for implementation planning
**Scope:** Sub-project 3 of 3
**Branch:** `xray-upload`

---

## Context

Agent-QA generates test cases and Gherkin features, and every Xray path in the repository ends at a
file. `generate-test-cases` writes a CSV in Xray import format and, when `output_formats.xray_json`
is enabled, an `xray-import.json` alongside it. `agent-qa/formats/xray/xray-json-template.md`
defines their shape. A human then opens Jira and imports them by hand, every time.

That manual step is the gap this sub-project closes.

The repository already publishes to one external system: `publish-to-confluence` converts
deliverables and pushes them through the Atlassian MCP server, checking the tool exists first and
degrading to "your files are ready for manual upload" when it does not. Xray cannot reuse that path.
It is a third-party Jira app with its own API, its own authentication, and two products — Cloud and
Server/Data Center — that differ in base URL, API version and auth model. The Atlassian MCP covers
none of it.

**Intended outcome:** one command that takes a generated output folder and puts its test cases into
Jira as Xray tests — Cucumber tests where a Gherkin feature exists, Manual tests otherwise — without
creating a duplicate on the second run, and without a credential ever passing through a command line.

### Decisions taken during design

| Decision | Choice |
|---|---|
| Xray flavour | Both Cloud and Server/DC, selected by config |
| Re-upload behaviour | Match existing and update; create only what is new |
| Safety default | Dry-run by default; writing requires an explicit `--execute` |
| Match key | A Jira label carrying the TC-ID |
| Credentials | A gitignored secrets file in the project |
| Test case vs Gherkin | Gherkin wins where it exists; Manual for the rest — one Xray test per TC-ID |
| Mechanism | Python scripts invoked as commands |

### Rejected, and why

**An Xray MCP server.** Architecturally the closest fit — Agent-QA already hard-depends on MCP, so
it would add no new class of dependency, and a credential held in MCP server config never reaches a
command line at all. Rejected because it is a new deliverable with its own lifecycle: packaging, a
version, per-IDE install instructions, and an owner when Xray's API changes. That is a larger
commitment than this sub-project warrants.

**Phases instructing the agent to run `curl` directly.** Purest fit with a markdown-only repository,
but the JWT exchange, pagination and error handling would become prose the agent must re-derive
every run, and the secret would flow through a command line the agent composes — into shell history
and transcripts.

**Generating payloads and printing the commands for a human to run.** Safest possible; Agent-QA
never touches a credential. Rejected because it is not the automation that was asked for.

**Uploading test cases and Gherkin independently.** Simplest to build, but a TC-ID present in both
would produce two Xray tests — reintroducing by design the duplication that label matching exists to
prevent.

### Out of scope

Test execution results, test plans, test sets and test repository folder placement. This uploads
test definitions only. Xray's execution-import endpoint is a different problem with a different
shape and deserves its own design pass if it is ever wanted.

---

## Architecture

The markdown/Python split follows the boundary sub-project 2 established: markdown says what and
when, executable code says how.

```
agent-qa/framework/xray/          markdown — mirrors framework/git-repository/
├── xray-framework-index.md       entry map
├── config/validate-xray.md       platform detection, credential presence, refuse-if-tracked
├── operations/upload-tests.md    the neutral operation phases call
├── operations/match-existing.md  label-based lookup semantics
└── formats/upload-report.md      shape of the dry-run and result report

scripts/xray/                     python — the executable client
├── xray_client.py                auth + HTTP for both flavours, dispatched by config
├── upload.py                     the CLI the phases invoke
└── README.md                     what it is, how it is invoked, why it exists

agent-qa/commands/upload-to-xray/ the command — 4 phases + entry point + wrapper
```

**Cloud versus Server/DC dispatches inside `xray_client.py`**, keyed off `xray_platform` in
`config.yml` — the same shape as `repository_platform` switching GitLab, GitHub and Azure DevOps.
One client, two auth strategies, two base URLs.

**Dependency policy: standard library only.** `urllib.request`, `json`, `base64`. No `requests`, no
`pip install`, no virtualenv. Xray's API is JSON over HTTPS with a bearer token, which the standard
library handles. Every added dependency is one more thing that must be present before a QA command
works. Python 3.8 is the floor.

**One implementation covers Windows.** Sub-projects 1 and 2 each shipped a PowerShell twin that
could never be executed in development — sub-project 2's `Remove-StaleAgents` was verified by
reading only, and its final review predicted a bash/PowerShell divergence at a boundary condition
that nobody could test. A single Python file removes that entire class of unverifiable work.

---

## The upload flow

Four phases, matching the repository's shape:

```
1-find-and-select-tests.md    select an output folder; load test-cases/ and gherkin/
2-classify-and-build.md       decide Cucumber vs Manual per TC-ID; build payloads
3-dry-run-and-confirm.md      match against Jira; show the split; STOP for approval
4-upload-and-report.md        execute; write the report
```

### Classification

For each TC-ID in the test cases, look for a Gherkin scenario carrying that ID. Generated `.feature`
files already title scenarios `TC-PROJ-123-001 - {summary}`. Found means Cucumber, uploaded through
the feature endpoint. Not found means Manual, uploaded through the bulk test endpoint. One Xray test
per TC-ID, decided locally before anything touches the network.

### Matching

Query Jira by label in batches rather than one lookup per test:

    project = PROJ AND labels in ("TC-PROJ-123-001", "TC-PROJ-123-002", ...)

Each returned issue maps a label back to an issue key, partitioning the set into **update** (label
found, key known) and **create** (no match).

**The label is applied on create.** That is the link making every future run idempotent. If it were
ever omitted, the next run would re-create everything — so the client must never skip it, and the
first live test must confirm it lands.

### Dry-run

Default. Prints the decision and writes nothing:

    Xray upload — DRY RUN (nothing sent)
      Target:  PROJ on Xray Cloud
      Source:  agent-qa/2026-09-14-PROJ-123/

      CREATE  6 tests   4 Cucumber (from gherkin/), 2 Manual
      UPDATE  3 tests   PROJ-441, PROJ-442, PROJ-447
      SKIP    0

    Re-run with --execute to apply.

Writing requires the explicit `--execute` flag. No default invocation touches Jira.

### Errors and resumability

Xray's bulk import is asynchronous — it returns a job id to poll — so partial failure is real: some
tests land, others do not. The client tracks each TC-ID independently and phase 4 writes
`{selected_folder}/xray/upload-report.md` listing created keys, updated keys, and failures with
their reasons. A failed run is resumable precisely because matching is label-based: re-running finds
what already landed and retries only the rest.

### The endpoints are a research task, not an assumption

Cloud and Server/DC differ in base URL, API version, authentication and the multipart shape of
feature import. **This spec deliberately does not state those paths.** Getting one wrong produces an
integration that fails on first contact. The design isolates every one inside `xray_client.py`, and
pinning them against current vendor documentation is an explicit first task in the implementation
plan — not something inferred while coding.

---

## Credentials and safety

`agent-qa/.xray-credentials`, added to `.gitignore` by the installer and created `chmod 600`.

Two safeguards make a file-based secret safe rather than merely convenient:

- **Refuse if tracked.** Before reading it, the client runs `git ls-files --error-unmatch` against
  the path. If git knows about the file, the command aborts and writes nothing. A `.gitignore` that
  was edited, reordered or never applied becomes a loud failure instead of a silent commit.
- **Never echoed.** The value is read inside the client and used only as a header. It appears in no
  argument, no log line and no report. The report redacts the account to a recognisable prefix.

`health-check` gains a probe: the file exists, its permissions are not world-readable, its path is
gitignored, and git does not track it — all without printing a byte of its content.

### Configuration

Non-secret only:

```yaml
xray_platform: ""        # cloud | server — empty disables the command entirely
xray_project_key: ""     # the Jira project tests are created in
xray_base_url: ""        # Server/DC only: your Jira host
```

An empty `xray_platform` makes `upload-to-xray` report "not configured" and exit. Nobody who has not
opted in can trigger a write to Jira.

---

## Testing

Python makes this the first code in Agent-QA that can carry real unit tests. `unittest` is standard
library, and the client's HTTP layer is injectable, so the logic that matters is testable without a
Jira instance:

- Cloud versus Server dispatch
- label-to-issue-key partitioning into create and update
- Cucumber versus Manual classification
- payload construction, including that the TC-ID label is always present on create
- partial-failure handling and per-test outcome tracking
- **that dry-run issues no write request at all** — asserted against a fake transport that fails the
  test if a write is attempted

The harness gains `python3 -m py_compile` over `scripts/xray/*.py` (the analogue of `bash -n`) and a
check that runs the unit tests. Six guards on the previous branch were found unable to fire, so each
new check gets the same treatment: break the thing it guards, watch it fail, restore.

---

## Risks

**Wrong endpoints or payload shapes.** The one risk determined by a vendor rather than by our own
logic, and the two products differ. It fails on first contact rather than silently, which is the
good kind of wrong, but the first real run is where this design meets reality.

**The label is load-bearing.** Every future run's idempotency depends on it landing at creation
time. If either flavour silently drops unknown fields, re-runs would duplicate. The first live test
must create one test, re-run the dry-run, and confirm it reports UPDATE rather than CREATE.

**Partial failure in an async job.** Handled by per-test tracking and resumability, but the first
live run should deliberately include one test that fails validation, to confirm the rest still land
and the report names the failure.

**A credential on disk.** Mitigated by the two safeguards above. The residual is a machine where
someone bypasses both — which is why the file is never the only thing standing between a mistake and
a commit.

---

## Existing files to change

Sub-project 2's two worst defects were both here — an installer that silently shipped zero agents,
and a `health-check` that validated a directory which no longer existed. Neither was noticed until a
reviewer built a real fixture. This list exists so the same class is planned for rather than
discovered.

- `scripts/project-install.sh`, `scripts/project-install.ps1`, `scripts/project-update.sh` — sync the
  two new directories, `agent-qa/framework/xray/` and `scripts/xray/`, the way `rules/` and `roles/`
  are synced today. A check must assert each is both defined and called, not merely mentioned.
- `.gitignore` handling in the installer — add `agent-qa/.xray-credentials`, and verify it took
  effect rather than assuming it did.
- `agent-qa/config.yml.template` — the three non-secret keys, with their comments.
- `agent-qa/commands/health-check/` — the credential probe described above.
- `agent-qa/commands/validate-outputs/2-validate-deliverables.md` — recognise the new
  `xray/upload-report.md` deliverable and its `type: xray-upload-report` front matter.
- `agent-qa/rules/qa-conventions.md` and `agent-qa/rules/output-standards.md` — the `xray/` output
  subfolder and the report's file name.
- `agent-qa/ide/claude/commands/agent-qa/upload-to-xray.md` — the slash-command twin, which
  `check_command_phases` will require and which must list phase markers identical to the entry point.
- `CLAUDE.md`, `README.md`, `USER_GUIDE.md`, `INSTALLATION.md` — the command, the Python floor, the
  credentials file and its safety rules.

---

## Verification

Runs in development:

1. `python3 -m py_compile scripts/xray/*.py`
2. The unit suite, including the assertion that dry-run performs no write
3. `bash scripts/check-repo.sh` — existing checks plus the new ones
4. Each new harness check proven able to fail

Requires a real Jira project with Xray, and forms the acceptance checklist:

5. **Against a throwaway Jira project first, never the real one.** Dry-run, inspect the plan.
6. `--execute`, then confirm the created tests carry their TC-ID labels.
7. Re-run the dry-run: every test must report UPDATE, none CREATE. This is the idempotency proof and
   the single most important item on this list.
8. Deliberately include one invalid test; confirm the others still land and the report names the
   failure with its reason.
9. Repeat 5-7 on the other Xray flavour if both are in use — the dispatch is untested until each
   path has run once.
10. One run from Windows, confirming the Python client behaves identically. Unlike previous
    sub-projects this needs no separate implementation, only confirmation.

Item 7 is the gate. Without it, the design's central claim — that a second run does not duplicate —
is unproven.
