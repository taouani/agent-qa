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

