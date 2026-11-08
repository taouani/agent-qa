# QA documents

The `document` workflow writes a QA document from what earlier runs know. A document type is a schema, a prompt and a view on one shared engine.

| Type | Written from | What Agent-QA checks or computes itself |
|---|---|---|
| `test-strategy` | requirements; reviewed cases optional | each level and type once; functional and regression always; issue keys exist |
| `test-plan` | requirements; reviewed cases optional | every issue once with its risk; the coverage table from the cases |
| `test-charter` | requirements; reviewed cases optional | the sessions explore every issue; the total time |
| `risk-register` | requirements; reviewed cases optional | ids R-001 in order; every issue with a quality score below 60 is in a risk; score (probability × impact) and level; risks ranked |
| `test-data` | requirements; reviewed cases optional | ids TD-001 in order; a valid and an invalid, boundary or empty set per issue with criteria; a set's cases are of its issue |
| `traceability` | reviewed cases (required); a test run optional | the matrix of issue, criterion, cases and result; the model must name every gap it shows |
| `release-notes` | requirements; reviewed cases and a test run optional | every issue once; the fix version; the testing figures |

A test in a test run belongs to a case when its title or one of its tags names the case's id (`TC-ABC-1-001`).

## Run it

```bash
agent-qa run document --input '{"type":"test-plan","key":"ABC-123"}'
agent-qa run document --input '{"type":"test-plan","requirementsRun":"<run id>"}'
agent-qa run document --input '{"type":"test-plan","testCasesRun":"<run id>"}'
agent-qa run document --input '{"type":"traceability","testCasesRun":"<run id>","testRunRun":"<run-tests run id>"}'
agent-qa run document --input '{"type":"release-notes","jql":"project = ABC AND fixVersion = 2026.11"}'
```

Give one of these:

- `key` or `jql` to read Jira and analyze it first, as the requirements workflow does.
- `requirementsRun`: an earlier run's `requirements@1`.
- `testCasesRun`: an earlier run's reviewed cases (`test-cases@1`). Its requirements are used too, since the cases' masked values come from that run.

## A run

| Step | What it does |
|---|---|
| `analyze` | only from a key or JQL: the requirements analysis |
| `draft-{type}` | the model writes the document from a masked context; Agent-QA checks the type's rules (table above), that every issue it names exists, and that every masked value comes from the context. The draft is `document-draft.md`. |
| `review` | you change texts or remove list items by path (`$.objectives.2`). Your words are masked before the run keeps them, and the result is checked again. |

The result is `document@1`, with `document.md` beside it. Its texts hold masked values such as `<PERSON_1>`, from the requirements run's vault. Counts, scores, matrices and versions are computed by Agent-QA, not written by the model.

With `--yes`, nobody reviews the document; `document.md` then says it wasn't reviewed.

Test results (`testRunRun`, for traceability and release notes) are masked with their own run's vault. Their masked values are shown to the model as `[masked]`, so they never reach the document. The technical section of release notes, from pull requests, comes in a later alpha. Publishing to Confluence does too.
