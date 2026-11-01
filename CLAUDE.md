# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Agent-QA v2 is a TypeScript rewrite of Agent-QA, published on npm as `sf-agent-qa` with the CLI command `agent-qa`, under the Apache-2.0 license. v1, a markdown prompt pack, is frozen on the `v1` branch at tag `v1.0.0`. Don't change v1 from `master`.

One core serves two front doors:

- an MCP server (`src/mcp`) for IDE hosts: Copilot (VS Code agent mode) first, then Claude Code and Cursor;
- a CLI pipeline runner (`src/cli`) for CI.

## Commands

```bash
npm run check      # typecheck + lint + test + build; run before every push
npm test           # vitest
npm run lint       # ESLint, including the module boundary rules
```

## Module boundaries (lint-enforced)

| Module | May import |
|---|---|
| `core` | itself only: config, policy, runs, workflow engine |
| `masking` | core |
| `connectors` | core (Jira, Confluence, Xray, git hosts, Salesforce) |
| `data` | core, masking, connectors: the masked data service, and the only caller of connectors |
| `llm` | core |
| `workflows` | core, data |
| `harness` | core, data, masking, llm, workflows |
| `mcp` | core, data, workflows |
| `cli` | core, data, llm, workflows, harness, mcp |

Never relax these rules to make an import work. Route the call through `data` instead.

## Conventions

- ESM, Node 20+, TypeScript strict. Relative imports use the `.js` extension.
- Schemas are zod. Artifacts are typed JSON with a `sourceHash`, stored under `.agent-qa/runs/{UTC date}-{context}-{id}/`.
- Test case IDs are `TC-{REQUIREMENT-KEY}-{NNN}`. Priorities are P1 to P4.
- Secrets never appear in files. Config holds only `${env:NAME}` or `${keychain:NAME}` references.
- Every write outside the run folder goes through the policy layer.
