# Agent-QA goal statement (confirmed)

Nov 1, 2026 · @Tarek AOUANI

Confirmed by Tarek on 1 November 2026, with the full scope. The first release target is Feb 28, 2027. It moved from 30 November, then from 31 December, after the Phase 3 estimate of 375 to 560 hours.

## Goal statement

**Purpose.** Agent-QA becomes an open-source tool that turns Jira Cloud requirements into reviewed test cases in Xray and into runnable Playwright TypeScript tests for Salesforce apps. It also keeps those tests healthy (debug, review, audit). It runs the same way in an IDE assistant and in CI, and masks personal data before anything reaches a model.

**Users.** QA analysts and test automation engineers on teams that use Jira, Confluence and Xray Cloud, test Salesforce with Playwright and TypeScript, and host code on GitLab, GitHub or Azure DevOps. Today that is 2 users, running it 4 to 5 times per sprint. The target is external open-source adopters.

**Success criteria**

- 95% of generated test cases are kept without edits.
- 90% of generated Playwright TypeScript tests run after only minor manual fixes.
- Both numbers are measured by a repeatable harness on a fixed set of reference tickets and a reference Salesforce org, not by impression. A case a reviewer accepts with no changes counts as kept. The harness runs against Tarek's Salesforce sandbox org. Both targets apply after the first release, not by 28 February 2027.
- Setup takes one install command and one config file, the same for Claude Code, Copilot, Cursor and CI.
- Output quality is predictable across supported models, with a documented minimum model.

**Constraints**

- **Fixed integrations:** Jira, Confluence and Xray Cloud; GitLab, GitHub and Azure DevOps; Playwright with TypeScript; Salesforce as the only app under test (Dynamics 365 is out of scope).
- **Hosts:** Claude Code, Copilot and Cursor, picked by the user, plus a standalone CLI for CI. In CI the CLI either drives a headless agent (Claude Code or Copilot CLI) or calls a model API directly through an allowlist: Anthropic, OpenAI, OpenRouter, LiteLLM.
- **Data:** GDPR, PIPL and CCPA. Personal data is detected and masked before any model call. To guarantee this, Agent-QA owns its Jira, Confluence, Xray and git access instead of relying on the official Atlassian MCP server. It runs on the user's machine; a hosted mode comes after the first release.
- **Team and time:** one developer (Tarek). Budget: up to 40 hours a week, about 680 hours before 28 February 2027. First release by 28 February 2027.
- **Stack:** real code, TypeScript preferred, Python acceptable if clearly better. License: open source.
- **Approach:** full rewrite, with the current branch as reference material.

**Must-have scope:** `analyze-requirements`, `generate-test-cases`, and the automation commands, with Playwright script generation first. First release by 28 February 2027 covers the full scope. That means every current capability (the document generators, the Xray push, explore-ui, generate-playwright-tests, debug-tests, review, audit and refactor), on Claude Code, Copilot, Cursor and the CLI, with GitLab, GitHub and Azure DevOps. It includes Agent-QA's own data access layer, masking and the measurement harness. Only the hosted mode comes later.

## Conflicts (resolved, answers inline)

Some of the answers pull against each other. I can't confirm a goal until these are settled, because each one changes the architecture or the size of the first release.

1. **Scope versus time.** Is the 14 hours a total, or 14 hours per week? Even at 14 hours a week, that is about 56 hours before 30 November. A rewrite covering a CLI, three IDE hosts, three git platforms, data masking, a hosted mode, a harness and the automation commands will not fit in that. The 30 November release has to be a thin slice. Which slice matters most? My suggestion: requirements, then test cases, then Playwright script generation, on one IDE host and the CLI, with masking and the harness, and nothing else. I can allocate up to 40 hours/week (160 hours before November 30th)
2. **"User picks the IDE" versus running in CI.** CI has no IDE, so the CLI needs its own model access. That means either an API key (Anthropic, Azure OpenAI, and so on) or a headless agent CLI such as Claude Code in non-interactive mode. Are direct API keys acceptable to your users, and which providers must be on the allowlist? Headless agent CLI (Claude and copilot) and API keys: anthropic, open ai, open router, LiteLlm
3. **Masking versus IDE mode.** When an IDE assistant reads Jira through the official Atlassian MCP server, the raw data reaches the model before Agent-QA sees it. Masking can only be guaranteed if Agent-QA fetches the data itself and hands the assistant a masked version. That means Agent-QA owns the Atlassian, Xray and git access layer, for example as its own MCP server and CLI. Do you accept that? Yes, I accept it
4. **Hosted service.** For an open-source project run by one person, does "hosted" mean a server that users deploy themselves, or a service you run for others? Can it wait until after the first release? It can wait after the first release
5. **Measuring the targets.** For "kept without edit", does a reviewer accepting a case with no changes count? A 90% runnable rate also needs a reachable Salesforce org in the harness and in CI. Do you have a sandbox or scratch org you can use for this? Are 95% and 90% targets for 30 November, or for later? Yes. Yes. Later
6. **Apps under test.** The branch's source work also covered Dynamics 365. Is Dynamics 365 out of scope now, leaving Salesforce only? Out of scope now, leaving Salesforce only
