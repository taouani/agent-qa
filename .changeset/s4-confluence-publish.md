---
"sf-agent-qa": minor
---

The `document` workflow can publish the reviewed document to Confluence: `publish: confluence` (or `--publish confluence`) adds a `publish` step that asks first, then creates the page under `atlassian.confluence.parentPageId` with the `agent-qa` label, or updates Agent-QA's own page with the same title to its next version. A page with the title that Agent-QA didn't create is never overwritten. The write goes through `policy.writes.confluence`; masked values stay masked unless `masking.restoreOnWrite` is on. `agent-qa run` also gets `--type` for the document type. See docs/documents.md.
