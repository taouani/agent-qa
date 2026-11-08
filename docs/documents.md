# QA documents

The `document` workflow writes a QA document from what earlier runs know. A document type is a schema, a prompt and a view on one shared engine. The first type is the **test plan**; the others come in later alpha releases.

| Type | Written from |
|---|---|
| `test-plan` | the requirements; the reviewed test cases if you give them |

## Run it

```bash
agent-qa run document --input '{"type":"test-plan","key":"ABC-123"}'
agent-qa run document --input '{"type":"test-plan","requirementsRun":"<run id>"}'
agent-qa run document --input '{"type":"test-plan","testCasesRun":"<run id>"}'
```

Give one of these:

- `key` or `jql` to read Jira and analyze it first, as the requirements workflow does.
- `requirementsRun`: an earlier run's `requirements@1`.
- `testCasesRun`: an earlier run's reviewed cases (`test-cases@1`). Its requirements are used too, since the cases' masked values come from that run.

## A run

| Step | What it does |
|---|---|
| `analyze` | only from a key or JQL: the requirements analysis |
| `draft-test-plan` | the model writes the plan from a masked context; Agent-QA checks that every issue is named once, every named issue exists, and every masked value comes from the context. The draft is `document-draft.md`. |
| `review` | you change texts or remove list items by path (`$.objectives.2`). Your words are masked before the run keeps them, and the result is checked again. |

The result is `document@1`, with `document.md` beside it. Its texts hold masked values such as `<PERSON_1>`, from the requirements run's vault. A test plan made from test cases has a coverage table counted by Agent-QA, not by the model: cases per issue and priority, and the criteria no case covers.

With `--yes`, nobody reviews the document; `document.md` then says it wasn't reviewed.

Test results (`testRunRun`, for the types that use them) are masked with their own run's vault, so their masked values are shown to the model as `[masked]` and never reach the document.
