# Discover Framework Profile

## Purpose

Resolve `agent-qa/framework-profile.md` — the record of how the host repository writes
Playwright tests. Every command that reads or modifies real test code references this
instruction from its first phase.

Framework-specific knowledge belongs in the profile, never in a phase file.

## Workflow

### Step 1: Check whether a profile already exists

If `agent-qa/framework-profile.md` exists:

1. Read it.
2. Compare `playwright_project_root` in the profile against `agent-qa/config.yml`.
3. If they differ, or the recorded `playwright.config.ts` path no longer exists, report:
   "**WARN** — framework profile is stale. Re-run this command with `--refresh` to regenerate it."
   Then continue using the existing profile.
4. Store the parsed profile for later phases and return.

If the caller passed `--refresh`, ignore the existing profile and continue to Step 2. Never
delete the existing file — write the new one only after the engineer approves it in Step 5.

### Step 2: Resolve the project root

Read `playwright_project_root` from `agent-qa/config.yml`.

- If empty, search for `playwright.config.ts` or `playwright.config.js` up to three directories
  deep, excluding `node_modules/`. If exactly one is found, use its directory and tell the user
  which was chosen. If several are found, list them and ask the user to pick one. If none is
  found, report: "**FAIL** — no Playwright project found. Set `playwright_project_root` in
  `agent-qa/config.yml`." and STOP.

### Step 3: Observe the repository

Read, do not modify:

1. `playwright.config.ts` — `testDir`, `baseURL`, projects, reporters, timeouts.
2. `package.json` scripts — identify the test, debug, report, type-check, and lint commands the
   team actually uses. Record a command only if it exists; write "none observed" otherwise, and
   list it under `## Unverified` so the engineer can supply it.
3. Up to five existing spec files and five page objects — sample, do not read the whole suite.
   Record: directory layout, file naming, class naming, how a page object is constructed, how
   fixtures are imported, and which locator forms appear, ranked by frequency.
4. Any fixture or helper module the sampled specs import.
5. Any `.auth` directory referenced by the config or by a global setup file — record the PATH
   ONLY. Never read the contents of an auth-state file.

### Step 4: Note application archetype handling

Record waits and workarounds the repository already implements for its application, for example
spinner overlays, iframe entry, or lookup dialogs. Describe what the repository does. Do not
name a vendor or product unless the repository itself does.

### Step 5: Write the profile and STOP

Write `agent-qa/framework-profile.md`:

    ---
    type: framework-profile
    generated: YYYY-MM-DD
    generated_by: discover-framework-profile
    reviewed: false
    ---

    # Framework Profile

    ## Project
    - playwright_project_root: {path}
    - run_command: {e.g. npx playwright test}
    - debug_command: {e.g. npx playwright test --debug}
    - report_command: {e.g. npx playwright show-report}
    - typecheck_command: {e.g. npx tsc --noEmit, or "none observed"}
    - lint_command: {e.g. npm run lint, or "none observed"}

    ## Layout
    - spec_dir: {path}
    - spec_naming: {observed pattern}
    - page_object_dir: {path}
    - page_object_naming: {observed pattern}
    - fixture_import: {exact import line used by sampled specs}

    ## Locator Priority
    {Ranked list as observed in this repository. State the sample size it was derived from.}

    ## Authentication
    - auth_state_path: {path or "none observed"}
    - auth_state_ttl_minutes: {value from config.yml}

    ## Base URLs
    {environment: url, one per line, from config or playwright.config.ts}

    ## Archetype Notes
    {Waits and handling the repository already implements.}

    ## Unverified
    {Every field that could not be observed, one per line. The engineer fills these in.}

Then STOP with:

    Framework profile written to agent-qa/framework-profile.md.
    Review it — especially the "Unverified" section — then set `reviewed: true` and re-run this command.

Do NOT continue to the next phase. A profile that has never been reviewed must not drive code
generation or code modification.

### Step 6: Refuse to proceed on an unreviewed profile

When a profile exists but its front matter has `reviewed: false`, report the same message as
Step 5 and STOP.

## Constraints

- Never read the contents of an auth-state file; existence and modification time only
- Never modify any file under `playwright_project_root` from this instruction
- Never overwrite an engineer-edited profile without `--refresh`
- Never fill an unobservable field with a plausible guess — list it under `## Unverified`
