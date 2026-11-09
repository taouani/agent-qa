---
"sf-agent-qa": patch
---

Security policy and data-handling page: SECURITY.md (how to report a vulnerability, supported versions) and docs/security.md (what leaves the machine, masking and its limits, the vault, the policy layer, secrets, what a model can do, the supply chain). `@cucumber/gherkin` and `@cucumber/messages` are updated, which clears the `uuid` advisory from the runtime dependencies. CI fails on a high or critical advisory in a runtime dependency.
