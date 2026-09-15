#!/usr/bin/env bash
# Structural integrity checks for the Agent-QA prompt repository.
# Usage: bash scripts/check-repo.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAILURES=0

fail() { echo "FAIL: $*"; FAILURES=$((FAILURES + 1)); }
pass() { echo "  ok: $*"; }

check_phase_refs() {
    echo "== phase references resolve =="
    local ref path
    while read -r ref; do
        path="${ref#@}"
        if [[ -f "$path" ]]; then pass "$path"; else fail "phase reference not found: $path"; fi
    done < <(grep -rhoE '\{\{PHASE [0-9]+: @[^}]+\}\}' agent-qa/commands agent-qa/ide/claude/commands \
             | sed -E 's/.*: (@[^}]+)\}\}/\1/')
}

check_command_twins() {
    echo "== every command has an entry point and a wrapper =="
    local dir name
    for dir in agent-qa/commands/*/; do
        name="$(basename "$dir")"
        [[ "$name" == "common" ]] && continue
        [[ -f "$dir$name.md" ]] || fail "missing entry point: $dir$name.md"
        [[ -f "agent-qa/ide/claude/commands/agent-qa/$name.md" ]] \
            || fail "missing slash-command wrapper for: $name"
    done
    pass "command twins checked"
}

check_phase_numbering() {
    echo "== phase files are numbered from 1 with no gaps =="
    local dir name expected n
    for dir in agent-qa/commands/*/; do
        name="$(basename "$dir")"
        [[ "$name" == "common" ]] && continue
        expected=1
        while read -r n; do
            [[ "$n" == "$expected" ]] || fail "$dir: expected phase $expected, found $n"
            expected=$((expected + 1))
        done < <(find "$dir" -maxdepth 1 -name '[0-9]*-*.md' -print0 \
                 | xargs -0 -n1 basename | sed -E 's/^([0-9]+)-.*/\1/' | sort -n)
    done
    pass "phase numbering checked"
}

check_required_rules() {
    echo "== required rule files exist =="
    local f
    for f in agent-qa/rules/qa-conventions.md \
             agent-qa/rules/mcp-usage.md \
             agent-qa/rules/output-standards.md \
             agent-qa/rules/language-handling.md \
             agent-qa/rules/automation-conventions.md; do
        [[ -f "$f" ]] && pass "$f" || fail "missing rule file: $f"
    done
}

check_config_template_keys() {
    echo "== config template declares automation keys =="
    local k
    for k in 'playwright_project_root:' 'browser_cli_command:' 'allow_source_edits:' \
             'auth_state_ttl_minutes:' 'stability_runs:'; do
        if grep -q "^[[:space:]]*$k" agent-qa/config.yml.template; then
            pass "config.yml.template declares $k"
        else
            fail "config.yml.template missing key: $k"
        fi
    done
}

check_automation_rule_headings() {
    echo "== automation-conventions.md declares its referenced sections =="
    local h
    for h in '## Locator Priority' '## Allowed Fixes' '## Never-Apply Fixes' \
             '## Failure Classification' '## Severity Levels'; do
        if grep -qF "$h" agent-qa/rules/automation-conventions.md 2>/dev/null; then
            pass "$h"
        else
            fail "automation-conventions.md missing section: $h"
        fi
    done
}

check_common_snippets() {
    echo "== shared command snippets exist =="
    local f
    for f in agent-qa/commands/common/generate-output-index.md \
             agent-qa/commands/common/execute-post-hooks.md \
             agent-qa/commands/common/discover-framework-profile.md; do
        [[ -f "$f" ]] && pass "$f" || fail "missing shared snippet: $f"
    done
}

check_healthcheck_covers_automation() {
    echo "== health-check probes the automation prerequisites =="
    local f1=agent-qa/commands/health-check/1-validate-configuration.md
    local f2=agent-qa/commands/health-check/2-test-mcp-connectivity.md
    grep -q 'playwright_project_root' "$f1" && pass "health-check validates project root" \
        || fail "health-check phase 1 does not validate playwright_project_root"
    grep -q 'framework-profile.md' "$f1" && pass "health-check validates profile" \
        || fail "health-check phase 1 does not check framework-profile.md"
    grep -q 'browser_cli_command\|playwright-cli' "$f2" && pass "health-check probes browser CLI" \
        || fail "health-check phase 2 does not probe the browser CLI"
}

check_command_phases() {
    # usage: check_command_phases <command-name> <phase-file-basename>...
    local name="$1"; shift
    local dir="agent-qa/commands/$name"
    echo "== command $name =="
    [[ -f "$dir/$name.md" ]] && pass "$name entry point" || fail "$name: missing entry point"
    [[ -f "agent-qa/ide/claude/commands/agent-qa/$name.md" ]] \
        && pass "$name wrapper" || fail "$name: missing slash-command wrapper"
    local phase
    for phase in "$@"; do
        [[ -f "$dir/$phase" ]] && pass "$name/$phase" || fail "$name: missing phase $phase"
    done
    # entry point and wrapper must reference the same phases
    if ! diff <(grep -oE '\{\{PHASE [0-9]+: @[^}]+\}\}' "$dir/$name.md" 2>/dev/null) \
              <(grep -oE '\{\{PHASE [0-9]+: @[^}]+\}\}' \
                "agent-qa/ide/claude/commands/agent-qa/$name.md" 2>/dev/null) >/dev/null; then
        fail "$name: entry point and wrapper reference different phases"
    else
        pass "$name twins agree"
    fi
}

check_review_automation_code() {
    check_command_phases review-automation-code \
        1-select-files.md 2-classify-and-load-conventions.md 3-review.md \
        4-report-and-optional-fix.md
    [[ -f agent-qa/ide/claude/agents/automation-reviewer.md ]] \
        && pass "automation-reviewer agent" || fail "missing agent: automation-reviewer.md"
}

check_audit_framework() {
    check_command_phases audit-framework \
        1-scope-and-inventory.md 2-analyze.md 3-score-and-prioritize.md 4-write-audit-report.md
    [[ -f agent-qa/ide/claude/agents/framework-architect.md ]] \
        && pass "framework-architect agent" || fail "missing agent: framework-architect.md"
}

check_playwright_upgrade() {
    local d=agent-qa/commands/generate-playwright-tests
    check_command_phases generate-playwright-tests \
        1-find-and-select-test-cases.md 2-analyze-and-map-ui-elements.md \
        3-generate-page-objects.md 4-generate-test-specs.md 5-run-and-stabilize.md
    grep -q 'ui-snapshots/exploration.md' "$d/2-analyze-and-map-ui-elements.md" \
        && pass "phase 2 consumes exploration report" \
        || fail "generate-playwright-tests phase 2 does not consume exploration.md"
    grep -q 'TODO' "$d/4-generate-test-specs.md" \
        && pass "phase 4 retains TODO fallback" \
        || fail "generate-playwright-tests lost its TODO fallback for the no-exploration path"
}

check_explore_ui() {
    check_command_phases explore-ui \
        1-find-and-select-test-cases.md 2-resolve-profile-and-session.md \
        3-walk-and-snapshot.md 4-extract-locators-and-observations.md \
        5-write-exploration-report.md
    [[ -f agent-qa/ide/claude/agents/ui-explorer.md ]] \
        && pass "ui-explorer agent" || fail "missing agent: ui-explorer.md"
    grep -rq 'browser_snapshot\|mcp__.*playwright' agent-qa/commands/explore-ui/ \
        && fail "explore-ui references Playwright MCP; the design is playwright-cli only" \
        || pass "explore-ui is playwright-cli only"
}

check_debug_tests() {
    check_command_phases debug-tests \
        1-select-failing-tests.md 2-reproduce.md 3-classify-failure.md \
        4-apply-allowed-fixes.md 5-verify-and-report.md
    [[ -f agent-qa/ide/claude/agents/playwright-debugger.md ]] \
        && pass "playwright-debugger agent" || fail "missing agent: playwright-debugger.md"
    grep -q 'waitForTimeout' agent-qa/commands/debug-tests/4-apply-allowed-fixes.md \
        && pass "debug-tests names the forbidden sleep explicitly" \
        || fail "debug-tests phase 4 must explicitly forbid waitForTimeout"
}

check_refactor_framework() {
    check_command_phases refactor-framework \
        1-load-audit-and-plan.md 2-select-phase-and-tasks.md \
        3-execute-with-validation.md 4-report-and-commit.md
    grep -q 'git checkout --' agent-qa/commands/refactor-framework/3-execute-with-validation.md \
        && pass "refactor-framework can targeted-restore a failed task" \
        || fail "refactor-framework phase 3 must offer a targeted git checkout -- restore on failure"
}

check_new_deliverables_documented() {
    echo "== new deliverable types are documented =="
    local d
    for d in 'ui-snapshots/' 'reviews/' 'debug/'; do
        grep -qF "$d" agent-qa/rules/qa-conventions.md \
            && pass "qa-conventions documents $d" || fail "qa-conventions missing subfolder: $d"
        grep -qF "$d" agent-qa/rules/output-standards.md \
            && pass "output-standards documents $d" || fail "output-standards missing subfolder: $d"
    done
    local f
    for f in 'exploration.md' 'architecture-review.md' 'refactor-plan.md' 'code-review.md'; do
        grep -qF "$f" agent-qa/rules/output-standards.md \
            && pass "output-standards names $f" || fail "output-standards missing file name: $f"
    done
    grep -q 'ui-exploration\|architecture-review' \
        agent-qa/commands/validate-outputs/2-validate-deliverables.md \
        && pass "validate-outputs knows the new types" \
        || fail "validate-outputs does not validate the new deliverable types"
}

check_docs_updated() {
    echo "== documentation reflects the new commands =="
    local cmd_count
    cmd_count=$(find agent-qa/commands -maxdepth 1 -mindepth 1 -type d ! -name common | wc -l | tr -d ' ')
    grep -q "$cmd_count commands" CLAUDE.md \
        && pass "CLAUDE.md states $cmd_count commands" \
        || fail "CLAUDE.md does not state the current command count ($cmd_count)"
    local c
    for c in explore-ui debug-tests review-automation-code audit-framework refactor-framework; do
        grep -q "$c" CLAUDE.md || fail "CLAUDE.md does not mention $c"
    done
    grep -q 'playwright-cli' INSTALLATION.md \
        && pass "INSTALLATION.md documents the prerequisite" \
        || fail "INSTALLATION.md does not document the playwright-cli prerequisite"
    grep -q 'framework-profile.md' scripts/project-update.sh \
        && pass "project-update.sh accounts for the profile" \
        || fail "project-update.sh does not mention framework-profile.md"
}

check_write_gate_present() {
    echo "== commands that can write host source still carry the write gate =="
    local f
    for f in agent-qa/commands/generate-playwright-tests/4-generate-test-specs.md \
             agent-qa/commands/review-automation-code/4-report-and-optional-fix.md \
             agent-qa/commands/debug-tests/4-apply-allowed-fixes.md \
             agent-qa/commands/refactor-framework/2-select-phase-and-tasks.md; do
        grep -q 'allow_source_edits' "$f" \
            && pass "$f gates on allow_source_edits" \
            || fail "$f lost its allow_source_edits gate"
    done
    for f in agent-qa/commands/review-automation-code/4-report-and-optional-fix.md \
             agent-qa/commands/debug-tests/4-apply-allowed-fixes.md \
             agent-qa/commands/generate-playwright-tests/4-generate-test-specs.md; do
        grep -q '\.auth\|deny-list' "$f" \
            && pass "$f names the deny-list" \
            || fail "$f lost its deny-list reference"
    done
    grep -q '## Write Gate' agent-qa/rules/automation-conventions.md \
        && pass "canonical write gate defined" \
        || fail "automation-conventions.md missing ## Write Gate"
}

check_inference_path_never_stops() {
    echo "== generate-playwright-tests never stops on profile state =="
    local dir=agent-qa/commands/generate-playwright-tests
    local f flat hits

    # Markdown wraps sentences across lines, so every text assertion below runs against
    # a whitespace-flattened copy of the file. A line-oriented grep silently misses a
    # prohibition that happens to wrap, which reads as a missing prohibition.
    flatten() { tr '\n' ' ' < "$1" | tr -s ' '; }

    # 1. The exact regression this guards: delegating to the discovery snippet, which
    #    STOPS the command on all three of its branches.
    if grep -rq 'discover-framework-profile' "$dir/"; then
        fail "generate-playwright-tests delegates to discover-framework-profile, which STOPS the command"
    else
        pass "no delegation to profile discovery"
    fi

    # 2. Positive assertion: the prohibition must still be stated where it matters.
    #    An absence-only check passes vacuously once someone deletes the text it guards.
    for f in "$dir/2-analyze-and-map-ui-elements.md" "$dir/3-generate-page-objects.md"; do
        flatten "$f" | grep -q 'never stop this command' \
            && pass "$(basename "$f") states the no-stop prohibition" \
            || fail "$(basename "$f") lost the 'never stop this command' prohibition"
    done

    # 3. Negative scan of phases 1-4: no instruction may halt the command because of
    #    profile state. Phase 5 is exempt - it is terminal and SKIPs after every
    #    deliverable is written. Matches containing "never stop" are excluded, or this
    #    check would flag the very sentences that forbid the thing - a trap this
    #    repository has fallen into before.
    for f in "$dir"/[1-4]-*.md; do
        hits=$(flatten "$f" \
            | grep -oE '(STOP|and stop|FAIL).{0,200}(framework-profile|reviewed: *true|profile is missing|profile is absent|no Playwright project)|(framework-profile|reviewed: *true|profile is missing|profile is absent|no Playwright project).{0,200}(STOP|and stop|FAIL)' \
            | grep -iv 'never stop' || true)
        if [[ -n "$hits" ]]; then
            fail "$(basename "$f") halts on profile state: $hits"
        fi
    done
    pass "phases 1-4 never halt on profile state"
}

check_roles_wired() {
    echo "== every role is referenced by a phase =="
    local role name found=0
    # The roles are read from the filesystem, never from a fixed list. A
    # hardcoded list can only ever confirm roles someone already knew about,
    # so a NEW role that no phase references -- precisely the orphan this
    # check exists to catch -- was invisible to it.
    #
    # A role file that is DELETED is caught elsewhere: check_role_refs_resolve
    # fails on any @agent-qa/roles/ reference with no file behind it, and
    # check_roles_documented fails on the role count in CLAUDE.md.
    for role in agent-qa/roles/*.md; do
        [[ -f "$role" ]] || continue
        found=1
        name="$(basename "$role" .md)"
        if grep -rq "@agent-qa/roles/$name.md" agent-qa/commands/; then
            pass "$name is referenced by a phase"
        else
            fail "orphan role, no phase references it: $role"
        fi
    done
    (( found == 1 )) || fail "no role files found in agent-qa/roles/"
    return 0
}

check_wrappers_defer() {
    echo "== every Claude agent wrapper defers to a role or rule =="
    local f target named
    [[ -d agent-qa/ide/claude/agents ]] || { fail "missing agent-qa/ide/claude/agents/"; return; }
    [[ -d agent-qa/agents ]] && fail "old agent-qa/agents/ still present - wrappers were not moved"
    for f in agent-qa/ide/claude/agents/*.md; do
        # EVERY path the wrapper names is resolved, not just the first. With
        # `head -1` a wrapper deferring to two roles was only ever validated on
        # one of them, so the second could name a file that does not exist --
        # and the CLAUDE.md mapping table drifted from a two-role wrapper
        # without anything noticing.
        named=0
        while read -r target; do
            [[ -n "$target" ]] || continue
            named=$((named + 1))
            if [[ -e "$target" ]]; then
                pass "$(basename "$f") defers to $target"
            else
                fail "$(basename "$f") defers to a path that does not exist: $target"
            fi
        done < <(grep -oE 'agent-qa/(roles|rules|formats)/[a-z/-]+(\.md)?' "$f" | sort -u)
        (( named > 0 )) || fail "$(basename "$f") names no role, rule or format to defer to"
        (( $(wc -l < "$f") <= 25 )) || fail "$(basename "$f") is not a thin wrapper ($(wc -l < "$f") lines)"
        # The installers' stale-agent removal keeps a wrapper only when this
        # marker is present on a single line. Line-wrapping it makes an update
        # delete the wrapper as though it were a pre-refactor fat agent.
        grep -q 'single source of truth' "$f" \
            || fail "$(basename "$f") lacks the 'single source of truth' marker on one line"
    done
}

check_todo_policy_guarded() {
    echo "== the provenance no-TODO rule survives in both its homes =="
    local f
    for f in agent-qa/commands/generate-playwright-tests/3-generate-page-objects.md \
             agent-qa/roles/playwright-authoring.md; do
        if grep -q 'Source Snapshot' "$f" && grep -qi 'no TODO\|NO TODO comment' "$f"; then
            pass "$(basename "$f") states the provenance no-TODO rule"
        else
            fail "$(basename "$f") lost the provenance no-TODO rule"
        fi
    done
}

check_role_refs_resolve() {
    echo "== every @agent-qa/roles reference resolves =="
    local ref path found=0
    while read -r ref; do
        found=1
        path="${ref#@}"
        [[ -f "$path" ]] && pass "$path" || fail "role reference not found: $path"
    done < <(grep -rhoE '@agent-qa/roles/[a-z-]+\.md' agent-qa/commands/ | sort -u)
    (( found == 0 )) && fail "no role references found in any command — the refactor is not wired"
    return 0
}

# Assert that a script both DEFINES a routine and CALLS it, looking only at
# code -- every comment line is stripped before either grep runs.
#
# This exists because the previous form of check_roles_installed greped the
# installers for the bare string 'roles'. It reported "project-install.sh syncs
# roles" while install_roles() and its call site had been deleted outright:
# leftover comments and log strings matched, so an installer that shipped ZERO
# roles -- silently breaking every refactored command -- kept the harness green.
# A guard that cannot fail is worse than no guard, so nothing here may match
# prose.
assert_defines_and_calls() {
    local script="$1" def_re="$2" call_re="$3" label="$4"
    local code have_def=0 have_call=0
    if [[ ! -f "$script" ]]; then
        fail "$script is missing, so it cannot define or call $label"
        return
    fi
    code="$(grep -v '^[[:space:]]*#' "$script")"
    grep -qE "$def_re" <<< "$code" && have_def=1
    grep -qE "$call_re" <<< "$code" && have_call=1
    if (( have_def == 1 && have_call == 1 )); then
        pass "$(basename "$script") defines and calls $label"
    elif (( have_def == 0 && have_call == 0 )); then
        fail "$(basename "$script") neither defines nor calls $label"
    elif (( have_def == 0 )); then
        fail "$(basename "$script") calls $label but no longer defines it"
    else
        fail "$(basename "$script") defines $label but never calls it"
    fi
}

# Assert a string appears in $script as code rather than in a comment.
#
# The comment-stripped text is captured into a variable rather than piped
# straight into `grep -q`. This file runs under `pipefail`, and `grep -q` exits
# the moment it matches -- which SIGPIPEs the upstream `grep -v` whenever the
# match is early in a long file, making the whole pipeline report failure on a
# string that is plainly there. Piping here produces a check that fails at
# random depending on where in the file the match happens to sit.
assert_code_contains() {
    local script="$1" re="$2" message="$3" code
    if [[ ! -f "$script" ]]; then
        fail "$script is missing"
        return
    fi
    code="$(grep -v '^[[:space:]]*#' "$script")"
    if grep -qE "$re" <<< "$code"; then
        pass "$message"
    else
        fail "$(basename "$script"): $message -- not found outside comments"
    fi
}

# Assert that $script calls something from INSIDE the body of a named routine,
# not merely somewhere in the file. Comments are stripped, as everywhere else.
#
# A file-wide grep cannot tell "called for every install" from "called only
# inside the Claude branch". That distinction was the bug: remove_stale_agents
# was reachable only from Claude-specific code, so a --ide copilot project kept
# all eleven superseded fat agents in the IDE-neutral agent-qa/agents/ tree
# while the harness reported the cleanup as wired.
assert_calls_in_function() {
    local script="$1" func_re="$2" call_re="$3" message="$4" body
    if [[ ! -f "$script" ]]; then
        fail "$script is missing"
        return
    fi
    body="$(awk -v re="$func_re" '
        inside == 0 && $0 ~ re { inside = 1; next }
        inside == 1 && /^}/ { exit }
        inside == 1 { print }
    ' "$script" | grep -v '^[[:space:]]*#')"
    if [[ -z "${body//[[:space:]]/}" ]]; then
        fail "$(basename "$script"): found no body for $func_re, so $message is unverifiable"
        return
    fi
    if grep -qE "$call_re" <<< "$body"; then
        pass "$message"
    else
        fail "$(basename "$script"): $message -- not called from that routine"
    fi
}

check_roles_installed() {
    echo "== installers define and call a roles sync =="
    assert_defines_and_calls scripts/project-install.sh \
        '^[[:space:]]*install_roles\(\)' '^[[:space:]]*install_roles([[:space:]]+[^([:space:]].*)?[[:space:]]*$' install_roles
    assert_defines_and_calls scripts/project-update.sh \
        '^[[:space:]]*update_roles\(\)' '^[[:space:]]*update_roles([[:space:]]+[^([:space:]].*)?[[:space:]]*$' update_roles
    # The PowerShell names need an explicit right-hand boundary: without one,
    # `Install-Roles` matches a renamed `Install-RolesX` and the check reports
    # a definition that no longer exists under that name.
    #
    # Every call regex above also refuses a line whose first non-space
    # character after the name is `(`. Written `install_roles ()`, a
    # DEFINITION would otherwise satisfy the CALL assertion, and a routine
    # that is defined but never called would pass as wired -- vacuity
    # reintroduced by nothing more than a reformat.
    assert_defines_and_calls scripts/project-install.ps1 \
        '^[[:space:]]*function[[:space:]]+Install-Roles([[:space:]]|\{|$)' \
        '^[[:space:]]*Install-Roles([[:space:]]+[^([:space:]].*)?[[:space:]]*$' Install-Roles
    assert_defines_and_calls scripts/project-install.ps1 \
        '^[[:space:]]*function[[:space:]]+Remove-StaleAgents([[:space:]]|\{|$)' \
        '^[[:space:]]*Remove-StaleAgents([[:space:]]+[^([:space:]].*)?[[:space:]]*$' Remove-StaleAgents

    assert_code_contains scripts/common-functions.sh '^[[:space:]]*remove_stale_agents\(\)' \
        "common-functions.sh defines remove_stale_agents"
    assert_code_contains scripts/project-install.sh '^[[:space:]]*remove_stale_agents[[:space:]]' \
        "install removes superseded agent files"
    assert_code_contains scripts/project-update.sh '^[[:space:]]*remove_stale_agents[[:space:]]' \
        "update removes superseded agent files"

    # ...and it must be reachable for EVERY ide, not only for Claude projects.
    # agent-qa/agents/ is IDE-neutral, so the cleanup belongs in the main flow.
    assert_calls_in_function scripts/project-install.sh '^perform_installation\(\)' \
        '^[[:space:]]*remove_stale_agents[[:space:]]' \
        "install runs the legacy cleanup for every ide"
    assert_calls_in_function scripts/project-update.sh '^perform_update\(\)' \
        '^[[:space:]]*remove_stale_agents[[:space:]]' \
        "update runs the legacy cleanup for every ide"
    assert_calls_in_function scripts/project-install.ps1 '^function[[:space:]]+Start-ProjectInstall' \
        '^[[:space:]]*Remove-StaleAgents[[:space:]]*$' \
        "ps1 install runs the legacy cleanup for every ide"

    assert_code_contains scripts/project-install.sh 'ide/claude/agents' \
        "install reads agents from ide/claude/agents"
    assert_code_contains scripts/project-install.ps1 'ide\\claude\\agents|ide/claude/agents' \
        "ps1 install reads agents from ide/claude/agents"

    # remove_stale_agents must clean BOTH pre-refactor destinations. The old
    # installer wrote agents to .claude/agents/agent-qa/ AND to the IDE-neutral
    # agent-qa/agents/; cleaning only the first leaves the superseded fat agents
    # sitting beside agent-qa/roles/, which is the duplication this branch exists
    # to remove.
    #
    # Both halves must be asserted on CODE STRUCTURE. The previous form greped
    # common-functions.sh for the bare path 'agent-qa/agents', which two
    # print_verbose log strings satisfy on their own: a reviewer reduced the
    # `for dest` loop to the single .claude directory -- deleting the whole
    # functional change -- and this check stayed green. So assert that
    # legacy_dir is DECLARED from agent-qa/agents and that $legacy_dir is
    # actually swept by the loop. Dropping it from the loop, or renaming the
    # variable, now fails.
    assert_code_contains scripts/common-functions.sh 'for dest in .*\.claude/agents/agent-qa' \
        "remove_stale_agents sweeps .claude/agents/agent-qa/"
    assert_code_contains scripts/common-functions.sh '^[[:space:]]*local legacy_dir=.*agent-qa/agents' \
        "remove_stale_agents declares legacy_dir as agent-qa/agents/"
    assert_code_contains scripts/common-functions.sh 'for dest in .*\$legacy_dir' \
        "remove_stale_agents sweeps \$legacy_dir in the same loop"
    assert_code_contains scripts/project-install.ps1 '\.claude\\agents\\agent-qa' \
        "Remove-StaleAgents cleans .claude/agents/agent-qa/"
    assert_code_contains scripts/project-install.ps1 'agent-qa\\agents' \
        "Remove-StaleAgents cleans agent-qa/agents/"
}

check_shell_syntax() {
    echo "== every shell script parses =="
    # bash -n was documented as a manual step, and check-repo.sh is the only
    # thing anyone actually runs -- so a script broken into a syntax error
    # passed the harness. Parsing is now part of the harness.
    #
    # Like check_roles_wired, this counts what it examined. A glob that matches
    # nothing runs the loop body zero times, and a check whose body never runs
    # reports success -- the vacuous-pass failure mode this harness keeps
    # rediscovering.
    local f found=0
    for f in scripts/*.sh; do
        [[ -f "$f" ]] || continue
        found=$((found + 1))
        if bash -n "$f" 2>/dev/null; then
            pass "$(basename "$f") parses"
        else
            fail "$(basename "$f") does not parse (bash -n)"
        fi
    done
    (( found > 0 )) || fail "no shell scripts found in scripts/ - nothing was parsed"
}

check_upload_to_xray() {
    check_command_phases upload-to-xray \
        1-find-and-select-tests.md 2-classify-and-build.md \
        3-dry-run-and-confirm.md 4-upload-and-report.md
    grep -q 'execute' agent-qa/commands/upload-to-xray/3-dry-run-and-confirm.md \
        && pass "phase 3 names the --execute gate" \
        || fail "phase 3 does not mention the --execute gate"
    if grep -rq 'client_secret\|XRAY_TOKEN\|--secret' agent-qa/commands/upload-to-xray/; then
        fail "a command phase names a credential value or flag - secrets belong in the client"
    else
        pass "no phase handles a credential directly"
    fi
}

check_roles_documented() {
    echo "== documentation describes the roles layer =="
    local n
    n=$(find agent-qa/roles -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    grep -q 'agent-qa/roles/' CLAUDE.md && pass "CLAUDE.md documents roles/" || fail "CLAUDE.md does not document agent-qa/roles/"
    grep -q "$n roles" CLAUDE.md && pass "CLAUDE.md states $n roles" || fail "CLAUDE.md does not state the role count ($n)"
    grep -q 'agent-qa/roles/' USER_GUIDE.md && pass "USER_GUIDE.md documents roles/" || fail "USER_GUIDE.md does not document roles/"
}

run_checks() {
    check_shell_syntax
    check_phase_refs
    check_command_twins
    check_phase_numbering
    check_required_rules
    check_config_template_keys
    check_automation_rule_headings
    check_common_snippets
    check_healthcheck_covers_automation
    check_review_automation_code
    check_audit_framework
    check_explore_ui
    check_playwright_upgrade
    check_debug_tests
    check_refactor_framework
    check_new_deliverables_documented
    check_docs_updated
    check_write_gate_present
    check_inference_path_never_stops
    check_roles_wired
    check_role_refs_resolve
    check_wrappers_defer
    check_todo_policy_guarded
    check_roles_installed
    check_roles_documented
    check_upload_to_xray
}

run_checks

echo
if (( FAILURES > 0 )); then
    echo "check-repo: $FAILURES failure(s)"
    exit 1
fi
echo "check-repo: all checks passed"
