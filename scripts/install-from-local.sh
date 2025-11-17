#!/bin/bash

# Agent QA Local Installation Script
# Installs Agent QA from local repository to ~/agent-qa
# Use this when the repository is not yet on GitHub

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Repository root is parent of scripts directory
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
BASE_DIR="$HOME/agent-qa"

# Color codes
BLUE='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

print_status() { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Check if repository structure exists
check_repo_structure() {
    if [[ ! -d "$REPO_ROOT/agent-qa" ]]; then
        print_error "Repository structure not found at $REPO_ROOT"
        echo ""
        print_status "Make sure you're running this script from the agent-qa repository"
        print_status "Expected structure: agent-qa/agent-qa/ and agent-qa/scripts/"
        exit 1
    fi
}

# Handle existing installation
handle_existing_installation() {
    if [[ -d "$BASE_DIR" ]]; then
        print_warning "Existing installation found at $BASE_DIR"
        echo ""
        read -p "Do you want to overwrite it? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Removing existing installation..."
            rm -rf "$BASE_DIR"
            print_success "Removed existing installation"
            echo ""
        else
            print_status "Installation cancelled"
            exit 0
        fi
    fi
}

# Copy files from repository to base directory
install_files() {
    local file_count=0
    
    print_status "Installing Agent QA files from local repository..."
    echo ""
    
    # Create base directory
    mkdir -p "$BASE_DIR"
    
    # Copy agent-qa directory
    if [[ -d "$REPO_ROOT/agent-qa" ]]; then
        print_status "Copying agent-qa files..."
        cp -R "$REPO_ROOT/agent-qa" "$BASE_DIR/"
        local count=$(find "$REPO_ROOT/agent-qa" -type f 2>/dev/null | wc -l | tr -d ' ')
        file_count=$((file_count + count))
        print_success "Copied $count agent-qa files"
    fi
    
    # Copy scripts directory
    if [[ -d "$REPO_ROOT/scripts" ]]; then
        print_status "Copying scripts..."
        cp -R "$REPO_ROOT/scripts" "$BASE_DIR/"
        local count=$(find "$REPO_ROOT/scripts" -type f 2>/dev/null | wc -l | tr -d ' ')
        file_count=$((file_count + count))
        print_success "Copied $count script files"
    fi
    
    # Copy .claude/commands/agent-qa directory (for IDE recognition)
    if [[ -d "$REPO_ROOT/.claude/commands/agent-qa" ]]; then
        print_status "Copying IDE command files..."
        mkdir -p "$BASE_DIR/.claude/commands/agent-qa"
        cp -R "$REPO_ROOT/.claude/commands/agent-qa"/* "$BASE_DIR/.claude/commands/agent-qa/"
        local count=$(find "$REPO_ROOT/.claude/commands/agent-qa" -type f 2>/dev/null | wc -l | tr -d ' ')
        file_count=$((file_count + count))
        print_success "Copied $count IDE command files"
    fi
    
    # Make scripts executable
    if [[ -d "$BASE_DIR/scripts" ]]; then
        chmod +x "$BASE_DIR/scripts/"*.sh 2>/dev/null || true
        print_success "Made scripts executable"
    fi
    
    # Return file count via stdout (last line only)
    echo "$file_count"
}

# Perform installation
perform_installation() {
    print_status "Agent QA Local Installation"
    echo ""
    print_status "Configuration:"
    echo -e "  Source: ${YELLOW}$REPO_ROOT${NC}"
    echo -e "  Target: ${YELLOW}$BASE_DIR${NC}"
    echo ""
    
    # Capture file count (last line of output)
    local output
    output=$(install_files)
    local file_count=$(echo "$output" | tail -1)
    
    if [[ -n "$file_count" ]] && [[ "$file_count" =~ ^[0-9]+$ ]] && [[ $file_count -gt 0 ]]; then
        echo ""
        print_success "Agent QA has been successfully installed!"
        echo ""
        echo -e "${GREEN}Installed $file_count files to ~/agent-qa${NC}"
        echo ""
        echo -e "${GREEN}Next steps:${NC}"
        echo ""
        echo -e "${GREEN}1) Navigate to a project directory${NC}"
        echo -e "   ${YELLOW}cd path/to/project-directory${NC}"
        echo ""
        echo -e "${GREEN}2) Install Agent QA in your project by running:${NC}"
        echo -e "   ${YELLOW}~/agent-qa/scripts/project-install.sh${NC}"
        echo ""
    else
        print_error "No files were installed"
        exit 1
    fi
}

# Main execution
main() {
    check_repo_structure
    handle_existing_installation
    perform_installation
}

main "$@"

