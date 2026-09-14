# Phase 2: Resolve Profile and Session

## Core Responsibilities

- Resolve the framework profile
- Verify the browser session CLI is available
- Establish an authenticated browser session

## Workflow Steps

### Step 1: Resolve the Framework Profile

Follow `@agent-qa/commands/common/discover-framework-profile.md`. If it stops, this command stops.

### Step 2: Verify the Session CLI

Read `browser_cli_command` from `agent-qa/config.yml` (default `playwright-cli`).

```bash
command -v "$browser_cli_command" >/dev/null 2>&1 && "$browser_cli_command" --version
```

If it is absent, report and STOP:

    {browser_cli_command} not found on PATH. Install it with: npm install -g playwright-cli
    Exploration cannot run. You can still run /agent-qa:generate-playwright-tests, which will
    emit TODO locator comments instead of real locators.

This CLI is a stateful browser session — NOT `npx playwright`. One `open` starts a browser that
subsequent commands act on.

### Step 3: Resolve the Base URL

Take the base URL from the profile's `## Base URLs` for the target environment, falling back to
`playwright_base_url` in `agent-qa/config.yml`. If neither resolves, ask the user. Never guess a
host name.

### Step 4: Establish Authentication

Read `auth_state_path` from the profile and `automation.auth_state_ttl_minutes` from config.

**This is the only file Agent-QA writes outside `agent-qa/`.** It is sanctioned because a
browser auth state must live where the host project's Playwright config expects it. It is
gated regardless of `automation.allow_source_edits`:

1. If the profile records no `auth_state_path`, or records `none observed`, STOP and ask the
   engineer for the path their Playwright setup uses. Never invent a path for a file that will
   hold credentials.
2. If a file already exists at that path, show its path and modification time and ask before
   overwriting. Never silently replace an existing auth state.
3. If the path's directory is not matched by `.gitignore`, STOP and report it. A browser auth
   state must never be committed. Do not write it and then warn.

These three conditions apply to the `state-save` call below and to nothing else in this command.

Check existence and age. Check the modification time only — never read the file's contents.

```bash
now=$(date +%s)
filetime=$(stat -f %m "$auth_state_path" 2>/dev/null || stat -c %Y "$auth_state_path" 2>/dev/null)
echo "age_seconds=$(( now - filetime ))"
```

| Condition | Action |
|-----------|--------|
| File exists and age ≤ TTL | Reuse it |
| File missing or age > TTL | Generate a new one |

**Reuse:**

```bash
"$browser_cli_command" open --headed
"$browser_cli_command" state-load "$auth_state_path"
```

**Generate:** open the browser at the base URL, then stop and ask the user to log in manually:

```bash
"$browser_cli_command" open "$base_url" --headed
```

Report: "Log in manually in the browser window, then reply `done`." Wait for the reply. Then:

```bash
"$browser_cli_command" state-save "$auth_state_path"
```

Agent-QA never types credentials and never stores them. If the user supplies credentials in chat,
refuse to use them and repeat the manual login instruction.

### Step 5: Confirm the Session

Navigate to the base URL and take one snapshot to a temporary path. If the snapshot shows a login
page, authentication did not take — return to Step 4 rather than continuing.

## Data Storage

- `profile`, `base_url`, `auth_state_path`, `browser_cli_command`
- `session_ready`: boolean

## Constraints

- Never read the contents of an auth-state file
- Never accept, type, or store credentials
- Never proceed with an unauthenticated session — stop instead
- The browser auth state at the profile's `auth_state_path` is the ONLY file this command may
  write outside `agent-qa/`, and only under the three conditions in Step 4
- Never use Playwright MCP; this command is `playwright-cli` only
