# Xray Integration Framework - Operation Index

Complete reference of all available framework operations for uploading Agent-QA's generated test
cases into Jira as Xray tests.

## Source of Record for Endpoints

**`api-contract.md`** is the pinned source of record for every Xray/Jira endpoint, request body,
response shape, credential, and known gap this framework relies on. Nothing below restates an
endpoint URL — none of these files name one. When a phase, a role, or an engineer needs to know
what a request actually looks like, or why one flavour behaves differently from the other, that
detail lives in `api-contract.md`, not here. Never write an endpoint into a command phase or a
role file directly; reference `agent-qa/framework/xray/api-contract.md` instead.

The Python client (`scripts/xray/xray_client.py`, `scripts/xray/xray_endpoints.py`) is generated
against that same contract and is the only code that calls Xray or Jira. The files below describe
how to operate that client through `scripts/xray/upload.py`, not how to reimplement it.

## Not a Per-Platform Framework

Unlike `agent-qa/framework/git-repository/`, this framework has no `-gitlab.md` / `-github.md`
style per-platform files to route between. Xray ships in two flavours — Cloud and Server/Data
Center — that are genuinely different implementations, but the dispatch between them happens
once, inside `scripts/xray/upload.py` and `scripts/xray/xray_client.py`, driven by the
`xray_platform` config key. A command phase invokes the same CLI regardless of which flavour is
configured.

## Configuration

### Xray Preflight
- **`config/validate-xray.md`** - Validate Xray is configured and safe to use before any upload
  - Reads: `xray_platform`, `xray_project_key`, `xray_base_url` from `agent-qa/config.yml`
  - Confirms: `agent-qa/.xray-credentials` exists and is not tracked by git
  - Returns: `configured`, `skipped` (Xray unused), or `stopped` (misconfigured or unsafe)

## Operations

### Match Existing Tests
- **`operations/match-existing.md`** - The label-lookup semantics behind create-vs-update
  - Match key: a Jira label equal to the test case's TC-ID
  - Found → update; absent → create; the label is applied at creation and must never be omitted
  - This is what makes a partial-failure re-run resumable without manual cleanup

### Upload Tests
- **`operations/upload-tests.md`** - The neutral upload operation
  - Invocation: `python3 scripts/xray/upload.py --folder {selected_folder}`
  - Dry run is the default and writes nothing; `--execute` is the only way to write to Jira, and
    only after engineer approval
  - Gherkin wins where a `.feature` file carries the TC-ID; Manual covers every other test case
  - Surfaces notices for things that succeeded but did less than expected (Server/DC field-only
    update, Gherkin re-import) — see that file for both in full

## Output Format

### Upload Report
- **`formats/upload-report.md`** - The structure of `{output_folder}/xray/upload-report.md`
  - Written only on an executed (`--execute`) run, whatever its outcome
  - Front matter: `type`, `generated`, `platform`, `project`, optional redacted `account`,
    `created`, `updated`, `failed` counts
  - Body: optional "Read this" notices, then Created / Updated / Failed sections

## Known Gaps

`api-contract.md`'s `## Unverified` section lists every vendor-documentation gap this framework
works around, including the two behaviors surfaced as run-time notices (Server/DC step updates,
item 6; Gherkin re-import matching, item 7). Consult it before assuming any Xray behaviour this
framework does not explicitly state.

## Operation Dependencies

```
config/validate-xray.md
    ↓
operations/match-existing.md  (semantics — read before upload-tests.md)
    ↓
operations/upload-tests.md    (the operation a phase actually invokes)
    ↓
formats/upload-report.md      (how to read what upload-tests.md wrote)
```

## Quick Reference

**For Command Developers:**
1. Start with `config/validate-xray.md`; stop if it reports `skipped` or `stopped`
2. Read `operations/match-existing.md` to understand why re-running is safe
3. Use `operations/upload-tests.md` to run the dry run, get approval, then execute
4. Use `formats/upload-report.md` to interpret `{output_folder}/xray/upload-report.md`
5. Consult `api-contract.md` for any endpoint-level question none of the above answers

**For Anyone Auditing an Endpoint, Field Name, or Credential:**
- See `api-contract.md` — it carries the vendor URL and retrieval date behind every fact
