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
- Sign-in and user files (`.env*`, `auth/`, `users.json`, JWT and session code): listed by path. Their contents are never read.

The walk skips `node_modules`, build and report folders, `.features-gen` and links.

## Run it

In VS Code, start the `profile` workflow (`/mcp.agent-qa.profile`). From a terminal:

```bash
agent-qa profile                         # show the scan; exit 1 if agent-qa.profile.json is missing or differs
agent-qa run profile --accept review     # scan, then save agent-qa.profile.json
agent-qa run profile --input '{"folder":"e2e"}' --accept review   # when the project is in a sub-folder
```

`--yes` never saves the profile. Saving takes your own yes, because the profile decides which commands Agent-QA may run.

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

- These are the only commands Agent-QA runs in your repo. It runs them in `folder`, with no shell, and only after the `commands` write rule allows it (`policy.writes.commands`).
- `npx` is never allowed to download a missing package.
- The file is written through the policy layer as a `testCode` write. In CI, test code only leaves as a pull request, so CI never writes this file.

The full scan is kept in the run folder as `framework-profile.json` and `framework-profile.md`. Step texts there are masked like any other artifact.
