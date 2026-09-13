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
             agent-qa/rules/language-handling.md; do
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

run_checks() {
    check_phase_refs
    check_command_twins
    check_phase_numbering
    check_required_rules
    check_config_template_keys
}

run_checks

echo
if (( FAILURES > 0 )); then
    echo "check-repo: $FAILURES failure(s)"
    exit 1
fi
echo "check-repo: all checks passed"
