# QA documents

The `document` workflow writes a QA document from what earlier runs know. A document type is a schema, a prompt and a view on one shared engine.

| Type | Written from | What Agent-QA checks or computes itself |
|---|---|---|
| `test-strategy` | requirements; reviewed cases optional | each level and type once; functional and regression always; issue keys exist |
| `test-plan` | requirements; reviewed cases optional | every issue once with its risk; the coverage table from the cases |
| `test-charter` | requirements; reviewed cases optional | the sessions explore every issue; the total time |
| `risk-register` | requirements; reviewed cases optional | every issue with a quality score below 60 is in a risk; numbers R-001 in the order written; score (probability × impact) and level; risks ranked |
| `test-data` | requirements; reviewed cases optional | a valid and an invalid, boundary or empty set per issue with criteria; a set's cases are of its issue; numbers TD-001 in the order written; values shown exactly |
| `traceability` | reviewed cases (required); a test run optional | the matrix of issue, criterion, cases and result (passed only when every case passed); the model must name every gap: no case, or a case failed, flaky, skipped or not run |
| `release-notes` | requirements; reviewed cases and a test run optional | every issue once; the fix version; the testing figures |

A test in a test run belongs to a case when its title or one of its tags names the case's whole id (`TC-ABC-1-001`). A traceability report made with a test run of other tests shows every case as not run.

## Run it

```bash
agent-qa run document --input '{"type":"test-plan","key":"ABC-123"}'
agent-qa run document --input '{"type":"test-plan","requirementsRun":"<run id>"}'
agent-qa run document --input '{"type":"test-plan","testCasesRun":"<run id>"}'
agent-qa run document --input '{"type":"traceability","testCasesRun":"<run id>","testRunRun":"<run-tests run id>"}'
agent-qa run document --input '{"type":"release-notes","jql":"project = ABC AND fixVersion = 2026.11"}'
agent-qa run document --type test-plan --key ABC-123 --publish confluence
```

`--type` and `--publish` set the `type` and `publish` inputs of the document workflow.

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
| `publish` | only with `publish: confluence`: asks whether to publish the reviewed document to Confluence, then creates or updates the page (`confluence-page@1`) |

The result is `document@1`, with `document.md` beside it. Its texts hold masked values such as `<PERSON_1>`, from the requirements run's vault. Counts, scores, matrices and versions are computed by Agent-QA, not written by the model.

With `--yes`, nobody reviews the document; `document.md` then says it wasn't reviewed.

Test results (`testRunRun`, for traceability and release notes) are masked with their own run's vault. Their masked values are shown to the model as `[masked]`, so they never reach the document. The technical section of release notes, from pull requests, comes in a later alpha.

## Publish to Confluence

Add the space, and optionally the parent page, to `agent-qa.yaml`:

```yaml
atlassian:
  site: https://acme.atlassian.net
  email: ${env:ATLASSIAN_EMAIL}
  token: ${env:ATLASSIAN_TOKEN}
  confluence:
    spaceKey: QA
    parentPageId: "123456"   # optional: without it the page goes at the top of the space
```

Then run with `publish: confluence` (or `--publish confluence`). After the review, the `publish` step asks first:

- The page title is the document's heading, for example `Test plan: ABC-123`. A document of a JQL filter is titled with the type and a short hash of the filter, for example `Test plan: JQL #3f9a0c12de`: each filter gets its own page, and the filter text, which may name people, never reaches the title. Titles are cut to Confluence's 255 characters. The body is the document without that heading, in Confluence storage format: headings, paragraphs, lists, tables, quotes, bold and code. Everything else stays plain text, control characters XML doesn't allow are dropped, so nothing the model wrote becomes markup or a macro.
- No page with that title in the space: a new page is created under `parentPageId` and labelled `agent-qa`.
- Agent-QA's page (it has the `agent-qa` label) has the title: it is updated to the next version, with the run id as the version message. Running the same document again updates the same page.
- Another page has the title and no `agent-qa` label: nothing is written. Rename or move that page, or add the label to let Agent-QA update it.

The page holds masked values such as `<PERSON_1>` unless `masking.restoreOnWrite: true`, which puts the real values back from the requirements run's vault. If that vault expired, publishing stops rather than send the tokens.

The write goes through the policy (`policy.writes.confluence`) and the audit log. `--yes` declines the publish step: accept it with `--accept publish`. In CI, `ask` can't be answered, so set `policy.writes.confluence: allow` there; with `deny`, `publish: confluence` is refused when the run starts.

The run records `confluence-page@1`: the space, the page id, its version, whether it was created or updated, and a link by page id (`/wiki/pages/viewpage.action?pageId=...`), which never holds the title.
