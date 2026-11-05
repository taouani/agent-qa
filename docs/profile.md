# Framework profile

Before Agent-QA writes or runs any Playwright code in your repo, it reads your Playwright project and you review what it found. This is the `profile` workflow.

## What it reads

Agent-QA parses the source; nothing in the repo is run or loaded.

- `package.json`: the versions of `@playwright/test`, `playwright-bdd`, `@faker-js/faker` and `typescript`.
- `playwright.config.*`: `testDir`, reporters, project names, and the `defineBddConfig` feature and step paths. Only values written out literally are read. A computed value, such as `testDir: appConfig.paths.featuresGen`, is left out.
- `tsconfig.json`: the `paths` aliases.
- Step definitions made with `createBdd`: the keyword, the step text (a Cucumber expression or a regular expression), the file and line, and the fixtures the step uses.
- Page objects (classes in a `pages` folder, or named `*Page`, `*Screen` or `*Component`): the name, the base class and the public methods.
- Fixtures declared with `test.extend({...})`.
- Feature files: the number of scenarios and the tags. Scenario titles and example rows are not kept, because they can hold names.
- Locator use (`getByRole`, `getByLabel`, CSS, XPath and the others), counted and ranked so generated code follows your style.
- Sign-in and user files (`.env*`, `auth/`, `users.json`, JWT and session code): listed by path. Secret and data files such as `.env` and `users.json` are never read. Sign-in code is parsed like any other code, for its steps and page objects only.

The walk skips `node_modules`, build and report folders, `.features-gen` and links. It stops after 3,000 files or 32 MB. The scan runs once per profile run, and every text it found is masked before your IDE's model sees the review.

## Run it

In VS Code, start the `profile` workflow (`/mcp.agent-qa.profile`). From a terminal:

```bash
agent-qa profile                         # show the scan; exit 1 if agent-qa.profile.json is missing or differs
agent-qa run profile --accept review     # scan, then save agent-qa.profile.json
agent-qa run profile --input '{"folder":"e2e"}' --accept review   # when the project is in a sub-folder
```

`--yes` never saves the profile. Saving takes your own yes, because the profile decides which commands Agent-QA may run. In an IDE that can't ask you directly (no MCP elicitation), the model's yes is refused, so run `agent-qa run profile --accept review` in a terminal instead. If the folder, kind or commands change between the review and your yes, nothing is saved.

## Start a new repo

When the folder has no Playwright project and no `package.json`, the same workflow offers to start one instead of reviewing a scan:

1. **Style.** Gherkin features with playwright-bdd (the default, and what nobody answering gets), or plain Playwright specs. Set it up front with `--input '{"style":"plain"}'`.
2. **Your yes.** Agent-QA lists the files and creates them, replacing none, then saves `agent-qa.profile.json` for the new repo. Like the review, this takes your own yes: the model's yes is refused, and `--yes` declines it.

```bash
agent-qa run profile --accept scaffold                              # asks the style, then creates the repo
agent-qa run profile --input '{"style":"plain"}' --accept scaffold  # plain specs, no question
```

The new repo holds:

- `package.json` (`@playwright/test`, `@faker-js/faker`, `playwright-bdd` for Gherkin, TypeScript, ESLint), `playwright.config.ts`, `tsconfig.json`, `eslint.config.mjs` (which bans `waitForTimeout`), `.gitignore`;
- `src/auth/salesforce.ts`: sign-in with the OAuth 2.0 JWT bearer flow of an External Client App, then a single-use frontdoor URL, so no MFA prompt;
- `src/fixtures.ts` (`signIn(role)`, reading `SF_USER_<ROLE>`), `src/pages/base-page.ts`, `src/support/lightning.ts` (the Salesforce pack's Lightning waits and helpers), `src/support/test-data.ts` (faker);
- one smoke scenario (`tests/features/smoke.feature` and its steps, or `tests/smoke.spec.ts`);
- `.env.example` with names only, and `.github/workflows/playwright.yml` when the folder is the repository root.

No secret is written. Then run `npm install`, `npx playwright install chromium`, and fill in `.env`. Nothing starts in CI, in a folder that already has any of these files, or when `agent-qa.profile.json` exists. If a file appears between the question and your yes, nothing is written; if a write fails midway, the files already created are removed.

## agent-qa.profile.json

Accepting saves the reviewed part next to `agent-qa.yaml`. Commit it, so CI uses the same commands:

```json
{
  "version": 1,
  "folder": ".",
  "kind": "playwright-bdd",
  "commands": {
    "generate": ["npx", "bddgen"],
    "test": ["npx", "playwright", "test"],
    "typecheck": ["npx", "tsc", "--noEmit"]
  },
  "reviewedAt": "2026-11-04T22:57:35.865Z"
}
```

- A profile can hold only these three commands, exactly; a file listing anything else is refused. They are the only commands Agent-QA runs in your repo. It runs them in `folder`, with no shell, and only after the `commands` write rule allows it (`policy.writes.commands`).
- `npx` is never allowed to download a missing package.
- The file is written through the policy layer as a `testCode` write. In CI, test code only leaves as a pull request, so CI never writes this file.

The full scan is kept in the run folder as `framework-profile.json` and `framework-profile.md`. Step texts there are masked like any other artifact.
