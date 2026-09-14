# Agent-QA — Portable Roles Refactor

**Date:** 2026-09-14
**Status:** Approved design, ready for implementation planning
**Scope:** Sub-project 2 of 3
**Branch:** `refactor-existing-agents`

---

## Context

Agent-QA ships eleven agent definitions under `agent-qa/agents/`. Seven predate this work; four
were added by sub-project 1. Investigation before designing found the premise of "refactor the
agents" to be wrong in an instructive way:

**No command dispatches any agent.** Not one of the eleven is referenced by any phase file, any
rule, or any other agent. They install to `.claude/agents/agent-qa/`, where Claude Code can
auto-select one by description, but nothing in Agent-QA delegates to them deliberately.

Meanwhile the instructions that actually run live in the phase files — 100 files, 10,877 lines.
The agents restate thinner versions of the same knowledge with nothing keeping the two in sync.
`generate-playwright-tests` is 729 lines across six phase files; its agent covers similar ground in
80. Whichever the runtime agent reads, the other is dead weight that will drift.

There is a second problem underneath. `.claude/agents/` is a Claude Code concept. A GitHub Copilot
or Codex user never sees those files at all, so the specialist knowledge they contain is both
undispatched and invisible to most of the project's stated targets.

**Intended outcome:** one source of truth for specialist craft, reachable by every supported tool,
with phase files reduced to orchestration. Claude Code keeps its auto-discovery affordance through
thin wrappers that defer to the same files everyone else reads.

### Decisions taken during design

| Decision | Choice |
|---|---|
| Agent role | Portable role files; Claude gets thin wrappers, not definitions |
| Craft boundary | Roles own the craft; phases shrink to orchestration |
| Scope | All 24 commands, for one consistent architecture |
| Role derivation | From craft clusters found in the phases, not from the legacy agent list |
| Codex | Designed for — roles are path-reachable; installer support deferred |
| Sequencing | One-command checkpoint before the rest proceeds |

### Rejected, and why

**Wiring agents in as real subagent delegates.** The strongest option on its merits: context
isolation, genuine division of labour, phases get shorter. Rejected because subagent dispatch is a
Claude Code feature. Cursor consumes `.claude/commands/`, and VS Code and Copilot reference
`agent-qa/commands/...` markdown directly — a phase instructing "dispatch the `test-case-generator`
subagent" is an instruction those tools cannot execute. It would make the generation phases
Claude-Code-only, or force an inline fallback in every dispatching step, reinstating the exact
duplication the change exists to remove. Claude Code is explicitly not the primary target.

### Out of scope

Codex installer support (`AGENTS.md` and any `~/.codex` convention) is deferred; roles are
path-reachable, so Codex works today through the existing "Other IDEs: reference the markdown
directly" path. Sub-project 3 — automated upload of test cases and Gherkin features to Jira Xray —
is untouched and gets its own design cycle.

---

## Architecture

### Four-way boundary

The repository half-observes this split today. The refactor makes it explicit.

| Layer | Holds | Loaded by |
|---|---|---|
| `rules/` | Conventions everything obeys — IDs, priorities, output paths, language policy | every command |
| `roles/` **(new)** | Craft a specialist applies — how to design a test case, score a risk, map a WCAG criterion | the phases that need it |
| `formats/` | Output templates — Confluence XHTML, Xray JSON, Playwright scaffolds | the phases that emit them |
| `commands/` | Orchestration — select inputs, enforce gates, write files, run hooks | the user |

### The ten roles

Derived from craft clusters measured across the phase corpus, not from the existing agent list.

```
agent-qa/roles/
├── requirements-analysis.md    analyze-requirements
├── code-change-analysis.md     analyze-commits
├── test-case-design.md         generate-test-cases
├── test-planning.md            generate-test-strategy + generate-test-plan + generate-test-charter
├── risk-analysis.md            generate-risk-register, and the risk sections inside planning
├── test-data-design.md         generate-test-data
├── gherkin-authoring.md        generate-gherkin
├── api-test-design.md          generate-api-tests
├── accessibility-mapping.md    generate-accessibility-tests
└── release-reporting.md        generate-release-notes + generate-traceability-report
```

The five live-automation commands (`explore-ui`, `debug-tests`, `review-automation-code`,
`audit-framework`, `refactor-framework`) need no new role: `rules/automation-conventions.md`
already holds their craft and six commands already reference it without duplicating it. That file
is the precedent this entire design copies.

The utility commands (`health-check`, `validate-outputs`, `run-pipeline`, `regenerate`) are already
orchestration-only. `publish-to-confluence` draws on `formats/confluence/`, not a role.

### Role file anatomy

One shape, mirroring `automation-conventions.md`:

```markdown
# {Role Name}

One paragraph: what this specialist does and what they optimise for.

## When This Applies
Which phases load this role, and what they hand it.

## {Craft sections}
The heuristics, tables and decision procedures — moved verbatim from the phases.

## What This Role Never Does
The prohibitions, stated positively so they survive editing.
```

A role that passes roughly 250 lines is split by deliverable rather than allowed to sprawl.

### Claude wrappers, and where agents live

`agent-qa/agents/` sits at top level today as though it were IDE-neutral. It is not — `.claude/`
is a Claude Code concept. The eleven files move to `agent-qa/ide/claude/agents/`, beside the
slash-command wrappers already in `ide/claude/`, and each becomes a wrapper of about a dozen lines:

```markdown
---
name: test-case-generator
description: Designs positive, negative and edge test cases from analyzed requirements.
tools: Read, Write
color: green
model: inherit
---

You design test cases from analyzed requirements.

Your craft is defined in `agent-qa/roles/test-case-design.md` — read it and follow it. It is the
single source of truth; nothing in this file overrides it.

Conventions you obey: `agent-qa/rules/qa-conventions.md` and `agent-qa/rules/output-standards.md`.
```

The install destination is unchanged: `.claude/agents/agent-qa/`. The four live-automation wrappers
defer to `rules/automation-conventions.md` rather than a new role. Wrappers are checked in, not
generated, matching how `ide/claude/commands/` already works.

---

## Refactor mechanics

### The extraction test

Applied line by line to each phase file.

**Craft** — another command doing similar work would need this sentence. "Derive one negative case
per validation rule." "Score likelihood against impact." "Map each interactive element to its WCAG
success criterion."

**Orchestration** — it names a path, a gate, an order, or a file. "Write to
`{selected_folder}/test-strategy/`." "Ask the user to confirm before proceeding." "Follow
`@agent-qa/commands/common/execute-post-hooks.md`."

Anything genuinely ambiguous stays in the phase. We under-move deliberately: a phase that still
says too much is merely verbose, while a role missing a step is broken.

### Move, not rewrite

Craft text moves **verbatim** into its role. No rewording during the move, no incidental
improvements — those are a separate change, separately reviewed. This is what makes the refactor
mechanically verifiable rather than a matter of judgement, and it is what lets the harness check it.

### What a shrunk phase looks like

`generate-test-strategy/3-generate-test-strategy-content.md` is 365 lines today. After:

```markdown
### Step 2: Generate the Strategy Content

Apply `@agent-qa/roles/test-planning.md` to the loaded requirements, using its "Test Strategy"
section. Supply: the requirement set, the detected language, the configured `test_types`, and any
existing charter or risk register from the selected folder.

The role owns how the strategy is shaped. This phase owns only what goes in, where the result
lands, and the order of the remaining steps.
```

Selection, confirmation, file writing, index generation and hooks stay exactly where they are.

---

## The checkpoint

`generate-test-cases` is refactored **first and alone**. It is the root of the deliverable chain —
Gherkin, Playwright, API and accessibility tests all derive from its output — so it is the command
whose regression would travel furthest.

Work then STOPS. The engineer runs `analyze-requirements` and `generate-test-cases` against a real
Jira ticket, with the same ticket and configuration as a pre-refactor run, and compares the
deliverables. Only once that comparison is acceptable do the remaining thirteen commands proceed.

This converts the design's largest risk from an argument into a measurement, at the cost of one
round trip.

### Order after the checkpoint

Heaviest craft first, so the pattern proves or breaks early:

1. `test-planning` — three commands, 1,014 lines between them
2. `risk-analysis`, `release-reporting`
3. `requirements-analysis`, `code-change-analysis`
4. `gherkin-authoring`, `api-test-design`, `accessibility-mapping`, `test-data-design`
5. `generate-playwright-tests` last — it has just been through a full review cycle and should not
   be disturbed while the rest is in flux

---

## Migration

`agent-qa/roles/` becomes a synced directory alongside `rules/` and `formats/` in
`project-install.sh`, `project-install.ps1` and `project-update.sh`. Bash and PowerShell parity
applies.

**The stale-agent problem.** Update copies files in and never removes files that vanished upstream.
A user who updates would keep the eleven old fat agents in `.claude/agents/agent-qa/` alongside the
new thin wrappers, and the old ones would win on specificity — silently restoring the duplication
this change removes. `project-update.sh` therefore needs an explicit removal step for the eleven
known old filenames. It must not blanket-delete unrecognised files: a user's own agents live in
that directory too.

---

## Harness additions

Each must be able to fail, verified by injecting the failure it guards:

- every `@agent-qa/roles/*.md` reference in a phase resolves to a real file
- every role file is referenced by at least one phase — an orphan role is dead weight that drifts
- every wrapper in `ide/claude/agents/` names the role or rule file it defers to
- **migration coverage:** for each refactored command, every line removed from a phase appears in
  the role file it moved to

---

## Risks

**Silent thinning — the one that matters.** Sub-project 1 was almost entirely additive. This
rewrites instructions that currently work, across the fourteen generate- and analyze- commands users run daily, and the failure
mode is quiet: a command that still runs, still writes files, but produces a thinner deliverable
because a heuristic was left behind. The line-coverage check proves text landed somewhere; it
cannot prove the phase still reaches it at the right moment. Only the checkpoint comparison can.

**Role bloat.** `test-planning` serves three commands with different outputs. If it becomes a
600-line file each consumer uses a third of, the change has made things worse. The 250-line ceiling
and split-by-deliverable rule exist for this.

**The portability claim becomes load-bearing.** Once craft lives in `roles/`, a tool that does not
load them produces materially worse output. Phase references must be explicit `@`-paths, exactly as
`rules/` are referenced today, so any tool following the instruction reads the file.

---

## Verification

Runs here:

1. `bash scripts/check-repo.sh` — existing 18 checks plus the four above
2. `bash -n` on every modified shell script; PowerShell parity by reading
3. Role size ceiling: no role over ~250 lines without a documented reason
4. Line-coverage: every line removed from a refactored phase present in its role

Requires a real environment, and forms the acceptance checklist:

5. **The checkpoint.** `analyze-requirements` then `generate-test-cases` against a real Jira ticket,
   pre- and post-refactor, deliverables compared. Blocks the remaining thirteen commands.
6. One deliverable-generating command diffed end to end per role before the set is trusted
7. A Copilot or Codex run of one refactored command, confirming the role file is actually read when
   referenced by path — this is the portability claim under test
8. `project-update.sh` against a project installed before this change, confirming the eleven old
   agent files are removed and the user's own agents are untouched

Item 5 is the gate. Item 8 is the one most likely to be skipped and most likely to bite.
