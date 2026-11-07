# Refactoring from an audit

The `refactor` workflow turns an audit's findings into a phased plan and carries out one phase per run. It uses ts-morph, so a rename follows every reference across files and imports. Every task is checked so that it changes how the code is organised, never what the tests check.

## Run it

```bash
agent-qa run refactor --input '{"auditRun":"<audit run id>"}'
agent-qa run refactor --input '{"auditRun":"<audit run id>","findings":["AF-001","AF-003"]}' --accept apply
```

`findings` picks the audit's findings to act on (all of them when left out).

## The plan

The model plans from `audit@1` and the folder's code, masked. The plan has phases, each worth stopping after, made of tasks. Each task serves audit findings and is built from operations Agent-QA applies itself:

- **rename**: a symbol, or a member of a class or interface, with every reference following;
- **edit**: an exact piece of a file and its replacement;
- **create**: a new file.

Agent-QA checks the plan before you see it. Each task must apply, and a phase's tasks must touch different files. Nothing may come before what it depends on. No task may change what the tests check: every check, test title and value stays, and no fixed wait, skip, soft check, branch or timeout is added. Per test, the code a test reaches must still be reached, in the same order. A rename that would clash with an existing name is refused.

## A run

A run carries out the plan's first phase. The next run plans again from the code as it is then.

| Step | What it does | Without your yes |
|---|---|---|
| `apply` | shows the phase's whole diff; writes all its tasks, or the ones you pick | nothing is written |
| `run` | runs the tests the changed files reach; if one fails, the phase's changes are put back | nothing runs, and the changes stay |

Both take your own yes. Each task is type-checked with your repo's TypeScript over the whole folder, before and after, and written only if it adds no type error. The phase stops at the first task that does, and that task is never written. A file that changed since it was read is never overwritten. In CI, changes leave as a pull request: accept `apply,run,pr`. The result is `refactor-report@1`.

Known limits of the checks are listed in [backlog.md](backlog.md#refactor-guard-limits). Lint isn't run: the type check stands in for it.
