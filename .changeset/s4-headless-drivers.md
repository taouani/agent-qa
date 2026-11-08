---
"sf-agent-qa": minor
---

`agent-qa run --headless claude-code` or `--headless copilot` answers each step with Claude Code or GitHub Copilot CLI and its own sign-in, instead of a model API key. The CLI runs with every tool off, in an empty temporary folder, with the masked prompt on stdin and only its own sign-in variables. docs/ci.md has jobs for GitHub Actions, Azure Pipelines and GitLab CI.
