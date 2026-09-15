# Phase 2: Classify and Build

## Core Responsibilities

- Load the selected folder's `test-cases/` and `gherkin/` content so the engineer can see what
  will be uploaded before anything runs
- Confirm there is something to upload
- State plainly that classification (Cucumber vs. Manual) and matching (create vs. update) are
  not this phase's job — they belong to `scripts/xray/upload.py`, invoked in Phase 3

## Workflow Steps

### Step 1: Load Test Cases

Read every test case markdown file in `{selected_folder}/test-cases/`:

1. Parse YAML front matter to extract `source_requirements` and `language`
2. Parse the markdown body to extract each test case's ID (e.g., `TC-PROJ-123-001`), summary,
   and priority

If `{selected_folder}/test-cases/` contains zero test case files, stop here and report:

```
No test cases found in {selected_folder}/test-cases/. Nothing to upload.
```

Do not proceed to Phase 3.

### Step 2: Load Gherkin Feature Files, If Present

If `has_gherkin` from Phase 1 is true, read every `.feature` file in `{selected_folder}/gherkin/`
and note which TC-IDs appear inside them. This is for the engineer's preview only — it is not a
reimplementation of the matching Xray performs on import.

### Step 3: State What Classification Actually Is

This command does not decide, and does not need to decide, which test case becomes a Cucumber
test and which becomes a Manual test. That decision is made inside `scripts/xray/upload.py` when
it runs, following `@agent-qa/framework/xray/operations/upload-tests.md`: a test case whose TC-ID
appears in a `.feature` file is uploaded as Cucumber; every other test case is uploaded as
Manual. This phase's job is only to supply the CLI with `{selected_folder}` and to give the
engineer an accurate preview count — not to build the payload or match against Jira itself.

Present a preview to the engineer:

```
Ready to classify {N} test cases from {selected_folder}:
  - {G} test case(s) also appear in a gherkin/ feature file → will upload as Cucumber
  - {N - G} test case(s) have no matching feature file → will upload as Manual

The exact classification and any create-vs-update decision happens when
scripts/xray/upload.py runs in the next phase (see
agent-qa/framework/xray/operations/match-existing.md for how existing tests are matched).
```

### Step 4: Refuse Credentials Offered in Chat

As in Phase 1: if the user offers an Xray or Jira credential in chat at any point, refuse it and
point them at `agent-qa/.xray-credentials`. Do not accept, store, or repeat the value.

## Data Storage

Store for subsequent phases:
- `test_case_count`: total number of test cases loaded
- `gherkin_tc_ids`: set of TC-IDs found inside `.feature` files (empty if `has_gherkin` is false)

## Constraints

- Do NOT call `scripts/xray/upload.py` in this phase — that is Phase 3's job
- Do NOT reimplement Gherkin-vs-Manual classification or label matching; both are described in
  `@agent-qa/framework/xray/operations/upload-tests.md` and
  `@agent-qa/framework/xray/operations/match-existing.md` and are performed by the client, not by
  this phase
- Do NOT modify any existing files
- Do NOT accept, store, or repeat any credential value the user offers in chat
