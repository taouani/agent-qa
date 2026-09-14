#!/usr/bin/env bash
# Proves a craft extraction was a MOVE, not a rewrite.
# Every non-blank line removed from a command's phase files since <base-sha>
# must appear in the role file it was moved to.
# Usage: bash scripts/check-extraction.sh <command-dir> <role-file> <base-sha>
set -uo pipefail

CMD_DIR=$1
ROLE_FILE=$2
BASE=$3

if [[ ! -f "$ROLE_FILE" ]]; then
    echo "FAIL: role file not found: $ROLE_FILE"
    exit 1
fi

orphans=0
while IFS= read -r line; do
    stripped="${line#-}"
    # Blank lines and pure markdown scaffolding move freely; they carry no craft.
    [[ -z "${stripped// /}" ]] && continue
    case "$stripped" in
        '## Workflow'*|'## Core Responsibilities'*|'### Step '*|'## Important Constraints'*|'## Constraints'*|'## Data Storage'*) continue ;;
    esac
    if ! grep -Fqx -- "$stripped" "$ROLE_FILE"; then
        echo "ORPHAN (removed from phase, absent from role): $stripped"
        orphans=$((orphans + 1))
    fi
done < <(git diff "$BASE" -- "$CMD_DIR" | grep '^-' | grep -v '^---')

echo
if (( orphans > 0 )); then
    echo "check-extraction: $orphans orphaned line(s) — extraction was not a clean move"
    exit 1
fi
echo "check-extraction: every removed line landed in $ROLE_FILE"
