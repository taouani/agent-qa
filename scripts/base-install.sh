#!/usr/bin/env bash
# Agent-QA v1 moved to the v1 branch. This stub keeps the old master URL working.
set -euo pipefail
echo "Note: Agent-QA v1 now installs from the v1 branch. Forwarding..." >&2
curl -sSfL https://raw.githubusercontent.com/taouani/agent-qa/v1/scripts/base-install.sh | bash -s -- "$@"
