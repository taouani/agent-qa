# Agent-QA Portable Roles Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move specialist craft out of command phase files into IDE-neutral `agent-qa/roles/` files that every supported tool can read, leaving phases as orchestration and reducing the eleven agents to thin Claude wrappers.

**Architecture:** `rules/` holds conventions everything obeys, `roles/` holds craft a specialist applies, `formats/` holds output templates, `commands/` holds orchestration. Phases reference roles by `@`-path exactly as they already reference rules. `rules/automation-conventions.md`, built in sub-project 1 and shared by six commands without duplication, is the working precedent this copies.

**Tech Stack:** Markdown phase files, YAML config, Bash + PowerShell install scripts. No application runtime, no package manager, no test framework — `scripts/check-repo.sh` is the harness.

**Spec:** `docs/superpowers/specs/2026-09-14-agent-qa-roles-refactor-design.md`

## Correction to the spec, applied by this plan

The spec lists ten roles and separately orders `generate-playwright-tests` last in the refactor
sequence — but no role in its list owns that command's craft. Its page-object patterns, spec
structure and assertion style live in phases 3 and 4 and are not covered by
`rules/automation-conventions.md` (which holds locator ladder, failure classification and fix
policy for the five live-automation commands).

This plan therefore adds an **eleventh role, `playwright-authoring.md`**, and Task 11 fills it.
Without it, `generate-playwright-tests` would be the one command left with craft in its phases,
silently contradicting the spec's "all 24 commands, one consistent architecture" decision.

## Global Constraints

- **Move, not rewrite.** Craft text moves **verbatim** into its role. No rewording, no reordering, no incidental improvement during a move. Improvements are a separate change, separately reviewed. This is what makes the refactor mechanically verifiable.
- **Under-move when unsure.** A line that is ambiguously craft-or-orchestration stays in the phase. A verbose phase is merely untidy; a role missing a step is broken.
- **Extraction test.** Craft = another command doing similar work would need this sentence. Orchestration = it names a path, a gate, an order, or a file.
- **Reference form.** Phases reference roles as `@agent-qa/roles/{name}.md`, the same form already used for rules. Never by bare filename, never by description.
- **Role size ceiling.** A role over ~250 lines is split by deliverable rather than allowed to sprawl. State the split in the task's report.
- **Phase file idiom, unchanged:** `# Phase N: Title`, `## Core Responsibilities`, `## Workflow` or `## Workflow Steps`, `### Step N: ...`, then the file's existing trailing sections. Renumber every `### Step N:` heading and any cross-reference when steps are removed.
- **Role file anatomy:** `# {Role Name}`, one-paragraph purpose, `## When This Applies`, the craft sections moved verbatim, `## What This Role Never Does`.
- **`bash scripts/check-repo.sh` must exit 0 at the end of every task.**
- **Extraction coverage must pass** — `bash scripts/check-extraction.sh <command-dir> <role-file> <base-sha>` (created in Task 1) exits 0.
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
| `scripts/check-extraction.sh` | Proves every line removed from a phase landed in its role |
| `agent-qa/roles/test-case-design.md` | Positive/negative/edge derivation, priority and risk classification, traceability, quality validation |
| `agent-qa/roles/test-planning.md` | Scope, levels, types, design techniques, environments, entry/exit criteria — shared by strategy, plan and charter |
| `agent-qa/roles/risk-analysis.md` | Risk identification, categorisation, scoring, mitigation, contingency, ownership |
| `agent-qa/roles/release-reporting.md` | Release-note framing and the traceability matrix craft shared with the traceability report |
| `agent-qa/roles/requirements-analysis.md` | Requirement extraction, epic/story handling, quality analysis |
| `agent-qa/roles/code-change-analysis.md` | Commit correlation, diff interpretation, change summarisation |
| `agent-qa/roles/gherkin-authoring.md` | Test case to Given/When/Then mapping, scenario outlines, tagging |
| `agent-qa/roles/api-test-design.md` | Endpoint analysis, request/response assertions, auth and error cases |
| `agent-qa/roles/accessibility-mapping.md` | WCAG 2.1 AA success-criterion mapping and per-element checks |
| `agent-qa/roles/test-data-design.md` | Data set derivation, boundary and invalid data, generation strategy |
| `agent-qa/roles/playwright-authoring.md` | Page object design, spec structure, assertion style, data-driven patterns |
| `agent-qa/ide/claude/agents/*.md` (11) | Thin Claude wrappers deferring to a role or rule |

**Modified:** the craft phases of 14 commands; `scripts/check-repo.sh`; `scripts/project-install.sh` and `.ps1`; `scripts/project-update.sh`; `CLAUDE.md`; `README.md`; `USER_GUIDE.md`.

**Deleted:** `agent-qa/agents/` (11 files, moved and rewritten under `ide/claude/agents/`).

---

## Task 1: Extraction harness and the checkpoint command

This is the checkpoint task. **Work stops after it** until the engineer validates against a real
Jira ticket. `generate-test-cases` is first because every downstream deliverable — Gherkin,
Playwright, API, accessibility — derives from its output, so a regression here travels furthest.

**Files:**
- Create: `scripts/check-extraction.sh`
- Create: `agent-qa/roles/test-case-design.md`
- Modify: `agent-qa/commands/generate-test-cases/3-generate-test-cases-content.md`
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/check-extraction.sh <command-dir> <role-file> <base-sha>` — exit 0 when every non-blank line removed from that command's phase files since `base-sha` appears in the role file; exit 1 listing the orphans otherwise. Tasks 2-11 all call it. Also produces `check_roles_wired` in `check-repo.sh`, which Tasks 2-11 extend by adding their role to its list.

- [ ] **Step 1: Write the extraction verifier**

Create `scripts/check-extraction.sh`:

```bash
#!/usr/bin/env bash
# Proves a craft extraction was a MOVE, not a rewrite.
# Every non-blank line removed from a command's phase files since <base-sha>
# must appear in the role file it was moved to.
# Usage: bash scripts/check-extraction.sh <command-dir> <role-file> <base-sha>
set -uo pipefail

CMD_DIR=$1
ROLE_FILE=$2
BASE=$3

if [[ ! -f "$ROLE_FILE" ]]; then
    echo "FAIL: role file not found: $ROLE_FILE"
    exit 1
fi

orphans=0
while IFS= read -r line; do
    stripped="${line#-}"
    # Blank lines and pure markdown scaffolding move freely; they carry no craft.
    [[ -z "${stripped// /}" ]] && continue
    case "$stripped" in
        '## Workflow'*|'## Core Responsibilities'*|'### Step '*|'## Important Constraints'*|'## Constraints'*|'## Data Storage'*) continue ;;
    esac
    if ! grep -Fqx -- "$stripped" "$ROLE_FILE"; then
        echo "ORPHAN (removed from phase, absent from role): $stripped"
        orphans=$((orphans + 1))
    fi
done < <(git diff "$BASE" -- "$CMD_DIR" | grep '^-' | grep -v '^---')

echo
if (( orphans > 0 )); then
    echo "check-extraction: $orphans orphaned line(s) — extraction was not a clean move"
    exit 1
fi
echo "check-extraction: every removed line landed in $ROLE_FILE"
```

- [ ] **Step 2: Write the failing harness checks**

Add to `scripts/check-repo.sh` and register **both** in `run_checks`:

```bash
check_roles_wired() {
    echo "== every role exists and is referenced by a phase =="
    local role name
    # Tasks 2-11 append their role's basename to this list.
    for name in test-case-design; do
        role="agent-qa/roles/$name.md"
        if [[ ! -f "$role" ]]; then
            fail "missing role file: $role"
            continue
        fi
        pass "$role exists"
        if grep -rq "@agent-qa/roles/$name.md" agent-qa/commands/; then
            pass "$name is referenced by a phase"
        else
            fail "orphan role, no phase references it: $role"
        fi
    done
}

check_role_refs_resolve() {
    echo "== every @agent-qa/roles reference resolves =="
    local ref path found=0
    while read -r ref; do
        found=1
        path="${ref#@}"
        [[ -f "$path" ]] && pass "$path" || fail "role reference not found: $path"
    done < <(grep -rhoE '@agent-qa/roles/[a-z-]+\.md' agent-qa/commands/ | sort -u)
    (( found == 0 )) && fail "no role references found in any command — the refactor is not wired"
    return 0
}
```

- [ ] **Step 3: Run to verify both fail**

```bash
bash scripts/check-repo.sh
```
Expected: exit 1, with `missing role file: agent-qa/roles/test-case-design.md` and
`no role references found in any command`.

- [ ] **Step 4: Record the base commit**

```bash
git rev-parse HEAD > /tmp/task1-base.txt && cat /tmp/task1-base.txt
```
Needed by Step 7. Do not skip — the coverage check is meaningless without it.

- [ ] **Step 5: Extract the craft verbatim into the role**

Create `agent-qa/roles/test-case-design.md`. Move, character for character, the bodies of these
steps from `agent-qa/commands/generate-test-cases/3-generate-test-cases-content.md`:

| Source (phase 3) | Destination section in the role |
|---|---|
| `### Step 3: Generate Positive Test Cases` | `## Positive Cases` |
| `### Step 4: Generate Negative Test Cases` | `## Negative Cases` |
| `### Step 5: Generate Edge Cases` | `## Edge Cases` |
| `### Step 6: Assign Priority and Risk Classification` | `## Priority and Risk Classification` |
| `### Step 7: Include Traceability` | `## Traceability` |
| `### Step 8: Quality Validation` | `## Quality Validation` |

Wrap them in the role anatomy:

```markdown
# Test Case Design

You design test cases from analyzed requirements. You optimise for coverage that a reader can
trace back to a requirement, and for cases that would actually fail if the system were wrong.

## When This Applies

Loaded by `generate-test-cases` phase 3, which supplies the structured requirements, the detected
language, the configured `test_types`, and any test charter or strategy already in the output
folder.

{the six moved sections, verbatim}

## What This Role Never Does

- Never invent an acceptance criterion the requirement does not contain
- Never write a case whose expected result restates the action rather than asserting an outcome
- Never translate requirement content — deliverables stay in the source language
- Never assign priority by feature area alone; priority follows the classification table above
```

Leave phase 3 Steps 1 and 2 where they are — Step 1 is language detection, already governed by
`rules/language-handling.md`, and Step 2 is source selection, which is orchestration.

- [ ] **Step 6: Shrink the phase**

In `3-generate-test-cases-content.md`, replace the six removed steps with one step, and renumber so
the file reads Step 1, Step 2, Step 3:

```markdown
### Step 3: Generate the Test Cases

Apply `@agent-qa/roles/test-case-design.md` to the requirements loaded in Phase 2. Supply: the
requirement set with its acceptance criteria, the language detected in Step 1, the `test_types`
configured in `agent-qa/config.yml`, and any test charter or test strategy present in the selected
output folder.

The role owns how cases are derived, prioritised and validated. This phase owns only what is
supplied to it and what happens next.
```

Leave `## Core Responsibilities` and `## Important Constraints` in place, editing the former only
where it describes work that has moved.

- [ ] **Step 7: Verify the extraction was a clean move**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-test-cases agent-qa/roles/test-case-design.md "$(cat /tmp/task1-base.txt)"
bash scripts/check-repo.sh
```
Expected: both exit 0. If `check-extraction.sh` reports orphans, a line was reworded during the
move — restore it verbatim rather than editing the role to match.

- [ ] **Step 8: Commit**

```bash
git add scripts/check-extraction.sh scripts/check-repo.sh agent-qa/roles/test-case-design.md agent-qa/commands/generate-test-cases/
git commit -m "refactor: extract test case design role"
```

- [ ] **Step 9: STOP — checkpoint**

Report to the engineer, and do not begin Task 2:

```
Checkpoint reached. generate-test-cases now delegates its craft to
agent-qa/roles/test-case-design.md.

Before the remaining 13 commands are refactored, please run against a real Jira ticket:
  /agent-qa:analyze-requirements <TICKET>
  /agent-qa:generate-test-cases
and compare the generated test cases against a pre-refactor run of the same ticket.

Confirm the deliverables are equivalent before this plan continues.
```

---

## Tasks 2-11: the remaining roles

Every one of these tasks follows the same five-beat shape, and each beat is spelled out in the task
itself so it can be executed without reading its neighbours:

1. add the role's basename to the `check_roles_wired` list in `scripts/check-repo.sh`, run the
   harness, confirm it fails with `missing role file`
2. record the base commit: `git rev-parse HEAD > /tmp/task-base.txt`
3. create the role by moving the listed sections **verbatim** out of the listed phases
4. replace each removed block with the reference step given in the task, renumbering the phase's
   remaining `### Step N:` headings
5. run `bash scripts/check-extraction.sh <command-dir> <role-file> "$(cat /tmp/task-base.txt)"` and
   `bash scripts/check-repo.sh` — both must exit 0 — then commit

Where a task covers several commands, run `check-extraction.sh` once per command directory against
the same role file.

---

### Task 2: `test-planning` — strategy, plan and charter

The heaviest role: three commands, 1,014 lines between them. It runs first after the checkpoint
precisely because it will expose role bloat if the design has that flaw.

**Files:**
- Create: `agent-qa/roles/test-planning.md`
- Modify: `agent-qa/commands/generate-test-strategy/3-generate-test-strategy-content.md` (365 lines)
- Modify: `agent-qa/commands/generate-test-plan/3-generate-test-plan-content.md` (319 lines)
- Modify: `agent-qa/commands/generate-test-charter/3-generate-test-charter-content.md` (330 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: `check-extraction.sh` and `check_roles_wired` from Task 1.
- Produces: `agent-qa/roles/test-planning.md` with top-level sections `## Test Strategy`, `## Test Plan` and `## Test Charter`, plus a shared `## Common Planning Craft` section. Task 3 references its `## Risk` cross-links.

**Move these sections verbatim:**

| Source | Destination in role |
|---|---|
| strategy phase 3 Steps 1-5 (Scope/Context, Test Levels, Test Types, Design Techniques, Automation Approach) | `## Test Strategy` |
| plan phase 3 Steps 1-5 (Executive Summary, Objectives, Scope, Strategy Integration, Environment Requirements) | `## Test Plan` |
| charter phase 3 Steps 1-4 (Mission/Goal, Scope, Areas to Explore, Test Approach) | `## Test Charter` |

**Size rule, applied in this task:** if the assembled role exceeds ~250 lines, split it into
`agent-qa/roles/test-planning.md` (holding the material common to all three — scope definition,
test levels, test types, design techniques) and `agent-qa/roles/test-charter.md` (holding
exploratory-specific craft: session-based testing, heuristics, areas to explore). Charter craft is
the least shared of the three, so it is the natural seam. Record the decision and the resulting
line counts in the task report.

If the split happens, add `test-charter` to the `check_roles_wired` list as well — a role no phase
references fails that check, which is exactly the orphan it exists to catch.

**Replacement step** for each of the three phases, with `{Deliverable}` and `{section}` filled in
per command:

```markdown
### Step 1: Generate the {Deliverable} Content

Apply `@agent-qa/roles/test-planning.md`, using its `## {section}` section, to the requirements
loaded in Phase 2. Supply: the requirement set, the detected language, the configured `test_types`,
and any sibling deliverables already present in the selected output folder.

The role owns how the {deliverable} is shaped. This phase owns what is supplied to it, where the
result lands, and the order of the remaining steps.
```

- [ ] **Step 1: Add `test-planning` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the sections in the table above, verbatim**
- [ ] **Step 4: Replace each removed block with the replacement step; renumber remaining steps in all three phase files**
- [ ] **Step 5: Verify and commit**

```bash
B=$(cat /tmp/task-base.txt)
bash scripts/check-extraction.sh agent-qa/commands/generate-test-strategy agent-qa/roles/test-planning.md "$B"
bash scripts/check-extraction.sh agent-qa/commands/generate-test-plan     agent-qa/roles/test-planning.md "$B"
bash scripts/check-extraction.sh agent-qa/commands/generate-test-charter  agent-qa/roles/test-planning.md "$B"
bash scripts/check-repo.sh
git add agent-qa/roles/ agent-qa/commands/generate-test-strategy/ agent-qa/commands/generate-test-plan/ agent-qa/commands/generate-test-charter/ scripts/check-repo.sh
git commit -m "refactor: extract test planning role"
```

---

### Task 3: `risk-analysis`

**Files:**
- Create: `agent-qa/roles/risk-analysis.md`
- Modify: `agent-qa/commands/generate-risk-register/3-identify-and-analyze-risks.md` (238 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness. Cross-references `@agent-qa/roles/test-planning.md` from Task 2 where planning deliverables carry a risk section.
- Produces: `agent-qa/roles/risk-analysis.md` with `## Identification`, `## Categorisation`, `## Scoring`, `## Mitigation`, `## Contingency`, `## Ownership`, `## Prioritisation`.

**Move verbatim:** phase 3 Steps 1-8 — Identify Risks from All Sources, Combine and Deduplicate,
Categorize Risks, Score Risks, Generate Mitigation Strategies, Generate Contingency Plans, Suggest
Ownership, Prioritize Risks. The worked examples (`Risk R-001: API Integration Failures` and
`Risk R-002: Unclear Acceptance Criteria`) move with their steps — they are craft, not formatting.

**Replacement step:**

```markdown
### Step 1: Identify and Analyze Risks

Apply `@agent-qa/roles/risk-analysis.md` to the requirements and deliverables loaded in Phase 2.
Supply: the requirement set, any test cases, strategy or charter in the selected output folder, and
the commit analysis if one exists.

The role owns identification, scoring, mitigation and prioritisation. This phase owns what is
supplied to it and where the register is written.
```

- [ ] **Step 1: Add `risk-analysis` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving Steps 1-8 verbatim**
- [ ] **Step 4: Replace with the reference step; renumber the phase's remaining steps**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-risk-register agent-qa/roles/risk-analysis.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/risk-analysis.md agent-qa/commands/generate-risk-register/ scripts/check-repo.sh
git commit -m "refactor: extract risk analysis role"
```

---

### Task 4: `release-reporting` — release notes and traceability

Two commands share the traceability-matrix craft. This task is where that duplication is removed,
and it is also where `generate-test-cases` phase 4's matrix step is redirected.

**Files:**
- Create: `agent-qa/roles/release-reporting.md`
- Modify: `agent-qa/commands/generate-release-notes/3-generate-release-note-content.md` (239 lines)
- Modify: `agent-qa/commands/generate-release-notes/4-generate-traceability-matrix.md` (200 lines)
- Modify: `agent-qa/commands/generate-traceability-report/2-build-traceability-matrix.md` (88 lines)
- Modify: `agent-qa/commands/generate-test-cases/4-generate-test-case-files.md` — Step 6 only
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/release-reporting.md` with `## Release Note Content` and `## Traceability Matrix`. The second is referenced by three commands, so its section name is an interface.

**Move verbatim:**

| Source | Destination |
|---|---|
| release-notes phase 3 Steps 1-8 (Executive Summary through Exclude Out-of-Scope Content) | `## Release Note Content` |
| release-notes phase 4 Steps 1-6 (the three link derivations, full RTM, artifact links, markdown formatting) | `## Traceability Matrix` |
| traceability-report phase 2 Steps 2-7 (mapping test cases, Gherkin, Playwright and other deliverables; coverage matrix; gap identification) | merge into `## Traceability Matrix` — move only material not already carried by the release-notes steps, and note any wording differences in the report rather than silently choosing one |

Leave traceability-report phase 2 Step 1 (Extract Requirement Keys) in place; it is input gathering.

**Replacement step for `generate-test-cases` phase 4 Step 6:**

```markdown
### Step 6: Create Traceability Matrix

Build the matrix using `@agent-qa/roles/release-reporting.md`, section `## Traceability Matrix`,
scoped to the requirements and test cases generated in this run.
```

- [ ] **Step 1: Add `release-reporting` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the sections above, verbatim**
- [ ] **Step 4: Replace each removed block; renumber remaining steps in all three phase files**
- [ ] **Step 5: Verify and commit**

```bash
B=$(cat /tmp/task-base.txt)
bash scripts/check-extraction.sh agent-qa/commands/generate-release-notes        agent-qa/roles/release-reporting.md "$B"
bash scripts/check-extraction.sh agent-qa/commands/generate-traceability-report  agent-qa/roles/release-reporting.md "$B"
bash scripts/check-extraction.sh agent-qa/commands/generate-test-cases           agent-qa/roles/release-reporting.md "$B"
bash scripts/check-repo.sh
git add agent-qa/roles/release-reporting.md agent-qa/commands/generate-release-notes/ agent-qa/commands/generate-traceability-report/ agent-qa/commands/generate-test-cases/ scripts/check-repo.sh
git commit -m "refactor: extract release reporting role"
```

---

### Task 5: `requirements-analysis`

**Files:**
- Create: `agent-qa/roles/requirements-analysis.md`
- Modify: `agent-qa/commands/analyze-requirements/5-extract-and-structure-requirements.md` (57 lines)
- Modify: `agent-qa/commands/analyze-requirements/6-perform-quality-analysis.md` (45 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/requirements-analysis.md` with `## Extraction`, `## Structuring`, `## Quality Analysis`.

**Move verbatim:** phase 5 Steps 2-3 (Extract Acceptance Criteria, Structure Requirements) and
phase 6 Steps 1-4 (Completeness, Completeness Score, Quality Scoring, Recommendations). Leave
phase 5 Step 1 (Extract All Ticket Fields) and Step 4 (Store in Memory) — both are mechanics.

**Replacement steps:**

```markdown
### Step 2: Extract and Structure the Requirements

Apply `@agent-qa/roles/requirements-analysis.md`, sections `## Extraction` and `## Structuring`, to
the ticket fields gathered in Step 1.
```

```markdown
### Step 1: Perform Quality Analysis

Apply `@agent-qa/roles/requirements-analysis.md`, section `## Quality Analysis`, to the structured
requirements from Phase 5.
```

- [ ] **Step 1: Add `requirements-analysis` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with the reference steps; renumber both phase files**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/analyze-requirements agent-qa/roles/requirements-analysis.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/requirements-analysis.md agent-qa/commands/analyze-requirements/ scripts/check-repo.sh
git commit -m "refactor: extract requirements analysis role"
```

---

### Task 6: `code-change-analysis`

**Files:**
- Create: `agent-qa/roles/code-change-analysis.md`
- Modify: `agent-qa/commands/analyze-commits/5-analyze-code-changes.md` (161 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/code-change-analysis.md` with `## Interpreting a Diff`, `## Per-File Summaries`, `## Per-Commit Summaries`, `## Grouping by Ticket`.

**Move verbatim:** phase 5 Steps 1, 2, 3 and 6 (Analyze Code Changes, Per-File Summary, Overall
Change Summary, Group Analysis by Jira Ticket). Leave Step 4 (Store Analysis Results) and Step 5
(Format Code Diff Snippets for Markdown) — storage is mechanics, and diff formatting belongs with
output formatting, not craft.

**Replacement step:**

```markdown
### Step 1: Analyze the Code Changes

Apply `@agent-qa/roles/code-change-analysis.md` to the diffs extracted in Phase 4. Supply: the
per-file diffs, the commit and PR/MR metadata, and the ticket correlation from Phase 3.
```

- [ ] **Step 1: Add `code-change-analysis` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving Steps 1, 2, 3 and 6 verbatim**
- [ ] **Step 4: Replace with the reference step; renumber the phase's remaining steps**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/analyze-commits agent-qa/roles/code-change-analysis.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/code-change-analysis.md agent-qa/commands/analyze-commits/ scripts/check-repo.sh
git commit -m "refactor: extract code change analysis role"
```

---

### Task 7: `gherkin-authoring`

**Files:**
- Create: `agent-qa/roles/gherkin-authoring.md`
- Modify: `agent-qa/commands/generate-gherkin/2-map-test-cases-to-scenarios.md` (117 lines)
- Modify: `agent-qa/commands/generate-gherkin/3-generate-feature-files.md` (124 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/gherkin-authoring.md` with `## Step Classification`, `## Scenario Types`, `## Tagging`, `## Authoring Feature Content`.

**Move verbatim:** phase 2 Steps 3-6 (Shared Preconditions, Classify Test Steps, Determine Scenario
Type, Map Priority Tags) and phase 3 Steps 1-2 (Generate Feature Content, Generate Scenarios).
Leave phase 2 Steps 1-2 (template loading, grouping) and phase 3 Steps 3-4 (Format and Indent,
Validate Gherkin Syntax) — formatting and validation are mechanics governed by
`agent-qa/formats/gherkin/`.

**Replacement steps:**

```markdown
### Step 3: Map Test Cases to Scenarios

Apply `@agent-qa/roles/gherkin-authoring.md`, sections `## Step Classification`,
`## Scenario Types` and `## Tagging`, to the test cases grouped in Step 2.
```

```markdown
### Step 1: Generate the Feature Content

Apply `@agent-qa/roles/gherkin-authoring.md`, section `## Authoring Feature Content`, to the
scenario mapping from Phase 2, using the template loaded there.
```

- [ ] **Step 1: Add `gherkin-authoring` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with the reference steps; renumber both phase files**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-gherkin agent-qa/roles/gherkin-authoring.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/gherkin-authoring.md agent-qa/commands/generate-gherkin/ scripts/check-repo.sh
git commit -m "refactor: extract gherkin authoring role"
```

---

### Task 8: `api-test-design`

**Files:**
- Create: `agent-qa/roles/api-test-design.md`
- Modify: `agent-qa/commands/generate-api-tests/2-analyze-api-endpoints.md` (166 lines)
- Modify: `agent-qa/commands/generate-api-tests/3-generate-api-test-specs.md` (190 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/api-test-design.md` with `## Endpoint Analysis`, `## Positive Cases`, `## Negative Cases`, `## Auth Cases`, `## Edge Cases`, `## Error Handling`, `## Prioritisation`.

**Move verbatim:** phase 2 Steps 3-7 (REST extraction, GraphQL extraction, Resource Grouping,
Authentication Patterns, Data Structures) and phase 3 Steps 2-7 (Positive, Negative, Auth, Edge,
Error Handling, Assign Priorities). Leave phase 2 Steps 1-2 (template and requirement loading) and
phase 3 Steps 1 and 8 (Test ID Scheme, Build Test Summary Table) — the ID scheme is governed by
`rules/qa-conventions.md` and the summary table is output formatting.

**Replacement steps:**

```markdown
### Step 3: Analyze the API Surface

Apply `@agent-qa/roles/api-test-design.md`, section `## Endpoint Analysis`, to the requirements
loaded in Step 2, together with `api_test_base_url` from `agent-qa/config.yml`.
```

```markdown
### Step 2: Generate the API Test Specifications

Apply `@agent-qa/roles/api-test-design.md` — sections `## Positive Cases`, `## Negative Cases`,
`## Auth Cases`, `## Edge Cases`, `## Error Handling` and `## Prioritisation` — to the endpoint
analysis from Phase 2, using the ID scheme established in Step 1.
```

- [ ] **Step 1: Add `api-test-design` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with the reference steps; renumber both phase files**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-api-tests agent-qa/roles/api-test-design.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/api-test-design.md agent-qa/commands/generate-api-tests/ scripts/check-repo.sh
git commit -m "refactor: extract api test design role"
```

---

### Task 9: `accessibility-mapping`

The largest single-command extraction: 397 lines across two phases, nearly all of it craft.

**Files:**
- Create: `agent-qa/roles/accessibility-mapping.md`
- Modify: `agent-qa/commands/generate-accessibility-tests/2-analyze-accessibility-requirements.md` (162 lines)
- Modify: `agent-qa/commands/generate-accessibility-tests/3-generate-accessibility-test-cases.md` (235 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/accessibility-mapping.md` with `## Cataloguing UI Elements`, `## WCAG Success Criterion Mapping`, `## Keyboard Navigation`, `## Screen Reader`, `## Colour and Contrast`, `## Forms`, `## Images`, `## Dynamic Content`, `## Responsive Design`, `## Classification and Validation`.

**Move verbatim:** phase 2 Steps 2-5 (Catalog UI Elements, Interaction Patterns, Content Types, Map
to WCAG 2.1 AA) and phase 3 Steps 2-10 (the seven test-category generators, then Assign Test IDs /
Priority / Test Method, then Quality Validation). Leave phase 2 Steps 1, 6 and 7 (page extraction,
template loading, storage) and phase 3 Step 1 (language detection, governed by
`rules/language-handling.md`).

**Size rule:** this role will approach the 250-line ceiling. If it exceeds it, split into
`accessibility-mapping.md` (cataloguing plus WCAG criterion mapping) and
`accessibility-test-design.md` (the seven category generators plus classification). Record the
decision and line counts in the task report.

**Replacement steps:**

```markdown
### Step 2: Catalogue Elements and Map to WCAG

Apply `@agent-qa/roles/accessibility-mapping.md`, sections `## Cataloguing UI Elements` and
`## WCAG Success Criterion Mapping`, to the pages extracted in Step 1.
```

```markdown
### Step 2: Generate the Accessibility Test Cases

Apply `@agent-qa/roles/accessibility-mapping.md` — its per-category sections and
`## Classification and Validation` — to the element catalogue and criterion mapping from Phase 2,
in the language detected in Step 1.
```

- [ ] **Step 1: Add `accessibility-mapping` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with the reference steps; renumber both phase files**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-accessibility-tests agent-qa/roles/accessibility-mapping.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/ agent-qa/commands/generate-accessibility-tests/ scripts/check-repo.sh
git commit -m "refactor: extract accessibility mapping role"
```

---

### Task 10: `test-data-design`

**Files:**
- Create: `agent-qa/roles/test-data-design.md`
- Modify: `agent-qa/commands/generate-test-data/2-analyze-data-requirements.md` (73 lines)
- Modify: `agent-qa/commands/generate-test-data/3-generate-data-sets.md` (130 lines)
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/test-data-design.md` with `## Identifying Entities`, `## Data Categories`, `## Valid Data`, `## Invalid Data`, `## Boundary Data`, `## Null and Empty Data`, `## Security Data`.

**Move verbatim:** phase 2 Steps 3-4 (Identify Data Entities, Identify Data Categories) and phase 3
Steps 1-5 (Valid, Invalid, Boundary, Null/Empty, Security data sets). Leave phase 2 Steps 1, 2 and
5 (reading requirements, reading test cases, reading config) and phase 3 Step 6 (Assign Data Set
IDs, governed by `rules/qa-conventions.md`).

**Replacement steps:**

```markdown
### Step 3: Identify Data Entities and Categories

Apply `@agent-qa/roles/test-data-design.md`, sections `## Identifying Entities` and
`## Data Categories`, to the requirements and test cases read in Steps 1 and 2.
```

```markdown
### Step 1: Generate the Data Sets

Apply `@agent-qa/roles/test-data-design.md` — sections `## Valid Data`, `## Invalid Data`,
`## Boundary Data`, `## Null and Empty Data` and, when `test_types` includes `security`,
`## Security Data` — to the entities identified in Phase 2.
```

- [ ] **Step 1: Add `test-data-design` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with the reference steps; renumber both phase files**
- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-test-data agent-qa/roles/test-data-design.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh
git add agent-qa/roles/test-data-design.md agent-qa/commands/generate-test-data/ scripts/check-repo.sh
git commit -m "refactor: extract test data design role"
```

---

### Task 11: `playwright-authoring`

Last, deliberately. `generate-playwright-tests` went through a full review cycle in sub-project 1
and carries safety-relevant instructions — the write gate, the no-stop prohibition, conditional
TODO emission — that must survive untouched.

**Files:**
- Create: `agent-qa/roles/playwright-authoring.md`
- Modify: `agent-qa/commands/generate-playwright-tests/3-generate-page-objects.md` (166 lines)
- Modify: `agent-qa/commands/generate-playwright-tests/4-generate-test-specs.md`
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `agent-qa/roles/playwright-authoring.md` with `## Page Object Design`, `## Locator Properties`, `## Navigation Methods`, `## Action Methods`, `## Spec Structure`, `## Assertions`.

**Move verbatim:** phase 3 Steps 2-5 (Generate Page Object Classes, Define Locator Properties,
Generate Navigation Methods, Generate Action Methods) and, from phase 4, the spec-authoring and
assertion craft in Steps 2-3 (Map Test Steps to Playwright Code, Handle Data-Driven Tests).

**Do NOT move, under any circumstances** — these are safety instructions, not craft, and the
harness asserts several of them:
- phase 3 Step 1 (Read the Framework Profile Layout) and its no-stop prohibition
- phase 3 Step 6 (conditional TODO emission) and Step 7 (Write Page Object Files)
- phase 4's write gate, its deny-list, its host-repository placement step, and its Constraints block

Locator *strategy* already lives in `rules/automation-conventions.md` — this role covers how page
objects and specs are shaped, not which locator to prefer. Where phase text restates the ladder,
reference the rule rather than copying it into the role.

- [ ] **Step 1: Add `playwright-authoring` to `check_roles_wired`, run harness, confirm it fails**
- [ ] **Step 2: `git rev-parse HEAD > /tmp/task-base.txt`**
- [ ] **Step 3: Create the role by moving the listed steps verbatim**
- [ ] **Step 4: Replace with reference steps; renumber both phase files**
- [ ] **Step 5: Verify, including the sub-project 1 guards, and commit**

```bash
bash scripts/check-extraction.sh agent-qa/commands/generate-playwright-tests agent-qa/roles/playwright-authoring.md "$(cat /tmp/task-base.txt)"
bash scripts/check-repo.sh   # check_write_gate_present and check_inference_path_never_stops must still pass
git add agent-qa/roles/playwright-authoring.md agent-qa/commands/generate-playwright-tests/ scripts/check-repo.sh
git commit -m "refactor: extract playwright authoring role"
```

---

## Task 12: Claude wrappers

**Files:**
- Create: `agent-qa/ide/claude/agents/` — 11 files
- Delete: `agent-qa/agents/` — 11 files
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: all eleven roles plus `rules/automation-conventions.md`.
- Produces: `check_wrappers_defer`, which asserts every wrapper names a role or rule file.

**Wrapper-to-source mapping:**

| Wrapper | Defers to |
|---|---|
| `requirements-analyst.md` | `agent-qa/roles/requirements-analysis.md` |
| `test-case-generator.md` | `agent-qa/roles/test-case-design.md` |
| `gherkin-writer.md` | `agent-qa/roles/gherkin-authoring.md` |
| `playwright-generator.md` | `agent-qa/roles/playwright-authoring.md` |
| `api-test-generator.md` | `agent-qa/roles/api-test-design.md` |
| `accessibility-tester.md` | `agent-qa/roles/accessibility-mapping.md` |
| `confluence-publisher.md` | `agent-qa/formats/confluence/` (no role — it is a format conversion) |
| `ui-explorer.md` | `agent-qa/rules/automation-conventions.md` |
| `playwright-debugger.md` | `agent-qa/rules/automation-conventions.md` |
| `automation-reviewer.md` | `agent-qa/rules/automation-conventions.md` |
| `framework-architect.md` | `agent-qa/rules/automation-conventions.md` |

Each wrapper keeps its existing front matter (`name`, `description`, `tools`, `color`,
`model: inherit`) verbatim from the file being replaced, then a body of this shape:

```markdown
You {one-line role statement, taken from the existing agent's opening line}.

Your craft is defined in `{source path}` — read it and follow it. It is the single source of
truth; nothing in this file overrides it.

Conventions you obey: `agent-qa/rules/qa-conventions.md` and `agent-qa/rules/output-standards.md`.
```

- [ ] **Step 1: Write the failing check**

```bash
check_wrappers_defer() {
    echo "== every Claude agent wrapper defers to a role or rule =="
    local f target
    [[ -d agent-qa/ide/claude/agents ]] || { fail "missing agent-qa/ide/claude/agents/"; return; }
    [[ -d agent-qa/agents ]] && fail "old agent-qa/agents/ still present - wrappers were not moved"
    for f in agent-qa/ide/claude/agents/*.md; do
        target=$(grep -oE 'agent-qa/(roles|rules|formats)/[a-z/-]+(\.md)?' "$f" | head -1)
        if [[ -n "$target" ]]; then
            pass "$(basename "$f") defers to $target"
        else
            fail "$(basename "$f") names no role, rule or format to defer to"
        fi
        (( $(wc -l < "$f") <= 25 )) || fail "$(basename "$f") is not a thin wrapper ($(wc -l < "$f") lines)"
    done
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: `missing agent-qa/ide/claude/agents/`.
- [ ] **Step 3: `git mv agent-qa/agents agent-qa/ide/claude/agents`**
- [ ] **Step 4: Rewrite all eleven as wrappers using the mapping and shape above**
- [ ] **Step 5: Run `bash scripts/check-repo.sh`** — expected exit 0, every wrapper under 25 lines.
- [ ] **Step 6: Commit**

```bash
git add -A agent-qa/agents agent-qa/ide/claude/agents scripts/check-repo.sh
git commit -m "refactor: reduce agents to thin role wrappers"
```

---

## Task 13: Installer, migration and the stale-agent problem

**Files:**
- Modify: `scripts/project-install.sh`, `scripts/project-install.ps1`
- Modify: `scripts/project-update.sh`
- Modify: `scripts/check-repo.sh`

**Interfaces:**
- Consumes: `agent-qa/roles/` and `agent-qa/ide/claude/agents/`.
- Produces: no new interface.

- [ ] **Step 1: Write the failing check**

```bash
check_roles_installed() {
    echo "== installers sync agent-qa/roles/ and the moved agents =="
    grep -q 'agent-qa/roles\|"roles"\|/roles' scripts/project-install.sh \
        && pass "project-install.sh syncs roles" || fail "project-install.sh does not sync agent-qa/roles/"
    grep -q 'agent-qa/roles\|"roles"\|/roles' scripts/project-install.ps1 \
        && pass "project-install.ps1 syncs roles" || fail "project-install.ps1 does not sync agent-qa/roles/"
    grep -q 'agent-qa/roles\|"roles"\|/roles' scripts/project-update.sh \
        && pass "project-update.sh syncs roles" || fail "project-update.sh does not sync agent-qa/roles/"
    grep -q 'ide/claude/agents' scripts/project-install.sh \
        && pass "install reads agents from ide/claude/agents" \
        || fail "project-install.sh still reads agents from the old agent-qa/agents/ path"
    grep -q 'remove_stale_agents\|stale agent' scripts/project-update.sh \
        && pass "update removes superseded agent files" \
        || fail "project-update.sh does not remove the superseded agent files"
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: five failures.

- [ ] **Step 3: Add `roles/` to the synced directories** in all three scripts, following each
script's existing pattern for `rules/` — read the surrounding code before editing and match it.
Do not invent a new sync mechanism.

- [ ] **Step 4: Point the agent install source at the new path** — `agent-qa/ide/claude/agents/`
instead of `agent-qa/agents/`. The destination, `.claude/agents/agent-qa/`, does not change.

- [ ] **Step 5: Add the stale-agent removal to `project-update.sh`**

An update copies files in and never removes files that vanished upstream. A project installed before
this change keeps the eleven old fat agents beside the new thin wrappers, and the old ones win on
specificity — silently restoring the duplication this refactor removes. Remove them by exact name
only; never blanket-delete unrecognised files, because users keep their own agents in that directory.

```bash
# Agents superseded by thin wrappers. Listed by exact name: a user's own
# agents live in this directory too and must never be touched.
remove_stale_agents() {
    local dest="$PROJECT_DIR/.claude/agents/agent-qa"
    [[ -d "$dest" ]] || return 0
    local name
    for name in requirements-analyst test-case-generator gherkin-writer playwright-generator \
                confluence-publisher api-test-generator accessibility-tester \
                ui-explorer playwright-debugger automation-reviewer framework-architect; do
        if [[ -f "$dest/$name.md" ]] && ! grep -q 'single source of truth' "$dest/$name.md"; then
            rm -f "$dest/$name.md"
            print_verbose "Removed superseded agent: $name.md"
        fi
    done
}
```

Call it before the agents are synced. The `grep` guard means a file is removed only when it is the
old fat form — a wrapper already carrying the new marker line is left alone, which makes the
function idempotent and safe to run on an already-migrated project.

- [ ] **Step 6: Mirror the removal in PowerShell** in `scripts/project-install.ps1`, since Windows
updates run through the install script — there is no `project-update.ps1`.

- [ ] **Step 7: Verify**

```bash
bash -n scripts/project-install.sh scripts/project-update.sh
bash scripts/check-repo.sh
```

Then test the removal against a throwaway copy, proving both directions:

```bash
mkdir -p /tmp/stale/.claude/agents/agent-qa && cd /tmp/stale
printf 'You are a test case generator.\nLots of old craft here.\n' > .claude/agents/agent-qa/test-case-generator.md
printf 'Your craft is defined in X - it is the single source of truth.\n' > .claude/agents/agent-qa/gherkin-writer.md
printf 'my own agent\n' > .claude/agents/agent-qa/my-custom-agent.md
# source the function, run it with PROJECT_DIR=/tmp/stale, then:
# expect: test-case-generator.md removed, gherkin-writer.md kept, my-custom-agent.md kept
```

- [ ] **Step 8: Commit**

```bash
git add scripts/
git commit -m "feat: sync roles and drop superseded agents"
```

---

## Task 14: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `USER_GUIDE.md`
- Modify: `scripts/check-repo.sh`

- [ ] **Step 1: Write the failing check**

```bash
check_roles_documented() {
    echo "== documentation describes the roles layer =="
    local n
    n=$(find agent-qa/roles -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    grep -q 'agent-qa/roles/' CLAUDE.md && pass "CLAUDE.md documents roles/" || fail "CLAUDE.md does not document agent-qa/roles/"
    grep -q "$n roles" CLAUDE.md && pass "CLAUDE.md states $n roles" || fail "CLAUDE.md does not state the role count ($n)"
    grep -q 'agent-qa/roles/' USER_GUIDE.md && pass "USER_GUIDE.md documents roles/" || fail "USER_GUIDE.md does not document roles/"
}
```

Register it in `run_checks`.

- [ ] **Step 2: Run to verify it fails** — expected: three failures.

- [ ] **Step 3: Update `CLAUDE.md`**

Add `roles/` to the structure tree with the role count. Add the four-way boundary table from the
spec. Replace the Subagents section: the eleven files are now thin Claude wrappers under
`agent-qa/ide/claude/agents/` that defer to roles, not definitions in their own right — say so
explicitly, and note that the craft is portable because roles are plain paths any tool can read.

- [ ] **Step 4: Update `README.md` and `USER_GUIDE.md`**

`USER_GUIDE.md` line 49 currently describes `.claude/agents/agent-qa/` as "Specialized subagents
(requirements analyst, test case generator, etc.)" — correct it to describe wrappers over
`agent-qa/roles/`, and add a short section explaining that Copilot, Codex and other tools read the
same role files directly by path. `README.md` gains `roles/` in its project-structure section.

- [ ] **Step 5: Verify and commit**

```bash
bash scripts/check-repo.sh
git add CLAUDE.md README.md USER_GUIDE.md scripts/check-repo.sh
git commit -m "docs: document the roles layer"
```

---

## Final verification

Runs here:

- [ ] `bash scripts/check-repo.sh` — all checks, including the five added by this plan
- [ ] `bash -n` on every modified shell script; PowerShell parity confirmed by reading
- [ ] No role over ~250 lines without a documented split decision: `wc -l agent-qa/roles/*.md`
- [ ] Every command that lost craft references a role: `grep -rL '@agent-qa/roles/' agent-qa/commands/*/[0-9]*.md` reviewed for expected absences only
- [ ] The sub-project 1 guards still pass — `check_write_gate_present`, `check_inference_path_never_stops`

Requires a real environment — the acceptance checklist:

- [ ] **The checkpoint (after Task 1, blocking).** `analyze-requirements` then `generate-test-cases`
      against a real Jira ticket, pre- and post-refactor, deliverables compared.
- [ ] One deliverable-generating command diffed end to end per role before the set is trusted
- [ ] One refactored command run from Copilot or Codex, confirming the role file is actually read
      when referenced by path — this is the portability claim under test, and nothing static proves it
- [ ] `project-update.sh` run against a project installed before this change: the eleven old agent
      files are gone, any user-authored agent in that directory is untouched, and a second run
      changes nothing
