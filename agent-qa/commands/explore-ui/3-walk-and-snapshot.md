# Phase 3: Walk and Snapshot

## Core Responsibilities

- Reproduce each selected test case step by step in the live browser
- Capture an accessibility snapshot at every meaningful state
- Detect and recover from actions that did not take effect

## Workflow Steps

### Step 1: Prepare the Snapshot Directory

For each test case:

```bash
mkdir -p "{selected_folder}/ui-snapshots/{TC-ID}"
```

### Step 2: Navigate to the Starting Point

Prefer a direct URL over menu navigation — menus are slow and introduce flake. Take the entry
snapshot:

```bash
"$browser_cli_command" goto "{url}"
"$browser_cli_command" snapshot --filename="{selected_folder}/ui-snapshots/{TC-ID}/01-entry.yml"
```

Snapshots are YAML accessibility trees, not images. Read each one after capture to learn the
element refs, roles, names, and states available for the next action.

### Step 3: Execute Each Step

For step N of the test case:

1. Read the previous snapshot and locate the element the step describes, by role and accessible
   name. If no element plausibly matches, mark the step `unverifiable` with the reason and move
   to the next step. Never invent an element.
2. Act on it, for example:

```bash
"$browser_cli_command" click <ref>
```

3. Capture the resulting state:

```bash
"$browser_cli_command" snapshot --filename="{selected_folder}/ui-snapshots/{TC-ID}/{NN}-{state}.yml"
```

4. Compare the new snapshot with the previous one.

### Step 4: Detect a Failed Action

If the new snapshot is identical to the previous one — same refs, same states, no navigation —
the action did not take effect. Apply this recovery order, stopping at the first that works:

| Attempt | Recovery |
|---------|----------|
| 1 | An alternative interaction: double-click, or press `Enter`, `Space`, or `Tab` then `Enter` |
| 2 | A JS-forced click via `"$browser_cli_command" evaluate "..."` targeting the element |
| 3 | Ask the user to perform the action manually in the open browser, then snapshot again |

Record the method that worked. If attempt 2 or 3 was needed, that is an observation for the
report — the generated test will need the same treatment.

If all three fail, mark the step `unverifiable` and continue. Never fabricate the outcome.

### Step 5: Capture Deviations

Whenever the application does something the test case did not describe — an extra confirmation
dialog, a validation message, a required field, a redirect — record it as a deviation with the
snapshot it was observed in. These are the most valuable output of exploration.

### Step 6: Stop Conditions

Stop the walk and report when: the environment becomes unreachable, authentication expires
mid-walk, or three consecutive steps are unverifiable. A partial exploration honestly labelled is
useful; a guessed one is not.

## Data Storage

- `snapshots`: map of test case id to ordered snapshot paths
- `step_results`: per step — verified, recovered (with method), or unverifiable (with reason)
- `deviations`: observed behaviour not described by the test case

## Constraints

- Write ONLY under `{selected_folder}/ui-snapshots/`
- Never modify the application's data beyond what the test case describes
- Never invent an element, a ref, or an outcome
- Never continue past an expired session
