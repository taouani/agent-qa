---
"sf-agent-qa": minor
---

`review` workflow (slice 3, S3-4). It does a file-scoped review of the repo's own test code: files, or globs with `*` and `**`, in the profile's folder. Each finding has a file and line, a severity (critical, high, medium or low) and a kind. Findings come from the code scan (fixed waits, focus or skip, XPath, generated ids, record ids, org URLs) and from the model, which reviews against v1's checklist.

A finding may carry a small fix: an exact piece of the file and its replacement. A fix is refused if:
- it doesn't apply cleanly;
- it adds a fixed wait or a skip;
- it removes or changes a check (what it checks, what it expects, `.not`), or makes one soft;
- it adds a branch (`if`, `try`, `return`, `?:`, a loop) or a longer timeout;
- it changes a test's title;
- it brings in a masked value the file doesn't hold.

The fixes are shown as one diff and type-checked with the repo's TypeScript across the whole folder, so a fix that breaks a file importing it is caught; any fix that adds a type error stops them all. If the type check can't run, nothing is written (`unchecked`). They are written only on the person's own yes. In CI they open as a draft pull request.

The result is recorded as `findings@1`. The harness gets a `review` case: a hand-written test with two known flaws, both of which must be reported.
