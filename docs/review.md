# Reviewing test code

The `review` workflow reviews the test files you name, against v1's review checklist and Agent-QA's own code scan. Each finding has a severity, and some come with a small fix. You see every fix as one diff, type-checked with your repo's TypeScript, before anything is written.

## Run it

```bash
agent-qa run review --input '{"paths":["tests/step-definitions/**/*.ts"]}'
agent-qa run review --input '{"paths":["src/pages/approval-app-main-page.ts"]}' --accept apply
```

`paths` takes files, or globs with `*` and `**`, in the profile's folder: test code only (`.ts`, `.js` and the like), up to 20 files.

## What you get

- **The scan's findings**, found by Agent-QA itself rather than the model: fixed waits, `.only` or `.skip`, XPath, generated Lightning ids, record ids and org URLs.
- **The model's findings**, against the checklist: a test that can pass when it should fail, secrets, locators, conditional checks, waits, reuse, naming and the rest. Each has a file, a line, a severity and why it matters:

| Severity | Means |
|---|---|
| `critical` | the test can pass when it should fail, or a secret is exposed |
| `high` | unreliable by construction, or a defect is masked |
| `medium` | maintenance or reuse that will break later |
| `low` | convention or naming, no functional impact |

A fix is an exact piece of the file and its replacement, only when the replacement is certain and small. Agent-QA refuses a fix that doesn't apply cleanly, adds one of the scan's findings, removes or softens a check, changes what a check reads, adds a branch or a timeout, or changes a test's title. It also refuses one that adds a type error anywhere in the folder.

| Step | What it does | Without your yes |
|---|---|---|
| `apply` | writes the fixes (you see the whole diff) | nothing is written; the findings stand |

`apply` takes your own yes. A file that changed since it was read is never overwritten. The result is `findings@1`. Its status is one of `reviewed` (no fix proposed), `proposed`, `fixed`, `declined`, `type-errors`, `unchecked` (the type check couldn't run) or `stale`. In CI, fixes leave as a pull request: accept `apply,pr`.
