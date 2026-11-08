---
"sf-agent-qa": minor
---

Repo paths are masked like any other text a model sees. A test file named after a person (`tests/users/marie-curie.spec.ts`) reaches the model, the run's reports and its artifacts as `tests/users/<PATH_1>.spec.ts`, and Agent-QA finds the real file again from the run's vault when that path comes back (a read, an edit, a test run, a type check, a pull request). Each part of a path is masked alone, with its extension kept. This covers the framework listing, the framework profile, test results and failures, type errors, related feature files and refusal messages. Two limits: the profile's folder itself is shown as it is, and an import inside a file can name a masked file differently from its path when the name is split in pieces.
