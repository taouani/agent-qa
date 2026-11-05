---
"sf-agent-qa": minor
---

Start a new Playwright repo (S2-12): in a folder with no Playwright project, the `profile` workflow asks the style (Gherkin with playwright-bdd by default, or plain specs), then, on the person's own yes (`--accept scaffold`), creates a TypeScript repo for Salesforce with JWT bearer sign-in, the pack's Lightning helpers, faker test data, ESLint and a GitHub Actions workflow, and saves its reviewed `agent-qa.profile.json`. It writes new files only, never in CI, and removes what it created if a write fails.
