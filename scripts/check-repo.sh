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
    [[ -f agent-qa/agents/automation-reviewer.md ]] \
        && pass "automation-reviewer agent" || fail "missing agent: automation-reviewer.md"
}

check_audit_framework() {
    check_command_phases audit-framework \
        1-scope-and-inventory.md 2-analyze.md 3-score-and-prioritize.md 4-write-audit-report.md
    [[ -f agent-qa/agents/framework-architect.md ]] \
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
    [[ -f agent-qa/agents/ui-explorer.md ]] \
        && pass "ui-explorer agent" || fail "missing agent: ui-explorer.md"
    grep -rq 'browser_snapshot\|mcp__.*playwright' agent-qa/commands/explore-ui/ \
        && fail "explore-ui references Playwright MCP; the design is playwright-cli only" \
        || pass "explore-ui is playwright-cli only"
}

check_debug_tests() {
    check_command_phases debug-tests \
        1-select-failing-tests.md 2-reproduce.md 3-classify-failure.md \
        4-apply-allowed-fixes.md 5-verify-and-report.md
    [[ -f agent-qa/agents/playwright-debugger.md ]] \
        && pass "playwright-debugger agent" || fail "missing agent: playwright-debugger.md"
    grep -q 'waitForTimeout' agent-qa/commands/debug-tests/4-apply-allowed-fixes.md \
        && pass "debug-tests names the forbidden sleep explicitly" \
        || fail "debug-tests phase 4 must explicitly forbid waitForTimeout"
}

check_refactor_framework() {
    check_command_phases refactor-framework \
        1-load-audit-and-plan.md 2-select-phase-and-tasks.md \
        3-execute-with-validation.md 4-report-and-commit.md
    grep -q 'git stash' agent-qa/commands/refactor-framework/3-execute-with-validation.md \
        && pass "refactor-framework checkpoints before each task" \
        || fail "refactor-framework phase 3 must checkpoint with git stash before each task"
}

run_checks() {
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
}

run_checks

echo
if (( FAILURES > 0 )); then
    echo "check-repo: $FAILURES failure(s)"
    exit 1
fi
echo "check-repo: all checks passed"
