---
"sf-agent-qa": patch
---

Security policy and data-handling page: SECURITY.md (how to report a vulnerability, supported versions) and docs/security.md (what leaves the machine, masking and its limits, the vault, the policy layer, secrets, what a model can do, the supply chain). Expired run vaults are now deleted from disk the next time a vault is opened, instead of only being refused. CI fails on a high or critical advisory in a runtime dependency, checked on every pull request and weekly.
