#!/bin/bash

# =============================================================================
# Agent QA Project Update Script
# Updates Agent QA installation in a project
# =============================================================================

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BASE_DIR="$HOME/agent-qa"
PROJECT_DIR="$(pwd)"

# Source common functions
source "$SCRIPT_DIR/common-functions.sh"

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------

DRY_RUN="false"
VERBOSE="false"
REPOSITORY_PLATFORM=""
REPOSITORY_PROJECT_ID=""
AZURE_DEVOPS_CLOUD_ID=""
OVERWRITE_ALL="false"
OVERWRITE_COMMANDS="false"
OVERWRITE_WORKFLOWS="false"
OVERWRITE_STANDARDS="false"
OVERWRITE_FRAMEWORK="false"
SKIPPED_FILES=()
UPDATED_FILES=()
NEW_FILES=()

# -----------------------------------------------------------------------------
# Help Function
# -----------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Update Agent QA installation in the current project directory.

Options:
    --repository-platform PLATFORM      Update repository platform (gitlab, github, azure-devops)
    --repository-project-id ID          Update repository project ID
    --azure-devops-cloud-id ID           Update Azure DevOps cloud ID
    --overwrite-all                      Overwrite all existing files
    --overwrite-commands                 Overwrite existing command files
    --overwrite-workflows                Overwrite existing workflow files
    --overwrite-standards                Overwrite existing standards files
    --overwrite-framework                Overwrite existing framework files
    --dry-run                            Show what would be done without doing it
    --verbose                            Show detailed output
    -h, --help                           Show this help message

Examples:
    $0
    $0 --overwrite-commands
    $0 --repository-platform github --dry-run --verbose

EOF
    exit 0
}

# -----------------------------------------------------------------------------
# Parse Command Line Arguments
# -----------------------------------------------------------------------------

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --repository-platform)
                REPOSITORY_PLATFORM="$2"
                shift 2
                ;;
            --repository-project-id)
                REPOSITORY_PROJECT_ID="$2"
                shift 2
                ;;
            --azure-devops-cloud-id)
                AZURE_DEVOPS_CLOUD_ID="$2"
                shift 2
                ;;
            --overwrite-all)
                OVERWRITE_ALL="true"
                shift
                ;;
            --overwrite-commands)
                OVERWRITE_COMMANDS="true"
                shift
                ;;
            --overwrite-workflows)
                OVERWRITE_WORKFLOWS="true"
                shift
                ;;
            --overwrite-standards)
                OVERWRITE_STANDARDS="true"
                shift
                ;;
            --overwrite-framework)
                OVERWRITE_FRAMEWORK="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            -h|--help)
                show_help
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                ;;
        esac
    done
}

# -----------------------------------------------------------------------------
# Validation Functions
# -----------------------------------------------------------------------------

validate_installations() {
    # Check base installation
    if [[ ! -d "$BASE_DIR" ]]; then
        print_error "Agent QA base installation not found at ~/agent-qa/"
        echo ""
        print_status "Please run the base installation first:"
        echo "  curl -sSL ${REPO_URL:-https://github.com/YOUR_USERNAME/agent-qa}/raw/master/scripts/base-install.sh | bash"
        echo ""
        exit 1
    fi

    # Check project installation
    if [[ ! -f "$PROJECT_DIR/agent-qa/config.yml" ]]; then
        print_error "Agent QA not installed in this project"
        echo ""
        print_status "Please run project-install.sh first"
        exit 1
    fi

    print_verbose "Project installation found at: $PROJECT_DIR/agent-qa"
}

# Check if current directory is the base installation directory
check_not_base_installation() {
    if [[ "$PROJECT_DIR" == "$BASE_DIR" ]]; then
        echo ""
        print_error "Cannot update Agent QA in base installation directory"
        echo ""
        echo "It appears you are in the location of your Agent QA base installation."
        echo "To update Agent QA in a project, navigate to your project's root folder:"
        echo ""
        echo "  cd path/to/project"
        echo ""
        echo "And then run:"
        echo ""
        echo "  ~/agent-qa/scripts/project-update.sh"
        echo ""
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Configuration Functions
# -----------------------------------------------------------------------------

load_configurations() {
    # Load project configuration
    local project_config="$PROJECT_DIR/agent-qa/config.yml"
    if [[ -f "$project_config" ]]; then
        PROJECT_VERSION=$(get_yaml_value "$project_config" "version" "1.0.0")
        PROJECT_REPOSITORY_PLATFORM=$(get_yaml_value "$project_config" "repository_platform" "")
        PROJECT_REPOSITORY_PROJECT_ID=$(get_yaml_value "$project_config" "repository_project_id" "")
        PROJECT_AZURE_DEVOPS_CLOUD_ID=$(get_yaml_value "$project_config" "azure_devops_cloud_id" "")
    else
        PROJECT_VERSION="1.0.0"
        PROJECT_REPOSITORY_PLATFORM=""
        PROJECT_REPOSITORY_PROJECT_ID=""
        PROJECT_AZURE_DEVOPS_CLOUD_ID=""
    fi

    # Load base version
    local base_config="$BASE_DIR/config.yml"
    if [[ -f "$base_config" ]]; then
        BASE_VERSION=$(get_yaml_value "$base_config" "version" "1.0.0")
    else
        BASE_VERSION="1.0.0"
    fi

    # Use provided values or keep existing
    EFFECTIVE_REPOSITORY_PLATFORM="${REPOSITORY_PLATFORM:-$PROJECT_REPOSITORY_PLATFORM}"
    EFFECTIVE_REPOSITORY_PROJECT_ID="${REPOSITORY_PROJECT_ID:-$PROJECT_REPOSITORY_PROJECT_ID}"
    EFFECTIVE_AZURE_DEVOPS_CLOUD_ID="${AZURE_DEVOPS_CLOUD_ID:-$PROJECT_AZURE_DEVOPS_CLOUD_ID}"

    print_verbose "Project configuration:"
    print_verbose "  Version: $PROJECT_VERSION"
    print_verbose "  Repository platform: $PROJECT_REPOSITORY_PLATFORM"
    print_verbose "  Repository project ID: $PROJECT_REPOSITORY_PROJECT_ID"
    print_verbose "  Azure DevOps cloud ID: $PROJECT_AZURE_DEVOPS_CLOUD_ID"

    print_verbose "Base configuration:"
    print_verbose "  Version: $BASE_VERSION"

    print_verbose "Effective configuration:"
    print_verbose "  Repository platform: $EFFECTIVE_REPOSITORY_PLATFORM"
    print_verbose "  Repository project ID: $EFFECTIVE_REPOSITORY_PROJECT_ID"
    print_verbose "  Azure DevOps cloud ID: $EFFECTIVE_AZURE_DEVOPS_CLOUD_ID"
}

# -----------------------------------------------------------------------------
# Update Functions
# -----------------------------------------------------------------------------

# Update command files
update_commands() {
    print_status "Updating command files"

    local commands_updated=0
    local commands_skipped=0
    local commands_new=0
    local source_commands_dir="$BASE_DIR/agent-qa/commands"
    local dest_commands_dir="$PROJECT_DIR/agent-qa/commands"

    if [[ ! -d "$source_commands_dir" ]]; then
        print_warning "Source commands directory not found - skipping"
        return
    fi

    if [[ -d "$source_commands_dir" ]]; then
        find "$source_commands_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_commands_dir/}"
            local dest_file="$dest_commands_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_COMMANDS" "command"; then
                SKIPPED_FILES+=("$dest_file")
                ((commands_skipped++)) || true
                print_verbose "Skipped: $relative_path"
            else
                if [[ -f "$dest_file" ]]; then
                    UPDATED_FILES+=("$dest_file")
                    ((commands_updated++)) || true
                    print_verbose "Updated: $relative_path"
                else
                    NEW_FILES+=("$dest_file")
                    ((commands_new++)) || true
                    print_verbose "New file: $relative_path"
                fi
                if [[ "$DRY_RUN" != "true" ]]; then
                    copy_file "$source_file" "$dest_file" > /dev/null
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $commands_new -gt 0 ]]; then
            echo "✓ Added $commands_new command files"
        fi
        if [[ $commands_updated -gt 0 ]]; then
            echo "✓ Updated $commands_updated command files"
        fi
        if [[ $commands_skipped -gt 0 ]]; then
            echo -e "${YELLOW}$commands_skipped command files were not updated. To update these, re-run with --overwrite-commands flag.${NC}"
        fi
    fi
}

# Update workflow files
update_workflows() {
    local source_workflows_dir="$BASE_DIR/agent-qa/workflows"
    local dest_workflows_dir="$PROJECT_DIR/agent-qa/workflows"

    if [[ ! -d "$source_workflows_dir" ]]; then
        print_verbose "No workflows directory found - skipping"
        return
    fi

    print_status "Updating workflow files"

    local workflows_updated=0
    local workflows_skipped=0
    local workflows_new=0

    if [[ -d "$source_workflows_dir" ]]; then
        find "$source_workflows_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_workflows_dir/}"
            local dest_file="$dest_workflows_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_WORKFLOWS" "workflow"; then
                SKIPPED_FILES+=("$dest_file")
                ((workflows_skipped++)) || true
                print_verbose "Skipped: $relative_path"
            else
                if [[ -f "$dest_file" ]]; then
                    UPDATED_FILES+=("$dest_file")
                    ((workflows_updated++)) || true
                    print_verbose "Updated: $relative_path"
                else
                    NEW_FILES+=("$dest_file")
                    ((workflows_new++)) || true
                    print_verbose "New file: $relative_path"
                fi
                if [[ "$DRY_RUN" != "true" ]]; then
                    copy_file "$source_file" "$dest_file" > /dev/null
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $workflows_new -gt 0 ]]; then
            echo "✓ Added $workflows_new workflow files"
        fi
        if [[ $workflows_updated -gt 0 ]]; then
            echo "✓ Updated $workflows_updated workflow files"
        fi
        if [[ $workflows_skipped -gt 0 ]]; then
            echo -e "${YELLOW}$workflows_skipped workflow files were not updated. To update these, re-run with --overwrite-workflows flag.${NC}"
        fi
    fi
}

# Update standards files
update_standards() {
    local source_standards_dir="$BASE_DIR/agent-qa/standards"
    local dest_standards_dir="$PROJECT_DIR/agent-qa/standards"

    if [[ ! -d "$source_standards_dir" ]]; then
        print_verbose "No standards directory found - skipping"
        return
    fi

    print_status "Updating standards files"

    local standards_updated=0
    local standards_skipped=0
    local standards_new=0

    if [[ -d "$source_standards_dir" ]]; then
        find "$source_standards_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_standards_dir/}"
            local dest_file="$dest_standards_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_STANDARDS" "standard"; then
                SKIPPED_FILES+=("$dest_file")
                ((standards_skipped++)) || true
                print_verbose "Skipped: $relative_path"
            else
                if [[ -f "$dest_file" ]]; then
                    UPDATED_FILES+=("$dest_file")
                    ((standards_updated++)) || true
                    print_verbose "Updated: $relative_path"
                else
                    NEW_FILES+=("$dest_file")
                    ((standards_new++)) || true
                    print_verbose "New file: $relative_path"
                fi
                if [[ "$DRY_RUN" != "true" ]]; then
                    copy_file "$source_file" "$dest_file" > /dev/null
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $standards_new -gt 0 ]]; then
            echo "✓ Added $standards_new standards files"
        fi
        if [[ $standards_updated -gt 0 ]]; then
            echo "✓ Updated $standards_updated standards files"
        fi
        if [[ $standards_skipped -gt 0 ]]; then
            echo -e "${YELLOW}$standards_skipped standards files were not updated. To update these, re-run with --overwrite-standards flag.${NC}"
        fi
    fi
}

# Update framework files
update_framework() {
    local source_framework_dir="$BASE_DIR/agent-qa/framework"
    local dest_framework_dir="$PROJECT_DIR/agent-qa/framework"

    if [[ ! -d "$source_framework_dir" ]]; then
        print_verbose "No framework directory found - skipping"
        return
    fi

    print_status "Updating framework files"

    local framework_updated=0
    local framework_skipped=0
    local framework_new=0

    if [[ -d "$source_framework_dir" ]]; then
        find "$source_framework_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_framework_dir/}"
            local dest_file="$dest_framework_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_FRAMEWORK" "framework"; then
                SKIPPED_FILES+=("$dest_file")
                ((framework_skipped++)) || true
                print_verbose "Skipped: $relative_path"
            else
                if [[ -f "$dest_file" ]]; then
                    UPDATED_FILES+=("$dest_file")
                    ((framework_updated++)) || true
                    print_verbose "Updated: $relative_path"
                else
                    NEW_FILES+=("$dest_file")
                    ((framework_new++)) || true
                    print_verbose "New file: $relative_path"
                fi
                if [[ "$DRY_RUN" != "true" ]]; then
                    copy_file "$source_file" "$dest_file" > /dev/null
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $framework_new -gt 0 ]]; then
            echo "✓ Added $framework_new framework files"
        fi
        if [[ $framework_updated -gt 0 ]]; then
            echo "✓ Updated $framework_updated framework files"
        fi
        if [[ $framework_skipped -gt 0 ]]; then
            echo -e "${YELLOW}$framework_skipped framework files were not updated. To update these, re-run with --overwrite-framework flag.${NC}"
        fi
    fi
}

# Update .claude/commands/agent-qa/ files for Claude Code/Cursor IDE recognition (optional)
update_claude_commands() {
    # This is optional and only needed for Claude Code/Cursor IDE
    # Other IDEs can reference commands directly from agent-qa/commands/
    
    local source_claude_dir="$BASE_DIR/.claude/commands/agent-qa"
    local dest_claude_dir="$PROJECT_DIR/.claude/commands/agent-qa"

    # Check if source .claude directory exists (might not exist in base installation)
    if [[ ! -d "$source_claude_dir" ]]; then
        # Try to find it in the repository root (for local installations)
        local repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
        if [[ -d "$repo_root/.claude/commands/agent-qa" ]]; then
            source_claude_dir="$repo_root/.claude/commands/agent-qa"
        else
            # Not an error - .claude/commands/ is optional and IDE-specific
            print_verbose "No .claude/commands/agent-qa directory found - skipping (optional for Claude Code/Cursor IDE only)"
            return
        fi
    fi

    if [[ ! -d "$source_claude_dir" ]]; then
        print_verbose "No IDE command files found - skipping (optional)"
        return
    fi

    print_status "Updating Claude Code/Cursor IDE command files (optional)"

    local claude_commands_updated=0
    local claude_commands_skipped=0
    local claude_commands_new=0

    ensure_dir "$dest_claude_dir"

    if [[ -d "$source_claude_dir" ]]; then
        find "$source_claude_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_claude_dir/}"
            local dest_file="$dest_claude_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_COMMANDS" "command"; then
                SKIPPED_FILES+=("$dest_file")
                ((claude_commands_skipped++)) || true
                print_verbose "Skipped: $relative_path"
            else
                if [[ -f "$dest_file" ]]; then
                    UPDATED_FILES+=("$dest_file")
                    ((claude_commands_updated++)) || true
                    print_verbose "Updated: $relative_path"
                else
                    NEW_FILES+=("$dest_file")
                    ((claude_commands_new++)) || true
                    print_verbose "New file: $relative_path"
                fi
                if [[ "$DRY_RUN" != "true" ]]; then
                    copy_file "$source_file" "$dest_file" > /dev/null
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $claude_commands_new -gt 0 ]]; then
            echo "✓ Added $claude_commands_new IDE command files"
        fi
        if [[ $claude_commands_updated -gt 0 ]]; then
            echo "✓ Updated $claude_commands_updated IDE command files"
        fi
        if [[ $claude_commands_skipped -gt 0 ]]; then
            echo -e "${YELLOW}$claude_commands_skipped IDE command files were not updated. To update these, re-run with --overwrite-commands flag.${NC}"
        fi
    fi
}

# Update agent-qa folder and configuration
update_agent_qa_folder() {
    print_status "Updating agent-qa folder"

    # Update the configuration file if any values changed
    if [[ -n "$REPOSITORY_PLATFORM" ]] || [[ -n "$REPOSITORY_PROJECT_ID" ]] || [[ -n "$AZURE_DEVOPS_CLOUD_ID" ]]; then
        create_or_update_config "$PROJECT_DIR" "$EFFECTIVE_REPOSITORY_PLATFORM" "$EFFECTIVE_REPOSITORY_PROJECT_ID" "$EFFECTIVE_AZURE_DEVOPS_CLOUD_ID"
        if [[ "$DRY_RUN" != "true" ]]; then
            echo "✓ Updated agent-qa project configuration"
        fi
    else
        # Just update version if config hasn't changed
        local config_file="$PROJECT_DIR/agent-qa/config.yml"
        if [[ -f "$config_file" ]] && [[ -n "$BASE_VERSION" ]]; then
            if [[ "$DRY_RUN" != "true" ]]; then
                if [[ "$(uname)" == "Darwin" ]]; then
                    sed -i '' "s/^version:.*/version: $BASE_VERSION/" "$config_file"
                else
                    sed -i "s/^version:.*/version: $BASE_VERSION/" "$config_file"
                fi
                write_yaml_value "$config_file" "last_installed" "$(date '+%Y-%m-%d %H:%M:%S')"
                echo "✓ Updated version to $BASE_VERSION in config.yml"
            fi
        fi
    fi
}

# Perform update
perform_update() {
    # Display configuration at the top
    echo ""
    print_status "Configuration:"
    echo -e "  Project version: ${YELLOW}$PROJECT_VERSION${NC}"
    echo -e "  Base version: ${YELLOW}$BASE_VERSION${NC}"
    if [[ -n "$EFFECTIVE_REPOSITORY_PLATFORM" ]]; then
        echo -e "  Repository platform: ${YELLOW}$EFFECTIVE_REPOSITORY_PLATFORM${NC}"
    fi
    echo ""

    # Update agent-qa folder and configuration
    update_agent_qa_folder
    echo ""

    # Update components
    update_commands
    echo ""
    update_workflows
    if [[ -d "$BASE_DIR/agent-qa/workflows" ]]; then
        echo ""
    fi
    update_standards
    if [[ -d "$BASE_DIR/agent-qa/standards" ]]; then
        echo ""
    fi
    update_framework
    if [[ -d "$BASE_DIR/agent-qa/framework" ]]; then
        echo ""
    fi
    update_claude_commands
    if [[ -d "$BASE_DIR/.claude/commands/agent-qa" ]] || [[ -d "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/commands/agent-qa" ]]; then
        echo ""
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        print_warning "DRY RUN - No files were actually modified"
        echo ""

        if [[ ${#NEW_FILES[@]} -gt 0 ]]; then
            print_status "New files that would be added:"
            for file in "${NEW_FILES[@]}"; do
                local relative_path="${file#$PROJECT_DIR/}"
                echo "  + $relative_path"
            done
            echo ""
        fi

        if [[ ${#UPDATED_FILES[@]} -gt 0 ]]; then
            print_status "Files that would be updated:"
            for file in "${UPDATED_FILES[@]}"; do
                local relative_path="${file#$PROJECT_DIR/}"
                echo "  ~ $relative_path"
            done
            echo ""
        fi

        if [[ ${#SKIPPED_FILES[@]} -gt 0 ]]; then
            print_status "Files that would be skipped:"
            for file in "${SKIPPED_FILES[@]}"; do
                local relative_path="${file#$PROJECT_DIR/}"
                echo "  - $relative_path"
            done
            echo ""
        fi

        read -p "Proceed with actual update? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            DRY_RUN="false"
            SKIPPED_FILES=()
            UPDATED_FILES=()
            NEW_FILES=()
            perform_update
        fi
    else
        print_success "Agent QA has been successfully updated!"
        echo ""
    fi
}

# Prompt user for update confirmation
prompt_update_confirmation() {
    local has_version_diff=$1
    local has_config_diff=$2

    if [[ "$has_version_diff" == "true" ]] || [[ "$has_config_diff" == "true" ]]; then
        echo ""
        print_color "$PURPLE" "=== Version/Configuration Update Required ==="
        echo ""
        if [[ "$DRY_RUN" == "true" ]]; then
            print_warning "Dry run simulation"
        fi
        echo ""
        print_status "Your project's Agent QA version and/or configuration is different than the base installation."
    else
        echo ""
        print_color "$PURPLE" "=== Confirm Update ==="
        echo ""
        if [[ "$DRY_RUN" == "true" ]]; then
            print_warning "Dry run simulation"
        fi
        echo ""
        print_status "Confirm you'd like to proceed with an update."
    fi
    echo ""

    # Display current project config
    print_status "Current project's Agent QA:"
    echo "  Version: $PROJECT_VERSION"
    if [[ -n "$PROJECT_REPOSITORY_PLATFORM" ]]; then
        echo "  Repository platform: $PROJECT_REPOSITORY_PLATFORM"
    fi
    echo ""

    # Display incoming config
    print_status "Incoming Agent QA:"
    echo "  Version: $BASE_VERSION"
    if [[ -n "$EFFECTIVE_REPOSITORY_PLATFORM" ]]; then
        echo "  Repository platform: $EFFECTIVE_REPOSITORY_PLATFORM"
    fi
    echo ""

    # Show what will happen
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "Here's what WOULD happen if this were a real update (but it's a DRY RUN):"
    else
        print_status "Here's what will happen if you proceed:"
    fi
    echo ""
    echo -e "${GREEN}✔ These will remain intact:${NC}"
    echo ""
    echo "  - agent-qa/config.yml (settings preserved unless explicitly changed)"
    echo ""
    echo -e "${YELLOW}⚠️  These will be updated:${NC}"
    echo ""
    echo "  - agent-qa/commands/"
    if [[ -d "$BASE_DIR/agent-qa/workflows" ]]; then
        echo "  - agent-qa/workflows/"
    fi
    if [[ -d "$BASE_DIR/agent-qa/standards" ]]; then
        echo "  - agent-qa/standards/"
    fi
    if [[ -d "$BASE_DIR/agent-qa/framework" ]]; then
        echo "  - agent-qa/framework/"
    fi
    echo ""

    read -p "Do you want to proceed? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0  # user confirmed
    else
        return 1  # user declined
    fi
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

main() {
    # Parse command line arguments
    parse_arguments "$@"

    # Check if we're trying to update in the base installation directory
    check_not_base_installation

    # Validate installations
    validate_installations

    # Load configurations
    load_configurations

    # Check for version differences
    local has_version_diff="false"
    if [[ "$PROJECT_VERSION" != "$BASE_VERSION" ]]; then
        has_version_diff="true"
    fi

    # Check for config differences
    local has_config_diff="false"
    if [[ -n "$REPOSITORY_PLATFORM" ]] && [[ "$PROJECT_REPOSITORY_PLATFORM" != "$EFFECTIVE_REPOSITORY_PLATFORM" ]]; then
        has_config_diff="true"
    fi
    if [[ -n "$REPOSITORY_PROJECT_ID" ]] && [[ "$PROJECT_REPOSITORY_PROJECT_ID" != "$EFFECTIVE_REPOSITORY_PROJECT_ID" ]]; then
        has_config_diff="true"
    fi
    if [[ -n "$AZURE_DEVOPS_CLOUD_ID" ]] && [[ "$PROJECT_AZURE_DEVOPS_CLOUD_ID" != "$EFFECTIVE_AZURE_DEVOPS_CLOUD_ID" ]]; then
        has_config_diff="true"
    fi

    # Prompt for confirmation
    if prompt_update_confirmation "$has_version_diff" "$has_config_diff"; then
        # User confirmed - proceed with update
        echo ""
        perform_update
        exit 0
    else
        print_status "Update cancelled by user"
        exit 0
    fi
}

# Run main function
main "$@"

