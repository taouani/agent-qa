#!/bin/bash

# =============================================================================
# Agent QA Project Uninstall Script
# Removes Agent QA from a project's codebase
# =============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(pwd)"

# Source common functions
source "$SCRIPT_DIR/common-functions.sh"

# Defaults
DRY_RUN="false"
VERBOSE="false"
REMOVE_OUTPUTS="false"

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Remove Agent QA from the current project directory.

Options:
    --remove-outputs    Also remove generated output folders (agent-qa/YYYY-MM-DD-*)
    --dry-run           Show what would be removed without doing it
    --verbose           Show detailed output
    -h, --help          Show this help message

This script will:
1. Read installed_ides from agent-qa/config.yml
2. Remove IDE-specific folders (.claude/, .cursor/, .vscode/, .github/) created by Agent QA
3. Remove agent-qa/ core files (commands, rules, agents, framework, formats)
4. Optionally remove generated output folders

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --remove-outputs) REMOVE_OUTPUTS="true"; shift ;;
        --dry-run) DRY_RUN="true"; shift ;;
        --verbose) VERBOSE="true"; shift ;;
        -h|--help) show_help ;;
        *) print_error "Unknown option: $1"; show_help ;;
    esac
done

# Validate Agent QA is installed
if [[ ! -f "$PROJECT_DIR/agent-qa/config.yml" ]]; then
    print_error "Agent QA is not installed in this project (no agent-qa/config.yml found)"
    exit 1
fi

print_section "Agent QA Project Uninstall"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN - No files will be removed"
    echo ""
fi

# Read installed IDEs from config
INSTALLED_IDES=$(get_yaml_value "$PROJECT_DIR/agent-qa/config.yml" "installed_ides" "claude,cursor,vscode,github")

echo -e "Installed IDEs: ${YELLOW}${INSTALLED_IDES}${NC}"
echo ""

# Confirm uninstall
if [[ "$DRY_RUN" != "true" ]]; then
    read -p "Are you sure you want to uninstall Agent QA? (y/n): " -n 1 -r < /dev/tty
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Uninstall cancelled"
        exit 0
    fi
    echo ""
fi

# Remove IDE-specific directories
remove_if_exists() {
    local path=$1
    local label=$2
    if [[ -e "$path" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo "  Would remove: $path"
        else
            rm -rf "$path"
            echo "  Removed: $label"
        fi
    fi
}

print_status "Removing IDE integrations..."

IFS=',' read -ra IDES <<< "$INSTALLED_IDES"
for ide in "${IDES[@]}"; do
    ide=$(echo "$ide" | tr -d '[:space:]')
    case "$ide" in
        claude)
            remove_if_exists "$PROJECT_DIR/.claude/commands/agent-qa" ".claude/commands/agent-qa/"
            remove_if_exists "$PROJECT_DIR/.claude/rules" ".claude/rules/"
            remove_if_exists "$PROJECT_DIR/.claude/agents/agent-qa" ".claude/agents/agent-qa/"
            remove_if_exists "$PROJECT_DIR/.claude/hooks.json" ".claude/hooks.json"
            # Remove .claude/ if empty
            if [[ -d "$PROJECT_DIR/.claude" ]] && [[ -z "$(ls -A "$PROJECT_DIR/.claude" 2>/dev/null)" ]]; then
                remove_if_exists "$PROJECT_DIR/.claude" ".claude/"
            fi
            ;;
        cursor)
            remove_if_exists "$PROJECT_DIR/.cursor/rules" ".cursor/rules/"
            if [[ -d "$PROJECT_DIR/.cursor" ]] && [[ -z "$(ls -A "$PROJECT_DIR/.cursor" 2>/dev/null)" ]]; then
                remove_if_exists "$PROJECT_DIR/.cursor" ".cursor/"
            fi
            ;;
        vscode)
            remove_if_exists "$PROJECT_DIR/.vscode/settings.json" ".vscode/settings.json"
            remove_if_exists "$PROJECT_DIR/.vscode/tasks.json" ".vscode/tasks.json"
            remove_if_exists "$PROJECT_DIR/.vscode/extensions.json" ".vscode/extensions.json"
            if [[ -d "$PROJECT_DIR/.vscode" ]] && [[ -z "$(ls -A "$PROJECT_DIR/.vscode" 2>/dev/null)" ]]; then
                remove_if_exists "$PROJECT_DIR/.vscode" ".vscode/"
            fi
            ;;
        github)
            remove_if_exists "$PROJECT_DIR/.github/copilot-instructions.md" ".github/copilot-instructions.md"
            if [[ -d "$PROJECT_DIR/.github" ]] && [[ -z "$(ls -A "$PROJECT_DIR/.github" 2>/dev/null)" ]]; then
                remove_if_exists "$PROJECT_DIR/.github" ".github/"
            fi
            ;;
    esac
done

echo ""
print_status "Removing Agent QA core files..."

# Remove core directories (preserve output folders unless --remove-outputs)
for dir in commands rules agents framework formats ide; do
    remove_if_exists "$PROJECT_DIR/agent-qa/$dir" "agent-qa/$dir/"
done
remove_if_exists "$PROJECT_DIR/agent-qa/config.yml" "agent-qa/config.yml"
remove_if_exists "$PROJECT_DIR/agent-qa/config.yml.template" "agent-qa/config.yml.template"

# Remove output folders if requested
if [[ "$REMOVE_OUTPUTS" == "true" ]]; then
    echo ""
    print_status "Removing generated output folders..."
    for output_dir in "$PROJECT_DIR"/agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/; do
        if [[ -d "$output_dir" ]]; then
            remove_if_exists "$output_dir" "$(basename "$output_dir")/"
        fi
    done
fi

# Remove agent-qa/ if empty
if [[ -d "$PROJECT_DIR/agent-qa" ]] && [[ -z "$(ls -A "$PROJECT_DIR/agent-qa" 2>/dev/null)" ]]; then
    remove_if_exists "$PROJECT_DIR/agent-qa" "agent-qa/"
fi

echo ""
if [[ "$DRY_RUN" != "true" ]]; then
    print_success "Agent QA has been uninstalled from this project"
    if [[ "$REMOVE_OUTPUTS" != "true" ]]; then
        echo ""
        echo "Note: Generated output folders were preserved. Use --remove-outputs to delete them."
    fi
else
    print_status "Dry run complete. No files were removed."
fi
echo ""
