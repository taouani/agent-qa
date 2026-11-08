---
"sf-agent-qa": minor
---

The `document` workflow writes all seven QA documents from v1: `test-strategy`, `test-plan`, `test-charter`, `risk-register`, `test-data`, `traceability` and `release-notes`. Agent-QA computes the counts, risk scores, the traceability matrix (cases matched to test results by TC id) and the fix version, and checks each type's rules before you review it. Two harness cases check that documents and their reviews stay masked. See docs/documents.md.
