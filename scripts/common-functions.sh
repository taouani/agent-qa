#!/bin/bash

# =============================================================================
# Agent QA Common Functions
# Shared utilities for Agent QA scripts
# =============================================================================

# Colors for output
RED='\033[38;2;255;32;86m'
GREEN='\033[38;2;0;234;179m'
YELLOW='\033[38;2;255;185;0m'
BLUE='\033[38;2;0;208;255m'
PURPLE='\033[38;2;142;81;255m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Global Variables (set by scripts that source this file)
# -----------------------------------------------------------------------------
# These should be set by the calling script:
# PROJECT_DIR, DRY_RUN, VERBOSE

# -----------------------------------------------------------------------------
# Output Functions
# -----------------------------------------------------------------------------

# Print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Print section header
print_section() {
    echo ""
    print_color "$BLUE" "=== $1 ==="
    echo ""
}

# Print status message
print_status() {
    print_color "$BLUE" "$1"
}

# Print success message
print_success() {
    print_color "$GREEN" "✓ $1"
}

# Print warning message
print_warning() {
    print_color "$YELLOW" "⚠️  $1"
}

# Print error message
print_error() {
    print_color "$RED" "✗ $1"
}

# Print verbose message (only in verbose mode)
print_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[VERBOSE] $1" >&2
    fi
}

# -----------------------------------------------------------------------------
# Improved YAML Parsing Functions (More Robust)
# -----------------------------------------------------------------------------

# Get a simple value from YAML (handles key: value format)
# More robust: handles quotes, different spacing, tabs
get_yaml_value() {
    local file=$1
    local key=$2
    local default=$3

    if [[ ! -f "$file" ]]; then
        echo "$default"
        return
    fi

    # Look for the key with flexible spacing and handle quotes
    local value=$(awk -v key="$key" '
        BEGIN { found=0 }
        {
            # Normalize tabs to spaces
            gsub(/\t/, "    ")
            # Remove leading/trailing spaces
            gsub(/^[[:space:]]+/, "")
            gsub(/[[:space:]]+$/, "")
        }
        # Match key: value (with or without spaces around colon)
        $0 ~ "^" key "[[:space:]]*:" {
            # Extract value after colon
            sub("^" key "[[:space:]]*:[[:space:]]*", "")
            # Remove quotes if present
            gsub(/^["'\'']/, "")
            gsub(/["'\'']$/, "")
            # Handle empty value
            if (length($0) > 0) {
                print $0
                found=1
                exit
            }
        }
        END { if (!found) exit 1 }
    ' "$file" 2>/dev/null)

    if [[ $? -eq 0 && -n "$value" ]]; then
        echo "$value"
    else
        echo "$default"
    fi
}

# Get array values from YAML (handles - item format under a key)
# More robust: handles variable indentation
get_yaml_array() {
    local file=$1
    local key=$2

    if [[ ! -f "$file" ]]; then
        return
    fi

    awk -v key="$key" '
        BEGIN {
            found=0
            key_indent=-1
            array_indent=-1
        }
        {
            # Normalize tabs to spaces
            gsub(/\t/, "    ")

            # Get current line indentation
            indent = match($0, /[^ ]/)
            if (indent == 0) indent = length($0) + 1
            indent = indent - 1

            # Store original line for processing
            line = $0
            # Remove leading spaces for pattern matching
            gsub(/^[[:space:]]+/, "")
        }

        # Found the key
        !found && $0 ~ "^" key "[[:space:]]*:" {
            found = 1
            key_indent = indent
            next
        }

        # Process array items under the key
        found {
            # If we hit a line with same or less indentation as key, stop
            if (indent <= key_indent && $0 != "" && $0 !~ /^[[:space:]]*$/) {
                exit
            }

            # Look for array items (- item)
            if ($0 ~ /^-[[:space:]]/) {
                # Set array indent from first item
                if (array_indent == -1) {
                    array_indent = indent
                }

                # Only process items at the expected indentation
                if (indent == array_indent) {
                    sub(/^-[[:space:]]*/, "")
                    # Remove quotes if present
                    gsub(/^["'\'']/, "")
                    gsub(/["'\'']$/, "")
                    print
                }
            }
        }
    ' "$file"
}

# Write a YAML value to a file (creates or updates)
write_yaml_value() {
    local file=$1
    local key=$2
    local value=$3

    if [[ ! -f "$file" ]]; then
        # Create new file with the key-value pair
        echo "$key: $value" > "$file"
        return
    fi

    # Check if key exists in file
    if grep -q "^[[:space:]]*${key}[[:space:]]*:" "$file"; then
        # Update existing key
        if [[ "$(uname)" == "Darwin" ]]; then
            # macOS uses BSD sed
            sed -i '' "s|^[[:space:]]*${key}[[:space:]]*:.*|${key}: ${value}|" "$file"
        else
            # Linux uses GNU sed
            sed -i "s|^[[:space:]]*${key}[[:space:]]*:.*|${key}: ${value}|" "$file"
        fi
    else
        # Append new key-value pair
        echo "$key: $value" >> "$file"
    fi
}

# -----------------------------------------------------------------------------
# File Operations Functions
# -----------------------------------------------------------------------------

# Create directory if it doesn't exist (unless in dry-run mode)
ensure_dir() {
    local dir=$1

    if [[ "$DRY_RUN" == "true" ]]; then
        if [[ ! -d "$dir" ]]; then
            print_verbose "Would create directory: $dir"
        fi
    else
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            print_verbose "Created directory: $dir"
        fi
    fi
}

# Copy file with dry-run support
copy_file() {
    local source=$1
    local dest=$2

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "$dest"
    else
        ensure_dir "$(dirname "$dest")"
        cp "$source" "$dest"
        print_verbose "Copied: $source -> $dest"
        echo "$dest"
    fi
}

# Write content to file with dry-run support
write_file() {
    local content=$1
    local dest=$2

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "$dest"
    else
        ensure_dir "$(dirname "$dest")"
        echo "$content" > "$dest"
        print_verbose "Wrote file: $dest"
    fi
}

# Check if file should be skipped during update
should_skip_file() {
    local file=$1
    local overwrite_all=$2
    local overwrite_type=$3
    local file_type=$4

    if [[ "$overwrite_all" == "true" ]]; then
        return 1  # Don't skip
    fi

    if [[ ! -f "$file" ]]; then
        return 1  # Don't skip - file doesn't exist
    fi

    # Check specific overwrite flags
    case "$file_type" in
        "command")
            [[ "$overwrite_type" == "true" ]] && return 1
            ;;
        "workflow")
            [[ "$overwrite_type" == "true" ]] && return 1
            ;;
        "standard")
            [[ "$overwrite_type" == "true" ]] && return 1
            ;;
        "framework")
            [[ "$overwrite_type" == "true" ]] && return 1
            ;;
    esac

    return 0  # Skip file
}

# -----------------------------------------------------------------------------
# Version Functions
# -----------------------------------------------------------------------------

# Get version from config file
get_version() {
    local config_file=$1
    get_yaml_value "$config_file" "version" "1.0.0"
}

# -----------------------------------------------------------------------------
# Configuration Functions
# -----------------------------------------------------------------------------

# Get project configuration value
get_project_config() {
    local project_dir=$1
    local key=$2
    local default=$3

    local config_file="$project_dir/agent-qa/config.yml"
    get_yaml_value "$config_file" "$key" "$default"
}

# Check if agent-qa is installed in project
is_agent_qa_installed() {
    local project_dir=$1

    if [[ -f "$project_dir/agent-qa/config.yml" ]]; then
        return 0
    else
        return 1
    fi
}

# Backfill automation config keys into an existing config.yml.
# Projects installed before the live-automation feature was added never had
# these keys written by their original install, and the update path below
# only rewrites a handful of known keys. This appends any of the five keys
# that are missing, using the same defaults as config.yml.template. It never
# touches a key that is already present (whatever its value), and is safe to
# run repeatedly - already-present keys are left exactly as they are.
backfill_automation_config() {
    local config_file=$1

    [[ -f "$config_file" ]] || return

    if ! grep -q "^playwright_project_root[[:space:]]*:" "$config_file"; then
        printf '\nplaywright_project_root: ""\n' >> "$config_file"
        print_verbose "Added missing config key: playwright_project_root"
    fi

    if ! grep -q "^browser_cli_command[[:space:]]*:" "$config_file"; then
        printf 'browser_cli_command: "playwright-cli"\n' >> "$config_file"
        print_verbose "Added missing config key: browser_cli_command"
    fi

    if ! grep -q "^automation[[:space:]]*:[[:space:]]*$" "$config_file"; then
        {
            printf '\n'
            printf 'automation:\n'
            printf '  allow_source_edits: false      # Master switch. While false, all commands are report-only and never write outside agent-qa/.\n'
            printf '  auth_state_ttl_minutes: 60     # Reuse a saved browser auth state younger than this.\n'
            printf '  stability_runs: 3              # Consecutive passing runs required before a fix is considered stable.\n'
        } >> "$config_file"
        print_verbose "Added missing config block: automation"
        return
    fi

    # automation: already exists - append only the sub-keys that are missing,
    # right after the automation: line, without touching existing sub-keys.
    local -a missing_lines=()
    grep -q "^[[:space:]]\+allow_source_edits[[:space:]]*:" "$config_file" \
        || missing_lines+=("  allow_source_edits: false      # Master switch. While false, all commands are report-only and never write outside agent-qa/.")
    grep -q "^[[:space:]]\+auth_state_ttl_minutes[[:space:]]*:" "$config_file" \
        || missing_lines+=("  auth_state_ttl_minutes: 60     # Reuse a saved browser auth state younger than this.")
    grep -q "^[[:space:]]\+stability_runs[[:space:]]*:" "$config_file" \
        || missing_lines+=("  stability_runs: 3              # Consecutive passing runs required before a fix is considered stable.")

    if [[ ${#missing_lines[@]} -gt 0 ]]; then
        local tmp_file inserted=0 line add
        tmp_file="$(mktemp)"
        while IFS= read -r line || [[ -n "$line" ]]; do
            printf '%s\n' "$line" >> "$tmp_file"
            if [[ $inserted -eq 0 && "$line" =~ ^automation:[[:space:]]*$ ]]; then
                for add in "${missing_lines[@]}"; do
                    printf '%s\n' "$add" >> "$tmp_file"
                done
                inserted=1
            fi
        done < "$config_file"
        mv "$tmp_file" "$config_file"
        print_verbose "Added missing automation sub-key(s)"
    fi
}

# Create or update agent-qa config.yml
# Preserves existing settings when updating
create_or_update_config() {
    local project_dir=$1
    local repository_platform=$2
    local repository_project_id=$3
    local azure_devops_cloud_id=${4:-""}
    local config_file="$project_dir/agent-qa/config.yml"
    local template_file="$project_dir/agent-qa/config.yml.template"
    
    # If template doesn't exist in project, use source template (for initial installation)
    if [[ ! -f "$template_file" ]]; then
        # Try to find template in source location (where installation script is running from)
        local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        template_file="$script_dir/../agent-qa/config.yml.template"
    fi

    if [[ -f "$config_file" ]]; then
        # Update existing config - preserve existing values unless new ones provided
        local existing_version=$(get_yaml_value "$config_file" "version" "1.0.0")
        local existing_repo_platform=$(get_yaml_value "$config_file" "repository_platform" "")
        local existing_repo_project_id=$(get_yaml_value "$config_file" "repository_project_id" "")
        local existing_cloud_id=$(get_yaml_value "$config_file" "azure_devops_cloud_id" "")

        # Use provided values or keep existing
        local final_repo_platform=${repository_platform:-$existing_repo_platform}
        local final_repo_project_id=${repository_project_id:-$existing_repo_project_id}
        local final_cloud_id=${azure_devops_cloud_id:-$existing_cloud_id}

        # Update config file
        write_yaml_value "$config_file" "version" "$existing_version"
        write_yaml_value "$config_file" "last_installed" "$(date '+%Y-%m-%d %H:%M:%S')"
        write_yaml_value "$config_file" "repository_platform" "$final_repo_platform"
        write_yaml_value "$config_file" "repository_project_id" "$final_repo_project_id"
        if [[ -n "$final_cloud_id" ]] || [[ -n "$azure_devops_cloud_id" ]]; then
            write_yaml_value "$config_file" "azure_devops_cloud_id" "$final_cloud_id"
        fi

        print_verbose "Updated existing config.yml"

        # Backfill automation keys that did not exist when this project was
        # first installed. Only adds missing keys; never rewrites existing ones.
        backfill_automation_config "$config_file"
    else
        # Create new config from template
        if [[ -f "$template_file" ]]; then
            # Read template and replace placeholders
            local config_content=$(cat "$template_file")
            config_content=$(echo "$config_content" | sed "s|last_installed:.*|last_installed: $(date '+%Y-%m-%d %H:%M:%S')|")
            config_content=$(echo "$config_content" | sed "s|repository_platform:.*|repository_platform: ${repository_platform:-gitlab}|")
            config_content=$(echo "$config_content" | sed "s|repository_project_id:.*|repository_project_id: \"${repository_project_id}\"|")
            if [[ -n "$azure_devops_cloud_id" ]]; then
                config_content=$(echo "$config_content" | sed "s|azure_devops_cloud_id:.*|azure_devops_cloud_id: \"$azure_devops_cloud_id\"|")
            fi

            write_file "$config_content" "$config_file"
            print_verbose "Created new config.yml from template"
        else
            # Create minimal config if template not found
            local config_content="version: 1.0.0
last_installed: $(date '+%Y-%m-%d %H:%M:%S')

repository_platform: ${repository_platform:-gitlab}
repository_project_id: \"${repository_project_id}\""
            if [[ -n "$azure_devops_cloud_id" ]]; then
                config_content="$config_content
azure_devops_cloud_id: \"$azure_devops_cloud_id\""
            fi
            write_file "$config_content" "$config_file"
            print_verbose "Created minimal config.yml"
        fi
    fi
}


# -----------------------------------------------------------------------------
# Remove stale agent files superseded by the thin Claude wrappers.
#
# The craft that used to live inside each agent now lives in agent-qa/roles/,
# and the agents shipped in .claude/agents/agent-qa/ are thin wrappers that
# defer to it. An install or update copies files in but never deletes files
# that vanished upstream, so a project installed before that refactor would
# keep the old fat agent beside the new wrapper.
#
# The pre-refactor installer wrote the fat agents to TWO destinations:
# .claude/agents/agent-qa/ AND the IDE-neutral $PROJECT_DIR/agent-qa/agents/.
# Both must be cleaned. Cleaning only the first leaves the eleven superseded
# agents sitting next to agent-qa/roles/ in the tree every IDE reads, so a
# Copilot or Codex user browsing it finds two competing bodies of craft --
# exactly the duplication this refactor exists to remove.
#
# Listed by exact name: a user's own agents live in these directories too and
# must never be touched. The marker grep means only the old fat form is removed
# -- a wrapper already carrying the marker is left alone, which makes this
# idempotent and safe to run on an already-migrated project.
#
# Usage: remove_stale_agents <project_dir>
# -----------------------------------------------------------------------------
remove_stale_agents() {
    local project_dir="$1"
    local legacy_dir="$project_dir/agent-qa/agents"

    # Three conditions must all hold before a file is deleted, in EITHER
    # directory: the name is on the list below, the marker is absent, and the
    # file is over 20 lines.
    #
    # The line count is a second, reflow-immune signal. The marker check alone
    # already misfired once -- two wrappers line-wrapped "single source of
    # truth", and a line-oriented grep read them as pre-refactor agents. Any
    # future reformatting would re-arm that bug, and its failure mode is
    # deleting a file the user can see. Thin wrappers run 14-16 lines, the
    # smallest fat agent was 23, so 20 sits cleanly in the gap.
    local dest name file lines
    for dest in "$project_dir/.claude/agents/agent-qa" "$legacy_dir"; do
        [[ -d "$dest" ]] || continue
        for name in requirements-analyst test-case-generator gherkin-writer playwright-generator \
                    confluence-publisher api-test-generator accessibility-tester \
                    ui-explorer playwright-debugger automation-reviewer framework-architect; do
            file="$dest/$name.md"
            [[ -f "$file" ]] || continue
            lines=$(wc -l < "$file")
            if ! grep -q 'single source of truth' "$file" && (( lines > 20 )); then
                rm -f "$file"
                print_verbose "Removed superseded agent: $file"
            fi
        done
    done

    # agent-qa/agents/ is retired outright by the refactor, so drop the
    # directory once the superseded files are gone -- but ONLY when rmdir
    # succeeds, which is to say only when it is empty. Never recursively and
    # never conditionally-forced: a user may have left their own file in there,
    # and an empty directory is a cosmetic wart while deleting someone's file
    # is not recoverable.
    if [[ -d "$legacy_dir" ]]; then
        if rmdir "$legacy_dir" 2>/dev/null; then
            print_verbose "Removed empty legacy directory: agent-qa/agents/"
        else
            print_verbose "Kept agent-qa/agents/ - it is not empty"
        fi
    fi
    return 0
}

# -----------------------------------------------------------------------------
# Xray Credentials Gitignore
#
# agent-qa/.xray-credentials holds the Jira/Xray secrets the upload-to-xray
# command reads. They must never be committed and never live in config.yml,
# so every install/update run makes sure the project's .gitignore excludes
# that path.
#
# Idempotent: the exact line is checked for before anything is written, so
# running this any number of times leaves exactly one copy of the entry.
# Never overwrites an existing .gitignore -- only appends -- and if the file's
# last line has no trailing newline, one is added first so that line is not
# corrupted by the append. Creates .gitignore if the project has none.
#
# Usage: ensure_xray_credentials_gitignored <project_dir>
# -----------------------------------------------------------------------------
ensure_xray_credentials_gitignored() {
    local project_dir="$1"
    local gitignore_file="$project_dir/.gitignore"
    local entry="agent-qa/.xray-credentials"

    if [[ -f "$gitignore_file" ]] && grep -qxF "$entry" "$gitignore_file"; then
        if [[ "$DRY_RUN" != "true" ]]; then
            echo "✓ .gitignore already excludes $entry"
        fi
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        print_verbose "Would add $entry to .gitignore"
        return 0
    fi

    if [[ -f "$gitignore_file" ]]; then
        # A file with content whose last byte is not a newline would otherwise
        # have that last line corrupted by the appended entry landing on the
        # same line.
        if [[ -s "$gitignore_file" ]] && [[ -n "$(tail -c1 "$gitignore_file")" ]]; then
            printf '\n' >> "$gitignore_file"
        fi
        printf '%s\n' "$entry" >> "$gitignore_file"
    else
        printf '%s\n' "$entry" > "$gitignore_file"
    fi

    # Verify the write took effect rather than assuming it did.
    if grep -qxF "$entry" "$gitignore_file"; then
        echo "✓ Added $entry to .gitignore"
        return 0
    fi
    print_warning "Failed to add $entry to .gitignore -- add it manually"
    return 1
}
