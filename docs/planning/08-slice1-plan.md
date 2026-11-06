# Agent-QA v2: slice 1 plan

Nov 2, 2026 · @Tarek AOUANI

## Summary

Slice 1 turns a real Jira ticket into masked requirements and test cases, then pushes them to Xray, from Copilot or from the CLI. Its alpha gate is on 13 December 2026.

- **Gate criteria (from the final plan):** your two users switch from v1, the harness measures the kept rate, no seeded personal data reaches a model, and an alpha is published on npm `next`.
- **Estimate:** 169–247 h across 15 tasks. That is above the final plan's 140–160 h, even with the 21–37 h of extras added (161–197 h). The plan was low on masking, which needs field-aware rules, detectors in 9 languages and a report, and on Xray, which needs auth, bulk import, links and idempotent reruns.
- **Hours available:** slice 0 finished 13 days early. If slice 1 starts on 3 November instead of 16 November, there are about 6 weeks, or about 240 h at 40 h a week. The estimate fits that, though the top of it doesn't leave much margin. If slice 1 starts on 16 November, only about 160 h are left, and something has to move (see Risks).
- **Facts:** this is built on master at `e940c61`, with slice 0's engine, MCP server, run store, policy, vault, doctor and harness. Contract 3, the MCP step protocol, is unchanged, and the spike passed on it.
- **Assumptions:** Confluence stays read-only in slice 1, as a source of linked pages. Xray tests are Manual tests with steps, linked to their requirement issue. Masked tokens such as `<PERSON_1>` reach Xray as tokens, because `restoreOnWrite` defaults to false.

**Approved 2 Nov 2026:** Tarek said "go" to all five recommendations. He added that the input can be a single ticket or a JQL filter, and that a ticket's linked issues and child issues (epic to stories, story to tasks and sub-tasks) must be followed. S1-2 and `requirements@1` now cover both.

## Decisions for Tarek

There are five decisions, most important first. Each has a recommendation, and I'll build on the recommended options unless you pick otherwise.

| # | Decision | Options | Recommended |
| --- | --- | --- | --- |
| 1 | When slice 1 starts | (a) Now, on 3 Nov, using the 13 days gained. (b) As planned, on 16 Nov. | (a). It gives about 240 h against an estimate of 169–247 h. With (b), something on the defer list moves out. |
| 2 | How the harness measures the kept rate | (a) A review step before the Xray push, where the reviewer marks each case kept, edited or dropped, saved in the run. (b) Read the cases back from Xray later and diff them, which needs Xray reads (slice 3). (c) Both. | (a) now, and (b) in slice 3. Only (a) gives a number by the 13 Dec gate. |
| 3 | Phone and national-id detection | (a) `libphonenumber-js` (about 150 kB) plus our own checksums for national ids. (b) Only our own patterns. | (a). Phone formats across the 9 languages' countries are too varied to hand-write safely, and a miss leaks data. |
| 4 | Chinese name detection (15–25 h) | (a) In slice 1. (b) Moved to slice 4. | (a) if decision 1 is (a), otherwise (b). |
| 5 | Xray reruns | (a) Update the existing test, found by a label such as `agent-qa:TC-ABC-12-001`. (b) Always create new tests. | (a). Reruns are common, and (b) leaves duplicates for testers to clean up. |

## Tasks

There are 15 tasks totalling 169–247 h. The weeks assume decision 1 is (a), starting 3 Nov. Each task gets the same treatment as in slice 0: a PR, a sub-agent review, green CI, then a squash merge.

| Task | What it delivers | Module | Hours | Week |
| --- | --- | --- | --- | --- |
| S1-1 Connector core | HTTP client with timeouts, retries, 429 `Retry-After`, proxy and `NODE_EXTRA_CA_CERTS` support. Resolves secrets through `${env:}` and `${keychain:}`, and errors never echo secrets | connectors | 8–10 | 1 |
| S1-2 Jira Cloud client | `Input is one issue key or a JQL filter. From each issue it follows the hierarchy down (epic to stories, story to tasks and sub-tasks) and its linked issues one level out, with a depth and count cap. It also handles JQL search (/search/jql with nextPageToken)`, Confluence remote links, ADF to text, and discovery of the acceptance-criteria field | connectors | 14–18 | 1 |
| S1-3 Confluence Cloud client | Read-only: linked pages through the v2 API, storage format to text, page version for `sourceHash` | connectors | 8–10 | 2 |
| S1-4 Masking engine | Field-aware rules (`masking.fields`), pattern detectors for email, phone, IBAN with checksum, card with Luhn, IP and national ids, and names from Jira people fields propagated into free text. Tokens like `<PERSON_1>` stay stable within a run through the vault | masking | 24–30 | 1–2 |
| S1-5 Names in 9 languages | Name detection for EN, FR, AR, ES, DE, PT, NL and IT, plus a Chinese detector (no spaces or capitals) | masking | 15–25 | 2 |
| S1-6 Masked data service and report | The only caller of connectors. It returns masked `Requirement` entities with `sourceHash`, caches them in the run folder, and writes a `masking-report@1` (counts by detector and field, never values) | data | 14–18 | 2 |
| S1-7 API model driver | Vercel AI SDK driver for the 7 allowlisted providers, with structured output against the step's zod schema, a retry on validation errors, token usage, and the model catalog (latest 5 per provider) | llm | 12–16 | 3 |
| S1-8 `requirements` workflow | Fetch (core, no model) → analyze (structured requirements, quality score, open questions) → `requirements@1` artifact rendered to `.md` | workflows | 12–16 | 3 |
| S1-9 `test-cases` workflow | From `requirements@1`: generate `TC-{KEY}-{NNN}` cases with P1–P4, steps and trace to each acceptance criterion. Core checks coverage and unique ids, then a review step (decision 2) and confirm → `test-cases@1` | workflows | 12–16 | 3 |
| S1-10 Xray Cloud push | Client-credential auth, bulk import with job polling, "tests" link to the requirement, rerun by label (decision 5), all through `Policy.guard` | connectors, workflows | 14–18 | 4 |
| S1-11 CLI `run` and `init` | `agent-qa run <workflow>` with the API driver, non-interactive confirm rules for CI, exit codes and progress. `agent-qa init` writes `agent-qa.yaml`, `.vscode/mcp.json` (`AGENT_QA_RUNS_DIR` in `env`, no `cwd`) and the `.gitignore` lines | cli | 12–16 | 4 |
| S1-12 Cost report | `cost@1` per run: tokens by step and model, times the catalog price. For host-model runs (Copilot), sizes only, since the host's cost is unknown | llm, core | 4–6 | 5 |
| S1-13 Copilot follow-ups | Find out why the MCP prompt doesn't appear as a slash command, and document `#workflow_start` as the fallback | mcp | 4–6 | 5 |
| S1-14 Harness on the real pipeline | Plug in the masked pipeline, seeded Jira fixtures for every field type, a leak gate in CI, and the kept rate from review records | harness | 10–14 | 5 |
| S1-15 Alpha release | README quickstart, v1 migration guide, a changeset, publish `2.0.0-alpha.0` on `next`, then your two users try it | release | 6–8 | 6 |

The order follows the dependencies: connectors and masking first, then the data service, then the workflows and the driver, then Xray and the CLI, then the harness. Week 6 (7–13 Dec) is for the alpha and fixes from your two users.

## New contracts

Slice 1 adds four typed artifacts. Each uses the slice 0 envelope (`schema`, `sourceHash`, `createdAt`, `data`) and is stored in the run folder. I'll treat them as drafts until the workflow PRs land, and flag any change to you.

| Artifact | Key fields | Notes |
| --- | --- | --- |
| `requirements@1` | `input (key or JQL), then per issue: key, type, parent, children[], links[] (type, key), role (root, child or linked), summary`, `description` (masked), `acceptanceCriteria[]` (`id` AC1…, `text`), `linkedPages[]`, `quality` (`score` 0–100, `missing[]`), `openQuestions[]` | `sourceHash` covers the issue's `updated` value plus the linked page versions |
| `test-cases@1` | Per case: `id` `TC-{KEY}-{NNN}`, `title`, `priority` P1–P4, `type` (positive, negative, edge), `preconditions`, `steps[]` (`action`, `expected`), `covers[]` (AC ids) | The core rejects a case with no `covers`, duplicate ids, or an acceptance criterion with no case. 10–30 cases per issue, as in the spike |
| `masking-report@1` | `byDetector` and `byField` counts, `tokens` issued, `unmaskedFields[]` (fields left as is by rule) | Never holds values. The harness reads it |
| `xray-push@1` | Per case: `tcId`, `xrayKey`, `action` (created, updated, skipped), `linkedTo` | Written only after `Policy.guard` approves and the import job finishes |

**Xray mapping:** each case becomes a Manual test. The summary is `[TC-ID] title`, the steps map to Xray steps (action and expected result), and the priority maps to the Jira priority by a table in `agent-qa.yaml`. The labels are `agent-qa` and `agent-qa:TC-ID`, and each test gets a "tests" link to the requirement issue.

## Risks

The biggest risk is a masking miss in free text, because a single leaked name fails the gate. Next is the hours estimate.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Names in free text that no people field mentions | A seeded value reaches a model, and the gate fails | Propagate names from people fields, run the language detectors, use Presidio if configured, and run the harness leak gate in CI on every PR |
| Hours run to the top of 247 h | The 13 Dec gate slips | Track hours per task. If week 4 ends behind, apply the defer list below |
| Jira's ADF and custom fields vary by site | Missed acceptance criteria and weaker test cases | Field discovery plus a mapping override in `agent-qa.yaml`, and `doctor` reports what it found |
| Xray import limits and async jobs | Partial pushes | Batch the imports, poll the jobs, and make `xray-push@1` the record a rerun resumes from |
| Model quality varies (the v1 pain point) | Low kept rate | Core validation and retries, and the kept rate measured per model in the harness |

**If it slips:** in order, move the Chinese detector to slice 4 (15–25 h), then the cost report (4–6 h), then `agent-qa init` (about 4–6 h, and the runbook covers setup by hand). The masking, Xray push and harness gate don't move, because the alpha gate depends on them.
