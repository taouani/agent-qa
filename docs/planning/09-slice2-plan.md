# Agent-QA v2: slice 2 plan (Playwright scripts)

4 Nov 2026 · @Tarek AOUANI

Slice 2 takes reviewed test cases and turns them into Playwright TypeScript specs that run against your Salesforce sandbox. It covers five things from the [final plan](https://claude.ai/artifact/KhLP51UivtHtbf9LD87rrk):

- the framework profile;
- a Playwright explorer with masked accessibility snapshots;
- the Salesforce pack;
- the `scripts` workflow, with a run-and-fix step;
- the GitHub adapter, so CI can open pull requests.

The exit check is that the harness measures the runnable rate on your sandbox, and CI opens a pull request with generated specs.

## 0. Update after your answers (4 Nov)

You accepted decisions 1 to 5 and named [sfsc-test-auto-approval-app](https://github.com/taouani/sfsc-test-auto-approval-app) as the reference repo. You also asked for new-repo support. I read that repo, and these facts change the plan:

- **It is a playwright-bdd repo.** The tests are Gherkin `.feature` files in `tests/features/`, with step definitions in `tests/step-definitions/` and page objects in `src/pages/` on Lightning base pages. `npx bddgen` turns the features into Playwright tests in `.features-gen/` before `playwright test` runs. So the generator must write **scenarios and only the step definitions that are missing**. It reuses existing steps, read from the step files with ts-morph, and never writes plain specs into this repo. This moves part of the `gherkin` work from slice 4 into slice 2.
- **Sign-in uses the JWT bearer flow per user.** `src/auth/jwt.ts` and `session.ts` mint a frontdoor URL for each Salesforce username (a consumer key plus a private key), with users per role and country in `config/users/users.json`. Agent-QA will sign in the same way:
  - config gives the consumer key, the login URL, the private key as a `${keychain:}` or `${env:}` reference, and a username for each role;
  - each run mints a fresh frontdoor URL;
  - **no session is stored at all**, which is safer than decision 3's encrypted session. S2-3 changes from a manual `agent-qa login` to this.
- **Faker is already a dependency** (`@faker-js/faker` 10). When the repo has it, the test-data file Agent-QA writes builds its values with faker.
- **The test run command is `npx bddgen && npx playwright test`,** filtered to the generated feature or tags. The JSON reporter is added on the command line, because the repo's config uses only `html`.
- **New task S2-12: start a repo from scratch** (14–20 h). When the target folder is empty, Agent-QA offers to scaffold a Playwright TypeScript repo with:
  - Lightning base pages from the Salesforce pack;
  - JWT sign-in;
  - faker test data;
  - ESLint;
  - a GitHub Actions workflow;
  - a framework profile marked reviewed. Generation then runs on it as usual.

**New estimate: 166–234 h.** That is the earlier 142–198 h, plus 10–16 h for BDD output and 14–20 h for S2-12.

### Two follow-up questions

1. **Style of a new repo.**
   - (a) **BDD, like sfsc-test-auto-approval-app.**
   - (b) Plain Playwright specs.
   - (c) Ask each time. **Recommended: (c),** with (a) as the default answer. BDD suits teams that review Gherkin; plain specs are simpler. Option c
2. **The \~10 reference cases.** The repo has 3 scenario outlines (about 14 example rows), and they already pass, so they can't be the input to measure generation. **Recommended:** use the 21 Xray tests already pushed for SFSC-3123 as the input, generate into this repo, and count how many run.
   - Assumption: SFSC-3123 is part of the approval app this repo tests. It is not part of the approval app but it could be a good candidate to build a repo from scratch
   - If it isn't, name another issue whose tests run on this sandbox. I will provide an issue dealing with approval app later during testing
   - The 3 existing outlines become the check that generated steps reuse existing ones. Ok

## 1. What already exists

These are facts from the code on `master` and the frozen `v1` branch.

- **Config** (`src/core/config/schema.ts`):
  - `playwright` holds `baseUrl`, `testDir` and `profile` (default `.agent-qa/framework-profile.json`);
  - `salesforce` holds `baseUrl` and `auth: storage-state`;
  - `git` holds `platform`, `repo` and `token`;
  - `policy.writes.testCode` defaults to `ask`. None of these are used yet.
- **CLI:** `profile` is listed as planned in `src/cli/index.ts`, but there is no command behind it.
- **Lint:** nothing in `src` may run a child process, and doctor already needed an exception for this. Running the host's Playwright tests needs one narrow, reviewed exception.
- **v1 prompt pack:** `discover-framework-profile`, `explore-ui` (five phases), `generate-playwright-tests` (five phases) and `rules/automation-conventions.md` (failure classes, allowed and never-apply fixes). Slice 2 ports their logic into typed steps. v1 drove the browser through a CLI with shell commands. v2 drives it with the Playwright library inside the core (decision A5).

## 2. How a scripts run works

1. **Pick the cases.** The input is a test-cases run, some TC ids, or Xray test keys. Only reviewed cases are used.
2. **Load the profile.** If there is no reviewed framework profile, the run stops and asks you to build one (`agent-qa profile`). The profile records how your repo writes tests: layout, naming, page-object style, fixtures, locator forms, and the commands that run, type-check and lint.
3. **Explore.** The server opens a browser on your machine with the saved Salesforce sign-in and walks each case.
   - At each state it takes an accessibility snapshot, masks the values in it (labels stay, record values become tokens) and hands it to the model.
   - The model picks the next action from the snapshot and the server performs it.
   - The result is an `exploration@1` artifact for each case: the locators found, the states, the waits that were needed, and any steps it couldn't verify.
4. **Generate.** The model writes page objects and specs following the profile and the Salesforce pack. The server checks the output before anything is written:
   - it type-checks against your repo;
   - it applies the conventions: no fixed waits, role and label locators first, no tokens or personal data in code;
   - it checks that every test step maps to a line of code.
5. **Review and write.** You see the files as a diff and approve them. In the IDE they're written into your repo; in CI they go out as a pull request on GitHub.
6. **Run and fix.**
   - The server runs only the generated specs, with no retries and one worker.
   - For each failure, the model classifies it: selector, timing, real defect, test data, environment, or flake. It applies only the allowed fixes and tries again, up to a set number of attempts.
   - A real defect stops the run and is reported, never "fixed" in the test.
   - A spec that passes is run again a few times to show it is stable.
7. **Report.** The `scripts@1` artifact records for each spec whether it passed, failed (with its class), was unstable or was skipped, plus the fixes applied and the cost. The harness counts the runnable rate from these.

## 3. Tasks and estimates

The estimate is 142 to 198 h. The final plan said 130 to 150 h. The extra comes from the explorer loop and run-and-fix, which are larger than the v1 prompts made them look.

Assumption: at slice 1's pace it will take far less calendar time, but I've estimated as if it doesn't.

| Task | What | Hours |
| --- | --- | --- |
| S2-1 | **Host command runner.** One module runs only the commands the reviewed profile lists (the test run, the type check), in your repo, with a timeout and output limits, through the policy layer. It is the single lint exception. | 8–12 |
| S2-2 | **Framework profile.**\<br>• Reads `playwright.config`, the package.json scripts, sample specs, page objects and fixtures with ts-morph.\<br>• Ranks locator forms by how often they appear.\<br>• Records the paths of auth files, never their contents.\<br>• Writes `framework-profile@1`, with a review step.\<br>• Adds `agent-qa profile` and an MCP `profile` workflow. | 16–22 |
| S2-3 | **Browser session and Salesforce sign-in.** `agent-qa login` opens a visible browser so you can sign in, then saves the session. doctor checks that the session exists and hasn't expired. Playwright is loaded from your repo, so its version matches your tests. | 8–12 |
| S2-4 | **Explorer.** The model chooses each action from a masked snapshot, and the server acts and snapshots again. It detects actions that had no effect and falls back to other interactions, as v1 did. Steps that can't be found are marked unverifiable, never invented. Writes `exploration@1`. | 24–32 |
| S2-5 | **Salesforce pack.**\<br>• Lightning rules: shadow DOM, spinners, toasts, lookups, related lists, record pages opened by URL.\<br>• Locator ranking.\<br>• Ready-made waits and helpers that generated code may import.\<br>• It is data plus a small helper module, never spread through prompts. | 14–20 |
| S2-6 | **`scripts` workflow: generate.** Page objects and specs built from the profile, the pack and the explorations. Checks: type check, conventions, step coverage, no tokens. | 20–28 |
| S2-7 | **Review and write.** A diff review step, then a write to your repo through `policy.writes.testCode`. | 6–8 |
| S2-8 | **Run and fix.** Runs the generated specs with the JSON reporter. The model classifies failures from masked errors and snapshots. Allowed fixes only, a cap on attempts, a stop on a real defect, and stability runs. | 18–24 |
| S2-9 | **GitHub adapter.** Branch, commit and pull request with Octokit. `agent-qa run scripts --ci` opens the PR; CI never writes to a branch directly. | 10–14 |
| S2-10 | **Harness.**\<br>• Runnable rate on your sandbox from a reference set of cases.\<br>• A local stand-in app with Lightning-like pages, so CI can check, without Salesforce, that seeded personal data in snapshots never reaches a model.\<br>• A seeded product bug that must be reported, not fixed. | 14–20 |
| S2-11 | **Docs and 2.0.0-alpha.1.** | 4–6 |

Order: S2-1 and S2-2 first, because everything reads the profile. Then S2-3 and S2-4, which are the riskiest. Then S2-5 to S2-8, and S2-9 and S2-10 last. I'll do a live check with you after S2-4, the same way the Xray push was checked.

## 4. Decisions for you

My recommendation is in bold.

1. **Start now.** Should slice 2 start on 5 Nov, in parallel with your two users trying the alpha? Their feedback would come back as fixes on slice 1. **Recommended: yes.**** ****Y****e****s**
2. **Who drives the browser during exploration.**
   - (a) **The model picks each action from the masked snapshot, and the server acts.**
   - (b) The server replays the test steps with fixed rules and asks the model only when stuck. **Recommended: (a).** Salesforce pages vary too much for fixed rules, and (a) is what worked in v1. The cost is more model calls per case. Option a
3. **Where the Salesforce sign-in is kept.**
   - (a) **Encrypted with the vault key in `.agent-qa/`.**
   - (b) A plain storage-state file in a gitignored folder, as Playwright does by default. **Recommended: (a).** The session cookie is as good as your password until it expires. Option a. For salesforce sign-in we will be using external connected app (jwt)
4. **Personal data in generated code.** Snapshots are masked, so the model sees tokens like `<PERSON_1>`.
   - (a) **Specs may not contain tokens. Data values go into a test-data file of named constants, which you fill in or generate from sandbox records.**
   - (b) Tokens are turned back into the real values when the code is written (`restoreOnWrite` for test code). **Recommended: (a).** Real customer values never end up in git, and tests don't depend on one record. Option a. Use faker to generate test data if possible
5. **Running commands in your repo.** The server runs only the commands recorded in the reviewed profile.
   - In the IDE: (a) **ask once per run**, or (b) ask before every command.
   - In CI it never asks, but only runs inside the PR branch's checkout. **Recommended: (a).** Run-and-fix may run the specs five to ten times. Option a
6. **Reference set for the runnable rate.** I need from you:
   - which Playwright repo the harness should use, either your existing Salesforce automation repo or a new small one we create; <https://github.com/taouani/sfsc-test-auto-approval-app>
   - about 10 reviewed test cases that run on your sandbox. Assumption: a new small repo is easier to share publicly later, while your existing repo is the more honest measure. Test cases from the same repo <https://github.com/taouani/sfsc-test-auto-approval-app>
7. The agent should offer the possibility to create a new automation repository for scratch. The input repo could be empty.

## 5. Risks

- **Salesforce Lightning is brittle** (high). The 90% runnable target is the hardest number in the plan. Mitigations:
  - the pack's waits and locator ranking;
  - measuring on your sandbox from the first explorer task;
  - stability runs before a spec counts as runnable.
- **Explorer cost and speed** (medium). Each step is a model call with a snapshot. Snapshots are trimmed to the part of the page that changed, and the cost report shows the cost per case.
- **Running commands on your machine** (medium). This is the first time Agent-QA executes anything. Mitigations:
  - only commands from the reviewed profile;
  - your repo is the working directory;
  - timeouts;
  - an audit log entry for each run.
- **Your Windows corporate setup** (medium). Browsers may need the corporate proxy and CA settings, and Playwright's browser download may be blocked. doctor will check this, and the docs will cover it.
