---
"sf-agent-qa": minor
---

Changing existing test files (slice 3, S3-1): the data layer reads test files masked, with the sha256 and git blob id of their real bytes, and writes a reviewed edit back with its real values, all or none, only while each file still holds what was read. An edit keeps only the masking tokens of that file. Configs (at any depth), `package.json`, `.env`, the profile, auth and session files, git-ignored files and JSON outside a test data folder are never read or changed. A unified diff (`unifiedDiff`) shows the person the whole change first. In CI, pull requests can now carry changed files: the base must still hold each one as it was read.
