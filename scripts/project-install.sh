#!/bin/bash

# =============================================================================
# Agent QA Project Installation Script
# Installs Agent QA into a project's codebase
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
RE_INSTALL="false"
OVERWRITE_ALL="false"
OVERWRITE_COMMANDS="false"
OVERWRITE_WORKFLOWS="false"
OVERWRITE_STANDARDS="false"
OVERWRITE_FRAMEWORK="false"

# -----------------------------------------------------------------------------
# Help Function
# -----------------------------------------------------------------------------

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Install Agent QA into the current project directory.

Options:
    --repository-platform PLATFORM      Set repository platform (gitlab, github, azure-devops)
    --repository-project-id ID          Set repository project ID
    --azure-devops-cloud-id ID           Set Azure DevOps cloud ID (required if platform is azure-devops)
    --re-install                         Delete and reinstall Agent QA
    --overwrite-all                      Overwrite all existing files during update
    --overwrite-commands                 Overwrite existing command files
    --overwrite-workflows                Overwrite existing workflow files
    --overwrite-standards                Overwrite existing standards files
    --overwrite-framework                Overwrite existing framework files
    --dry-run                            Show what would be done without doing it
    --verbose                            Show detailed output
    -h, --help                           Show this help message

This script will:
1. Prompt you to select your repository platform (GitLab, GitHub, or Azure DevOps) if not provided
2. Prompt for repository project ID if not provided
3. Prompt for Azure DevOps cloud ID (if Azure DevOps selected and not provided)
4. Create/update agent-qa/config.yml with your selections
5. Install agent-qa command files, workflows, standards, and framework into the project

Examples:
    $0
    $0 --repository-platform gitlab --repository-project-id "12345"
    $0 --overwrite-all --dry-run

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
            --re-install)
                RE_INSTALL="true"
                shift
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
# Prompt Functions
# -----------------------------------------------------------------------------

# Prompt for repository platform selection
prompt_repository_platform() {
    if [[ -n "$REPOSITORY_PLATFORM" ]]; then
        # Validate provided platform
        case $REPOSITORY_PLATFORM in
            gitlab|github|azure-devops)
                print_verbose "Using provided repository platform: $REPOSITORY_PLATFORM"
                return
                ;;
            *)
                print_error "Invalid repository platform: $REPOSITORY_PLATFORM"
                print_error "Valid options are: gitlab, github, azure-devops"
                exit 1
                ;;
        esac
    fi

    while true; do
        echo ""
        print_status "Select repository platform:"
        echo ""
        echo "  [1] GitLab"
        echo "  [2] GitHub"
        echo "  [3] Azure DevOps"
        echo ""
        read -p "Enter your choice (1-3): " choice < /dev/tty

        case $choice in
            1)
                REPOSITORY_PLATFORM="gitlab"
                break
                ;;
            2)
                REPOSITORY_PLATFORM="github"
                break
                ;;
            3)
                REPOSITORY_PLATFORM="azure-devops"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 1, 2, or 3."
                ;;
        esac
    done

    print_verbose "Selected repository platform: $REPOSITORY_PLATFORM"
}

# Prompt for repository project ID
prompt_repository_project_id() {
    if [[ -n "$REPOSITORY_PROJECT_ID" ]]; then
        print_verbose "Using provided repository project ID: $REPOSITORY_PROJECT_ID"
        return
    fi

    while true; do
        echo ""
        print_status "Enter repository project ID:"
        echo ""
        case $REPOSITORY_PLATFORM in
            gitlab)
                echo "  Format: Numeric ID (e.g., '12345') or full path (e.g., 'my-group/my-project')"
                ;;
            github)
                echo "  Format: Repository owner/name (e.g., 'octocat/Spoon-Knife')"
                ;;
            azure-devops)
                echo "  Format: Project name/ID and repository ID/name"
                ;;
        esac
        echo ""
        read -p "Repository project ID: " REPOSITORY_PROJECT_ID < /dev/tty

        if [[ -n "$REPOSITORY_PROJECT_ID" ]]; then
            break
        else
            print_error "Repository project ID is required. Please enter a value."
        fi
    done

    print_verbose "Repository project ID: $REPOSITORY_PROJECT_ID"
}

# Prompt for Azure DevOps cloud ID
prompt_azure_devops_cloud_id() {
    if [[ "$REPOSITORY_PLATFORM" != "azure-devops" ]]; then
        return
    fi

    if [[ -n "$AZURE_DEVOPS_CLOUD_ID" ]]; then
        print_verbose "Using provided Azure DevOps cloud ID: $AZURE_DEVOPS_CLOUD_ID"
        return
    fi

    while true; do
        echo ""
        print_status "Enter Azure DevOps Cloud ID (organization/account name):"
        echo ""
        echo "  Example: 'myorganization' for https://dev.azure.com/myorganization"
        echo ""
        read -p "Azure DevOps Cloud ID: " AZURE_DEVOPS_CLOUD_ID < /dev/tty

        if [[ -n "$AZURE_DEVOPS_CLOUD_ID" ]]; then
            break
        else
            print_error "Azure DevOps Cloud ID is required. Please enter a value."
        fi
    done

    print_verbose "Azure DevOps Cloud ID: $AZURE_DEVOPS_CLOUD_ID"
}

# -----------------------------------------------------------------------------
# Validation Functions
# -----------------------------------------------------------------------------

# Validate base installation exists
validate_base_installation() {
    if [[ ! -d "$BASE_DIR" ]]; then
        print_error "Agent QA base installation not found at ~/agent-qa/"
        echo ""
        print_status "Please run the base installation first:"
        echo "  curl -sSL ${REPO_URL:-https://github.com/YOUR_USERNAME/agent-qa}/raw/main/scripts/base-install.sh | bash"
        echo ""
        exit 1
    fi

    if [[ ! -f "$BASE_DIR/scripts/common-functions.sh" ]]; then
        print_error "Base installation scripts not found"
        exit 1
    fi

    print_verbose "Base installation found at: $BASE_DIR"
}

# Check if current directory is the base installation directory
check_not_base_installation() {
    if [[ "$PROJECT_DIR" == "$BASE_DIR" ]]; then
        echo ""
        print_error "Cannot install Agent QA in base installation directory"
        echo ""
        echo "It appears you are in the location of your Agent QA base installation (your home directory)."
        echo "To install Agent QA in a project, move to your project's root folder:"
        echo ""
        echo "  cd path/to/project"
        echo ""
        echo "And then run:"
        echo ""
        echo "  ~/agent-qa/scripts/project-install.sh"
        echo ""
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Installation Functions
# -----------------------------------------------------------------------------

# Install command files
install_commands() {
    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Installing command files"
    fi

    local commands_count=0
    local source_commands_dir="$BASE_DIR/agent-qa/commands"
    local dest_commands_dir="$PROJECT_DIR/agent-qa/commands"

    if [[ ! -d "$source_commands_dir" ]]; then
        print_warning "Source commands directory not found: $source_commands_dir"
        return
    fi

    # Copy all command directories and files
    if [[ -d "$source_commands_dir" ]]; then
        find "$source_commands_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_commands_dir/}"
            local dest_file="$dest_commands_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_COMMANDS" "command"; then
                print_verbose "Skipped: $relative_path"
            else
                if copy_file "$source_file" "$dest_file" > /dev/null; then
                    ((commands_count++)) || true
                    print_verbose "  Installed: $relative_path"
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $commands_count -gt 0 ]]; then
            echo "✓ Installed $commands_count command files in agent-qa/commands"
        fi
    fi
}

# Install workflow files (if they exist)
install_workflows() {
    local source_workflows_dir="$BASE_DIR/agent-qa/workflows"
    local dest_workflows_dir="$PROJECT_DIR/agent-qa/workflows"

    if [[ ! -d "$source_workflows_dir" ]]; then
        print_verbose "No workflows directory found - skipping"
        return
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Installing workflow files"
    fi

    local workflows_count=0

    if [[ -d "$source_workflows_dir" ]]; then
        find "$source_workflows_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_workflows_dir/}"
            local dest_file="$dest_workflows_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_WORKFLOWS" "workflow"; then
                print_verbose "Skipped: $relative_path"
            else
                if copy_file "$source_file" "$dest_file" > /dev/null; then
                    ((workflows_count++)) || true
                    print_verbose "  Installed: $relative_path"
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $workflows_count -gt 0 ]]; then
            echo "✓ Installed $workflows_count workflow files in agent-qa/workflows"
        fi
    fi
}

# Install standards files (if they exist)
install_standards() {
    local source_standards_dir="$BASE_DIR/agent-qa/standards"
    local dest_standards_dir="$PROJECT_DIR/agent-qa/standards"

    if [[ ! -d "$source_standards_dir" ]]; then
        print_verbose "No standards directory found - skipping"
        return
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Installing standards files"
    fi

    local standards_count=0

    if [[ -d "$source_standards_dir" ]]; then
        find "$source_standards_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_standards_dir/}"
            local dest_file="$dest_standards_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_STANDARDS" "standard"; then
                print_verbose "Skipped: $relative_path"
            else
                if copy_file "$source_file" "$dest_file" > /dev/null; then
                    ((standards_count++)) || true
                    print_verbose "  Installed: $relative_path"
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $standards_count -gt 0 ]]; then
            echo "✓ Installed $standards_count standards files in agent-qa/standards"
        fi
    fi
}

# Install framework files (git-repository framework)
install_framework() {
    local source_framework_dir="$BASE_DIR/agent-qa/framework"
    local dest_framework_dir="$PROJECT_DIR/agent-qa/framework"

    if [[ ! -d "$source_framework_dir" ]]; then
        print_verbose "No framework directory found - skipping"
        return
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Installing framework files"
    fi

    local framework_count=0

    if [[ -d "$source_framework_dir" ]]; then
        find "$source_framework_dir" -type f -name "*.md" | while read -r source_file; do
            local relative_path="${source_file#$source_framework_dir/}"
            local dest_file="$dest_framework_dir/$relative_path"

            if should_skip_file "$dest_file" "$OVERWRITE_ALL" "$OVERWRITE_FRAMEWORK" "framework"; then
                print_verbose "Skipped: $relative_path"
            else
                if copy_file "$source_file" "$dest_file" > /dev/null; then
                    ((framework_count++)) || true
                    print_verbose "  Installed: $relative_path"
                fi
            fi
        done
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $framework_count -gt 0 ]]; then
            echo "✓ Installed $framework_count framework files in agent-qa/framework"
        fi
    fi
}

# Install config template
install_config_template() {
    local source_template="$BASE_DIR/agent-qa/config.yml.template"
    local dest_template="$PROJECT_DIR/agent-qa/config.yml.template"

    if [[ -f "$source_template" ]]; then
        copy_file "$source_template" "$dest_template" > /dev/null
        print_verbose "Installed config.yml.template"
    fi
}

# Perform installation
perform_installation() {
    # Show dry run warning at the top if applicable
    if [[ "$DRY_RUN" == "true" ]]; then
        print_warning "DRY RUN - No files will be actually created"
        echo ""
    fi

    # Display configuration
    echo ""
    print_status "Configuration:"
    echo -e "  Base directory: ${YELLOW}$BASE_DIR${NC}"
    echo -e "  Project directory: ${YELLOW}$PROJECT_DIR${NC}"
    echo ""

    # Prompt for repository platform if not provided
    prompt_repository_platform

    # Prompt for repository project ID if not provided
    prompt_repository_project_id

    # Prompt for Azure DevOps cloud ID if needed
    prompt_azure_devops_cloud_id

    echo ""
    print_status "Installing Agent QA..."

    # Create directory structure
    ensure_dir "$PROJECT_DIR/agent-qa/commands"
    ensure_dir "$PROJECT_DIR/agent-qa/workflows"
    ensure_dir "$PROJECT_DIR/agent-qa/standards"
    ensure_dir "$PROJECT_DIR/agent-qa/framework"

    # Create/update configuration file
    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Creating configuration file"
    fi
    create_or_update_config "$PROJECT_DIR" "$REPOSITORY_PLATFORM" "$REPOSITORY_PROJECT_ID" "$AZURE_DEVOPS_CLOUD_ID"
    if [[ "$DRY_RUN" != "true" ]]; then
        echo "✓ Created/updated agent-qa/config.yml"
    fi
    echo ""

    # Install files
    install_commands
    echo ""
    install_workflows
    if [[ -d "$BASE_DIR/agent-qa/workflows" ]]; then
        echo ""
    fi
    install_standards
    if [[ -d "$BASE_DIR/agent-qa/standards" ]]; then
        echo ""
    fi
    install_framework
    if [[ -d "$BASE_DIR/agent-qa/framework" ]]; then
        echo ""
    fi
    install_config_template

    # Installation complete
    if [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        print_success "Agent QA has been successfully installed in your project!"
        echo ""
        echo -e "${GREEN}Next steps:${NC}"
        echo ""
        echo -e "${GREEN}1) Verify configuration in agent-qa/config.yml${NC}"
        echo ""
        echo -e "${GREEN}2) Ensure MCP servers are configured in your IDE/Cursor:${NC}"
        echo -e "   - Atlassian MCP server (for Jira/Confluence)"
        local platform_name=$(echo "$REPOSITORY_PLATFORM" | sed 's/^./\U&/')
        echo -e "   - ${platform_name^} MCP server (for git repository access)"
        echo -e "   - Playwright MCP server (for test automation)"
        echo ""
        echo -e "${GREEN}3) Start using Agent QA commands:${NC}"
        echo -e "   - analyze-requirements"
        echo -e "   - generate-test-cases"
        echo -e "   - generate-test-charter"
        echo -e "   - generate-test-strategy"
        echo -e "   - generate-test-plan"
        echo -e "   - generate-risk-register"
        echo -e "   - generate-release-notes"
        echo ""
    fi
}

# Handle re-installation
handle_reinstallation() {
    print_section "Re-installation"

    print_warning "This will DELETE your current agent-qa/ folder and reinstall from scratch."
    echo ""

    read -p "Are you sure you want to proceed? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Re-installation cancelled"
        exit 0
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        print_status "Removing existing installation..."
        rm -rf "$PROJECT_DIR/agent-qa"
        echo "✓ Existing installation removed"
        echo ""
    fi

    perform_installation
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

main() {
    print_section "Agent QA Project Installation"

    # Parse command line arguments
    parse_arguments "$@"

    # Check if we're trying to install in the base installation directory
    check_not_base_installation

    # Validate base installation using common function
    validate_base_installation

    # Check if Agent QA is already installed
    if is_agent_qa_installed "$PROJECT_DIR"; then
        if [[ "$RE_INSTALL" == "true" ]]; then
            handle_reinstallation
        else
            # Delegate to update script
            print_status "Agent QA is already installed. Running update..."
            exec "$BASE_DIR/scripts/project-update.sh" "$@"
        fi
    else
        # Fresh installation
        perform_installation
    fi
}

# Run main function
main "$@"

