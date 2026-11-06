---
"sf-agent-qa": minor
---

The `refactor` workflow (slice 3, task S3-6), ported from v1's refactor-framework. It works from an audit run's findings (`audit@1`), by default all of them, and the folder's code, masked. The model plans phases. Each task serves audit findings and is made of operations that Agent-QA applies in memory with ts-morph (new dependency):
- a rename, where every reference follows across files, path aliases included;
- an exact edit;
- a new file.

Before the person sees the plan, Agent-QA checks it:
- every task applies;
- the tasks of a phase touch different files;
- nothing is planned before what it depends on;
- no task changes what the tests check. Across the folder, checks, test titles and literal values stay as they were. No fixed wait, skip or soft check is added. Masked values stay in their files.

A run carries out the first phase. The person sees its whole diff and says yes to all of its tasks or to some. Each task is type-checked with the repo's TypeScript over the whole folder and is written only if it adds no type error. The phase stops at the first task that does add one.

The specs the changes reach, through imports, are listed. They run on a second yes, and if one fails, the phase is put back: edited files get their earlier text and new files are removed (new data method `removeTestFiles`). In CI the changes go out as a pull request, a draft unless the tests passed. The result is recorded as `refactor-report@1`. Linting isn't run yet, because the profile records no lint command.
