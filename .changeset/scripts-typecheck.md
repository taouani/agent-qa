---
"sf-agent-qa": minor
---

`scripts` type-checks generated code with your repo's own TypeScript and tsconfig before keeping it, with the files laid over the repo in memory (nothing is written). It asks once per run first; with a no, or when the repo has no TypeScript, `scripts-draft@1` says the type check was skipped or unavailable.
