# =============================================================================
# Agent QA Installation Script
# Installs Agent QA into a project's codebase
# =============================================================================

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.PSCommandPath
# Source directory is the parent of scripts directory (agent-qa repository root)
$SourceDir = Split-Path -Parent $ScriptDir
$ProjectDir = Get-Location

# Source common functions
. "$ScriptDir\common-functions.ps1"

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------

$script:DRY_RUN = $false
$script:VERBOSE = $false
$RepositoryPlatform = ""
$RepositoryProjectId = ""
$AzureDevOpsCloudId = ""

# -----------------------------------------------------------------------------
# Help Function
# -----------------------------------------------------------------------------

function Show-Help {
    Write-Host @"
Usage: .\install.ps1 [OPTIONS]

Install Agent QA into the current project directory.

Options:
    -DryRun                                Show what would be done without doing it
    -Verbose                               Show detailed output
    -Help                                  Show this help message

This script will:
1. Prompt you to select your repository platform (GitLab, GitHub, or Azure DevOps)
2. Prompt for repository project ID
3. Prompt for Azure DevOps cloud ID (if Azure DevOps is selected)
4. Create/update agent-qa/config.yml with your selections
5. Install agent-qa command files, workflows, and standards into the project

Examples:
    .\install.ps1
    .\install.ps1 -Verbose
    .\install.ps1 -DryRun

"@
    exit 0
}

# -----------------------------------------------------------------------------
# Parse Command Line Arguments
# -----------------------------------------------------------------------------

function Parse-Arguments {
    param([string[]]$Arguments)

    for ($i = 0; $i -lt $Arguments.Length; $i++) {
        $arg = $Arguments[$i]

        switch ($arg) {
            "-DryRun" {
                $script:DRY_RUN = $true
            }
            "-Verbose" {
                $script:VERBOSE = $true
            }
            "-Help" {
                Show-Help
            }
            default {
                Print-Error "Unknown option: $arg"
                Show-Help
            }
        }
    }
}

# -----------------------------------------------------------------------------
# Prompt Functions
# -----------------------------------------------------------------------------

# Prompt for repository platform selection
function Prompt-RepositoryPlatform {
    while ($true) {
        Write-Host ""
        Print-Status "Select repository platform:"
        Write-Host ""
        Write-Host "  [1] GitLab"
        Write-Host "  [2] GitHub"
        Write-Host "  [3] Azure DevOps"
        Write-Host ""
        $choice = Read-Host "Enter your choice (1-3)"

        switch ($choice) {
            "1" {
                $script:RepositoryPlatform = "gitlab"
                break
            }
            "2" {
                $script:RepositoryPlatform = "github"
                break
            }
            "3" {
                $script:RepositoryPlatform = "azure-devops"
                break
            }
            default {
                Print-Error "Invalid choice. Please enter 1, 2, or 3."
                continue
            }
        }
        break
    }

    Print-Verbose "Selected repository platform: $script:RepositoryPlatform"
}

# Prompt for repository project ID
function Prompt-RepositoryProjectId {
    while ($true) {
        Write-Host ""
        Print-Status "Enter repository project ID:"
        Write-Host ""
        switch ($script:RepositoryPlatform) {
            "gitlab" {
                Write-Host "  Format: Numeric ID (e.g., '12345') or full path (e.g., 'my-group/my-project')"
            }
            "github" {
                Write-Host "  Format: Repository owner/name (e.g., 'octocat/Spoon-Knife')"
            }
            "azure-devops" {
                Write-Host "  Format: Project name/ID and repository ID/name"
            }
        }
        Write-Host ""
        $script:RepositoryProjectId = Read-Host "Repository project ID"

        if ($script:RepositoryProjectId) {
            break
        } else {
            Print-Error "Repository project ID is required. Please enter a value."
        }
    }

    Print-Verbose "Repository project ID: $script:RepositoryProjectId"
}

# Prompt for Azure DevOps cloud ID
function Prompt-AzureDevOpsCloudId {
    if ($script:RepositoryPlatform -ne "azure-devops") {
        return
    }

    while ($true) {
        Write-Host ""
        Print-Status "Enter Azure DevOps Cloud ID (organization/account name):"
        Write-Host ""
        Write-Host "  Example: 'myorganization' for https://dev.azure.com/myorganization"
        Write-Host ""
        $script:AzureDevOpsCloudId = Read-Host "Azure DevOps Cloud ID"

        if ($script:AzureDevOpsCloudId) {
            break
        } else {
            Print-Error "Azure DevOps Cloud ID is required. Please enter a value."
        }
    }

    Print-Verbose "Azure DevOps Cloud ID: $script:AzureDevOpsCloudId"
}

# -----------------------------------------------------------------------------
# Installation Functions
# -----------------------------------------------------------------------------

# Install command files
function Install-Commands {
    if (-not $script:DRY_RUN) {
        Print-Status "Installing command files"
    }

    $commandsCount = 0
    $sourceCommandsDir = Join-Path $SourceDir "agent-qa\commands"
    $destCommandsDir = Join-Path $ProjectDir "agent-qa\commands"

    if (-not (Test-Path $sourceCommandsDir)) {
        Print-Warning "Source commands directory not found: $sourceCommandsDir"
        return
    }

    # Copy all command directories and files
    if (Test-Path $sourceCommandsDir) {
        Get-ChildItem -Path $sourceCommandsDir -Recurse -Filter "*.md" | ForEach-Object {
            $sourceFile = $_.FullName
            $relativePath = $sourceFile.Substring($sourceCommandsDir.Length + 1)
            $destFile = Join-Path $destCommandsDir $relativePath

            if (Copy-File -Source $sourceFile -Dest $destFile) {
                $script:commandsCount++
                Print-Verbose "  Installed: $relativePath"
            }
        }
    }

    if (-not $script:DRY_RUN) {
        if ($script:commandsCount -gt 0) {
            Write-Host "✓ Installed $($script:commandsCount) command files in agent-qa/commands"
        }
    }
}

# Install workflow files (if they exist)
function Install-Workflows {
    $sourceWorkflowsDir = Join-Path $SourceDir "agent-qa\workflows"
    $destWorkflowsDir = Join-Path $ProjectDir "agent-qa\workflows"

    if (-not (Test-Path $sourceWorkflowsDir)) {
        Print-Verbose "No workflows directory found - skipping"
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing workflow files"
    }

    $workflowsCount = 0

    if (Test-Path $sourceWorkflowsDir) {
        Get-ChildItem -Path $sourceWorkflowsDir -Recurse -Filter "*.md" | ForEach-Object {
            $sourceFile = $_.FullName
            $relativePath = $sourceFile.Substring($sourceWorkflowsDir.Length + 1)
            $destFile = Join-Path $destWorkflowsDir $relativePath

            if (Copy-File -Source $sourceFile -Dest $destFile) {
                $workflowsCount++
                Print-Verbose "  Installed: $relativePath"
            }
        }
    }

    if (-not $script:DRY_RUN) {
        if ($workflowsCount -gt 0) {
            Write-Host "✓ Installed $workflowsCount workflow files in agent-qa/workflows"
        }
    }
}

# Install standards files (if they exist)
function Install-Standards {
    $sourceStandardsDir = Join-Path $SourceDir "agent-qa\standards"
    $destStandardsDir = Join-Path $ProjectDir "agent-qa\standards"

    if (-not (Test-Path $sourceStandardsDir)) {
        Print-Verbose "No standards directory found - skipping"
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing standards files"
    }

    $standardsCount = 0

    if (Test-Path $sourceStandardsDir) {
        Get-ChildItem -Path $sourceStandardsDir -Recurse -Filter "*.md" | ForEach-Object {
            $sourceFile = $_.FullName
            $relativePath = $sourceFile.Substring($sourceStandardsDir.Length + 1)
            $destFile = Join-Path $destStandardsDir $relativePath

            if (Copy-File -Source $sourceFile -Dest $destFile) {
                $standardsCount++
                Print-Verbose "  Installed: $relativePath"
            }
        }
    }

    if (-not $script:DRY_RUN) {
        if ($standardsCount -gt 0) {
            Write-Host "✓ Installed $standardsCount standards files in agent-qa/standards"
        }
    }
}

# Install framework files (git-repository framework)
function Install-Framework {
    $sourceFrameworkDir = Join-Path $SourceDir "agent-qa\framework"
    $destFrameworkDir = Join-Path $ProjectDir "agent-qa\framework"

    if (-not (Test-Path $sourceFrameworkDir)) {
        Print-Verbose "No framework directory found - skipping"
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing framework files"
    }

    $frameworkCount = 0

    if (Test-Path $sourceFrameworkDir) {
        Get-ChildItem -Path $sourceFrameworkDir -Recurse -Filter "*.md" | ForEach-Object {
            $sourceFile = $_.FullName
            $relativePath = $sourceFile.Substring($sourceFrameworkDir.Length + 1)
            $destFile = Join-Path $destFrameworkDir $relativePath

            if (Copy-File -Source $sourceFile -Dest $destFile) {
                $frameworkCount++
                Print-Verbose "  Installed: $relativePath"
            }
        }
    }

    if (-not $script:DRY_RUN) {
        if ($frameworkCount -gt 0) {
            Write-Host "✓ Installed $frameworkCount framework files in agent-qa/framework"
        }
    }
}

# Install config template
function Install-ConfigTemplate {
    $sourceTemplate = Join-Path $SourceDir "agent-qa\config.yml.template"
    $destTemplate = Join-Path $ProjectDir "agent-qa\config.yml.template"

    if (Test-Path $sourceTemplate) {
        Copy-File -Source $sourceTemplate -Dest $destTemplate | Out-Null
        Print-Verbose "Installed config.yml.template"
    }
}

# Perform installation
function Perform-Installation {
    # Show dry run warning at the top if applicable
    if ($script:DRY_RUN) {
        Print-Warning "DRY RUN - No files will be actually created"
        Write-Host ""
    }

    # Display configuration
    Write-Host ""
    Print-Section "Agent QA Installation"
    Write-Host ""
    Print-Status "Configuration:"
    Write-Host "  Source directory: $SourceDir" -ForegroundColor Yellow
    Write-Host "  Project directory: $ProjectDir" -ForegroundColor Yellow
    Write-Host ""

    # Prompt for repository platform
    Prompt-RepositoryPlatform

    # Prompt for repository project ID
    Prompt-RepositoryProjectId

    # Prompt for Azure DevOps cloud ID if needed
    Prompt-AzureDevOpsCloudId

    Write-Host ""
    Print-Status "Installing Agent QA..."

    # Create directory structure
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\commands")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\workflows")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\standards")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\framework")

    # Create/update configuration file
    if (-not $script:DRY_RUN) {
        Print-Status "Creating configuration file"
    }
    New-OrUpdateConfig -ProjectDir $ProjectDir -RepositoryPlatform $script:RepositoryPlatform -RepositoryProjectId $script:RepositoryProjectId -AzureDevOpsCloudId $script:AzureDevOpsCloudId
    if (-not $script:DRY_RUN) {
        Write-Host "✓ Created/updated agent-qa/config.yml"
    }
    Write-Host ""

    # Install files
    Install-Commands
    Write-Host ""
    Install-Workflows
    if (Test-Path (Join-Path $SourceDir "agent-qa\workflows")) {
        Write-Host ""
    }
    Install-Standards
    if (Test-Path (Join-Path $SourceDir "agent-qa\standards")) {
        Write-Host ""
    }
    Install-Framework
    if (Test-Path (Join-Path $SourceDir "agent-qa\framework")) {
        Write-Host ""
    }
    Install-ConfigTemplate

    # Installation complete
    if (-not $script:DRY_RUN) {
        Write-Host ""
        Print-Success "Agent QA has been successfully installed in your project!"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Green
        Write-Host ""
        Write-Host "1) Verify configuration in agent-qa/config.yml" -ForegroundColor Green
        Write-Host ""
        Write-Host "2) Ensure MCP servers are configured in your IDE/Cursor:" -ForegroundColor Green
        Write-Host "   - Atlassian MCP server (for Jira/Confluence)"
        $platformName = $script:RepositoryPlatform.Substring(0,1).ToUpper() + $script:RepositoryPlatform.Substring(1)
        Write-Host "   - $platformName MCP server (for git repository access)"
        Write-Host "   - Playwright MCP server (for test automation)"
        Write-Host ""
        Write-Host "3) Start using Agent QA commands:" -ForegroundColor Green
        Write-Host "   - analyze-requirements"
        Write-Host "   - generate-test-cases"
        Write-Host "   - generate-test-charter"
        Write-Host "   - generate-test-strategy"
        Write-Host "   - generate-test-plan"
        Write-Host "   - generate-risk-register"
        Write-Host "   - generate-release-notes"
        Write-Host ""
    }
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

function Main {
    param([string[]]$Arguments)

    # Parse command line arguments
    Parse-Arguments -Arguments $Arguments

    # Check if we're trying to install in the source directory
    if ($ProjectDir -eq $SourceDir) {
        Print-Error "Cannot install Agent QA in its own source directory"
        Write-Host ""
        Write-Host "To install Agent QA in a project, navigate to your project directory:"
        Write-Host ""
        Write-Host "  cd path\to\project"
        Write-Host ""
        Write-Host "And then run:"
        Write-Host ""
        Write-Host "  .\install.ps1"
        Write-Host ""
        exit 1
    }

    # Perform installation
    Perform-Installation
}

# Run main function
Main -Arguments $args

