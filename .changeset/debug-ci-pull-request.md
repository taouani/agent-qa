---
"sf-agent-qa": minor
---

In CI, `debug` opens its changes as a pull request (step `pr`). Each changed file goes in once and is checked against its blob on the base from before the first change. The pull request is a draft unless every test passed and stayed stable. It is recorded under `pr` in `debug-report@1`.
