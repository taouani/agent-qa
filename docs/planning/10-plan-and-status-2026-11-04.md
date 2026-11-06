# Agent-QA v2: plan and status, 4 Nov 2026

4 Nov 2026 · @Tarek AOUANI

## The plan

The goal is a fully open-source rewrite of Agent-QA as one TypeScript core with two ways in: an MCP server for IDE assistants (Copilot first, then Claude Code and Cursor) and a CLI for CI. Personal data is masked before it reaches any model. The 2.0.0 release covers the full scope and targets 28 Feb 2027.

| Slice | What it delivers | Planned by | Status |
| --- | --- | --- | --- |
| 0 Foundation | Skeleton, CI, config, vault, policy, run store, engine, MCP server, doctor, harness, release pipeline, Copilot spike | 15 Nov | **Done** 2 Nov |
| 1 Requirements to Xray | Jira and Confluence reading, masking, requirements and test-cases workflows, review step, Xray push, CLI run and init, cost report, leak gate, alpha release | 13 Dec (alpha gate) | **Done** 4 Nov: sf-agent-qa@2.0.0-alpha.0 is on npm |
| 2 Playwright scripts | Generate runnable Playwright TypeScript from reviewed test cases, with a Salesforce pack | 10 Jan | Not started |
| 3 Maintain automation | Review, debug, refactor and audit existing Playwright suites; Xray diff on reruns | 24 Jan | Not started |
| 4 Breadth | Claude Code and Cursor hosts, GitLab and Azure DevOps, the remaining feature additions | 14 Feb | Not started |
| 5 Hardening | Kept-rate and runnable-rate targets (95% and 90%), docs, release 2.0.0 | 28 Feb 2027 | Not started |

The slice 1 plan doc is [here](https://claude.ai/artifact/RCcw2dN64ef9jZAtyg6tBJ), and the final plan is [here](https://claude.ai/artifact/KhLP51UivtHtbf9LD87rrk).

## What is done

- **Slice 0** (PRs #5 to #18): every task T1 to T12 is merged. The Copilot spike passed on Opus 5.5 and GPT-6.1 Sol, so Copilot stays the first host.
- **Slice 1** (PRs #19 to #34): tasks S1-1 to S1-15 are merged.
- **Live check fixes** (PRs #35 to #43, all from your runs on SFSC-3123):
  - doctor hints;
  - the /mcp.agent-qa.\<workflow> docs;
  - network and TLS error causes;
  - reruns reuse existing tests;
  - tests are no longer read as requirements;
  - test ids are no longer masked as phone numbers;
  - strict title matching;
  - the Yes / No push prompt;
  - release fixes.
- **Live evidence**:
  - the first push created 21 Xray tests with the right fields and links;
  - the elicitation pop-up works in VS Code;
  - the rerun updated all 21 tests with no duplicates.

## Open items on the built slices

These are facts unless marked as an assumption.

### Needs you

1. **Non-Anthropic model IDs** (OpenAI, Mistral, xAI, Google) in `src/core/config/catalog.ts` came from public listings and are unverified.
2. **Repo visibility.** While it is private, npm provenance is off (`NPM_CONFIG_PROVENANCE: false` in `.github/workflows/release.yml`). Set it back to true when the repo goes public.
3. **npm `latest` tag** still points at the 0.0.0 placeholder, so testers must install `sf-agent-qa@next`. You could move `latest` to the alpha, or leave it until 2.0.0.

### Known limits, slice 1

- **Rerun matching is a title heuristic** (`sameCheck` in `src/workflows/test-cases/workflow.ts`).
  - A heavily reworded title becomes a new test.
  - Long titles that swap two separate parts can still match by mistake, for example "to owner when high priority" vs "to manager when low priority".
  - Before each push you see every update next to its old title, which is the safety net.
- **Tests filtered out of requirements still count** toward the 100-issue `maxIssues` cap.
- **A rare id shape such as `SFSC-3123-001-002`** can still be masked as a phone number.
- **No street-address detector yet.** The type exists in `src/masking/engine/detectors.ts`, but nothing detects addresses.
- **Kept rate isn't measured on real runs yet.** The harness computes it, but it needs reviewed runs. The 95% target is for 2.0.0.
- **Confluence is read-only**, and `restoreOnWrite` defaults to off, so tokens reach Xray unless you turn it on. Both are as planned.
- **Your Windows machine needs `npm run build:tsc`**, because esbuild gets Access denied there, and `node --use-system-ca` because the corporate network re-signs TLS.

### Follow-ups noted in slice 0, not confirmed closed

I'm listing these from my notes and haven't re-checked them in the code (assumption: still open).

- **doctor:**
  - it doesn't check whether the vault is tracked by git, which needs a narrow child\_process exception to the lint rule;
  - .gitignore lookup doesn't walk up from a monorepo subfolder;
  - config errors echo unknown key names.
- **Vault:**
  - the keychain has a race on first use and needs a lock file;
  - keychain lookup errors are shown raw.
- **Run store:**
  - error codes;
  - a missing run.json on resume should say RUN\_NOT\_FOUND.
- **Harness:** misses base64 that starts mid-run.
- **CI runner:** the future CI runner must open data access in `ci` mode.

## Suggested next step

Start slice 2, Playwright script generation, with a detailed plan first, as we did for slices 0 and 1. The slice 0 follow-ups above could be closed in a short clean-up pass before it, or alongside it. That choice is yours.
