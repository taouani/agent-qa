# =============================================================================
# Agent QA Project Installation Script (Windows)
# Installs Agent QA into a project's codebase
# =============================================================================

param(
    [string]$Ide = "",
    [string]$RepositoryPlatform = "",
    [string]$RepositoryProjectId = "",
    [string]$AzureDevOpsCloudId = "",
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Resolve script directory across invocation styles
$ScriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
    $commandPath = $MyInvocation.PSCommandPath
    if ([string]::IsNullOrWhiteSpace($commandPath)) {
        $commandPath = $MyInvocation.MyCommand.Path
    }
    if (-not [string]::IsNullOrWhiteSpace($commandPath)) {
        $ScriptDir = Split-Path -Parent $commandPath
    }
}
if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
    $ScriptDir = Join-Path $env:USERPROFILE "agent-qa\scripts"
}

$BaseDir = Join-Path $env:USERPROFILE "agent-qa"
$SourceDir = $BaseDir
$ProjectDir = Get-Location

$commonFunctions = Join-Path $ScriptDir "common-functions.ps1"
if (-not (Test-Path $commonFunctions)) {
    $commonFunctions = Join-Path $BaseDir "scripts\common-functions.ps1"
}
if (-not (Test-Path $commonFunctions)) {
    Write-Host "Agent QA base installation not found at $BaseDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "Run the base installation first:"
    Write-Host "  irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex"
    exit 1
}
. $commonFunctions

$script:DRY_RUN = $DryRun.IsPresent
$script:VERBOSE = $Verbose.IsPresent
$script:InstallClaude = $false
$script:InstallCursor = $false
$script:InstallVscode = $false
$script:InstallGithub = $false

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------

function Show-Help {
    Write-Host @"
Usage: .\project-install.ps1 [OPTIONS]

Install Agent QA into the current project directory.

Options:
    -Ide IDE_LIST                 Comma-separated IDEs: claude,cursor,vscode,github (default: all)
    -RepositoryPlatform PLATFORM  Set repository platform (gitlab, github, azure-devops)
    -RepositoryProjectId ID       Set repository project ID
    -AzureDevOpsCloudId ID        Set Azure DevOps cloud ID
    -DryRun                       Show what would be done without doing it
    -Verbose                      Show detailed output
    -Help                         Show this help message

Examples:
    .\project-install.ps1
    .\project-install.ps1 -Ide claude,cursor
    .\project-install.ps1 -Ide vscode -RepositoryPlatform github -RepositoryProjectId "owner/repo"

"@
    exit 0
}

# -----------------------------------------------------------------------------
# IDE Selection
# -----------------------------------------------------------------------------

function Initialize-IdESelection {
    if ([string]::IsNullOrWhiteSpace($Ide)) {
        $script:InstallClaude = $true
        $script:InstallCursor = $true
        $script:InstallVscode = $true
        $script:InstallGithub = $true
        return
    }

    foreach ($entry in ($Ide -split ',')) {
        $ideName = $entry.Trim().ToLower()
        switch ($ideName) {
            "claude" { $script:InstallClaude = $true }
            "cursor" { $script:InstallCursor = $true }
            "vscode" { $script:InstallVscode = $true }
            "github" { $script:InstallGithub = $true }
            default {
                Print-Error "Unknown IDE: $entry"
                Print-Error "Valid options: claude, cursor, vscode, github"
                exit 1
            }
        }
    }

    if ($script:InstallCursor -and -not $script:InstallClaude) {
        Print-Verbose "Cursor requires .claude/commands/ - auto-including Claude Code commands"
    }

    if ($script:InstallVscode -and -not $script:InstallGithub) {
        $script:InstallGithub = $true
        Print-Verbose "VS Code requires .github/copilot-instructions.md - auto-including GitHub Copilot"
    }
}

function Test-ShouldInstallIde {
    param([string]$IdeName)

    switch ($IdeName) {
        "claude" { return $script:InstallClaude }
        "cursor" { return $script:InstallCursor }
        "vscode" { return $script:InstallVscode }
        "github" { return $script:InstallGithub }
        default { return $false }
    }
}

function Get-InstalledIdesList {
    $ides = @()
    if ($script:InstallClaude) { $ides += "claude" }
    if ($script:InstallCursor) { $ides += "cursor" }
    if ($script:InstallVscode) { $ides += "vscode" }
    if ($script:InstallGithub) { $ides += "github" }
    return ($ides -join ",")
}

# -----------------------------------------------------------------------------
# Prompt Functions
# -----------------------------------------------------------------------------

function Prompt-RepositoryPlatform {
    if ($script:RepositoryPlatform) {
        Print-Verbose "Using repository platform: $script:RepositoryPlatform"
        return
    }

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
            "1" { $script:RepositoryPlatform = "gitlab"; break }
            "2" { $script:RepositoryPlatform = "github"; break }
            "3" { $script:RepositoryPlatform = "azure-devops"; break }
            default {
                Print-Error "Invalid choice. Please enter 1, 2, or 3."
                continue
            }
        }
        break
    }

    Print-Verbose "Selected repository platform: $script:RepositoryPlatform"
}

function Prompt-RepositoryProjectId {
    if ($script:RepositoryProjectId) {
        Print-Verbose "Using repository project ID: $script:RepositoryProjectId"
        return
    }

    while ($true) {
        Write-Host ""
        Print-Status "Enter repository project ID:"
        Write-Host ""
        switch ($script:RepositoryPlatform) {
            "gitlab" { Write-Host "  Format: Numeric ID (e.g., '12345') or full path (e.g., 'my-group/my-project')" }
            "github" { Write-Host "  Format: Repository owner/name (e.g., 'octocat/Spoon-Knife')" }
            "azure-devops" { Write-Host "  Format: Project name/ID and repository ID/name" }
        }
        Write-Host ""
        $script:RepositoryProjectId = Read-Host "Repository project ID"

        if ($script:RepositoryProjectId) {
            break
        }
        Print-Error "Repository project ID is required. Please enter a value."
    }

    Print-Verbose "Repository project ID: $script:RepositoryProjectId"
}

function Prompt-AzureDevOpsCloudId {
    if ($script:RepositoryPlatform -ne "azure-devops") {
        return
    }

    if ($script:AzureDevOpsCloudId) {
        Print-Verbose "Using Azure DevOps cloud ID: $script:AzureDevOpsCloudId"
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
        }
        Print-Error "Azure DevOps Cloud ID is required. Please enter a value."
    }

    Print-Verbose "Azure DevOps Cloud ID: $script:AzureDevOpsCloudId"
}

# -----------------------------------------------------------------------------
# Installation Helpers
# -----------------------------------------------------------------------------

function Copy-SourceMarkdownTree {
    param(
        [string]$SourceDir,
        [string]$DestDir,
        [string]$Label
    )

    if (-not (Test-Path $SourceDir)) {
        Print-Verbose "No $Label directory found - skipping"
        return 0
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing $Label"
    }

    $count = 0
    Get-ChildItem -Path $SourceDir -Recurse -Filter "*.md" -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($SourceDir.Length + 1)
        $destFile = Join-Path $DestDir $relativePath
        if (Copy-File -Source $_.FullName -Dest $destFile) {
            $count++
            Print-Verbose "  Installed: $relativePath"
        }
    }

    if (-not $script:DRY_RUN -and $count -gt 0) {
        Print-Success "Installed $count $Label files"
    }

    return $count
}

function Copy-SingleFile {
    param(
        [string]$SourceFile,
        [string]$DestFile,
        [string]$SuccessMessage
    )

    if (-not (Test-Path $SourceFile)) {
        return $false
    }

    Copy-File -Source $SourceFile -Dest $DestFile | Out-Null
    if (-not $script:DRY_RUN) {
        Print-Success $SuccessMessage
    }
    return $true
}

# -----------------------------------------------------------------------------
# Core Installation
# -----------------------------------------------------------------------------

function Install-Commands {
    $source = Join-Path $SourceDir "agent-qa\commands"
    $dest = Join-Path $ProjectDir "agent-qa\commands"
    Copy-SourceMarkdownTree -SourceDir $source -DestDir $dest -Label "command files in agent-qa/commands" | Out-Null
}

function Install-Rules {
    $source = Join-Path $SourceDir "agent-qa\rules"
    $dest = Join-Path $ProjectDir "agent-qa\rules"
    if (-not (Test-Path $source)) {
        Print-Verbose "No agent-qa/rules directory found - skipping"
        return
    }
    if (-not $script:DRY_RUN) { Print-Status "Installing QA rules" }
    Copy-SourceMarkdownTree -SourceDir $source -DestDir $dest -Label "QA rules in agent-qa/rules" | Out-Null
    if (-not $script:DRY_RUN) { Print-Success "Installed QA rules in agent-qa/rules/" }
}

function Install-Agents {
    $source = Join-Path $SourceDir "agent-qa\agents"
    $dest = Join-Path $ProjectDir "agent-qa\agents"
    if (-not (Test-Path $source)) {
        Print-Verbose "No agent-qa/agents directory found - skipping"
        return
    }
    if (-not $script:DRY_RUN) { Print-Status "Installing QA agents" }
    Copy-SourceMarkdownTree -SourceDir $source -DestDir $dest -Label "QA agents in agent-qa/agents" | Out-Null
    if (-not $script:DRY_RUN) { Print-Success "Installed QA agents in agent-qa/agents/" }
}

function Install-Framework {
    $source = Join-Path $SourceDir "agent-qa\framework"
    $dest = Join-Path $ProjectDir "agent-qa\framework"
    Copy-SourceMarkdownTree -SourceDir $source -DestDir $dest -Label "framework files in agent-qa/framework" | Out-Null
}

function Install-Formats {
    $source = Join-Path $SourceDir "agent-qa\formats"
    $dest = Join-Path $ProjectDir "agent-qa\formats"
    Copy-SourceMarkdownTree -SourceDir $source -DestDir $dest -Label "format template files in agent-qa/formats" | Out-Null
}

function Install-ConfigTemplate {
    $source = Join-Path $SourceDir "agent-qa\config.yml.template"
    $dest = Join-Path $ProjectDir "agent-qa\config.yml.template"
    if (Test-Path $source) {
        Copy-File -Source $source -Dest $dest | Out-Null
        Print-Verbose "Installed config.yml.template"
    }
}

# -----------------------------------------------------------------------------
# IDE Integrations
# -----------------------------------------------------------------------------

function Install-IdeClaude {
    if (-not (Test-ShouldInstallIde "claude") -and -not (Test-ShouldInstallIde "cursor")) {
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing Claude Code IDE integration"
    }

    $sourceCommands = Join-Path $SourceDir "agent-qa\ide\claude\commands\agent-qa"
    $destCommands = Join-Path $ProjectDir ".claude\commands\agent-qa"
    if (Test-Path $sourceCommands) {
        Ensure-Dir -Dir $destCommands
        Copy-SourceMarkdownTree -SourceDir $sourceCommands -DestDir $destCommands -Label "Claude Code slash commands" | Out-Null
        if (-not $script:DRY_RUN) {
            Print-Success "Installed Claude Code slash commands in .claude/commands/agent-qa/"
        }
    }

    if (Test-ShouldInstallIde "claude") {
        $sourceRules = Join-Path $SourceDir "agent-qa\rules"
        $destRules = Join-Path $ProjectDir ".claude\rules"
        if (Test-Path $sourceRules) {
            Ensure-Dir -Dir $destRules
            Copy-SourceMarkdownTree -SourceDir $sourceRules -DestDir $destRules -Label "Claude Code rules" | Out-Null
            if (-not $script:DRY_RUN) {
                Print-Success "Installed Claude Code rules in .claude/rules/"
            }
        }

        $sourceAgents = Join-Path $SourceDir "agent-qa\agents"
        $destAgents = Join-Path $ProjectDir ".claude\agents\agent-qa"
        if (Test-Path $sourceAgents) {
            Ensure-Dir -Dir $destAgents
            Copy-SourceMarkdownTree -SourceDir $sourceAgents -DestDir $destAgents -Label "Claude Code agents" | Out-Null
            if (-not $script:DRY_RUN) {
                Print-Success "Installed Claude Code agents in .claude/agents/agent-qa/"
            }
        }

        $sourceHooks = Join-Path $SourceDir "agent-qa\ide\claude\hooks.json"
        $destHooks = Join-Path $ProjectDir ".claude\hooks.json"
        Copy-SingleFile -SourceFile $sourceHooks -DestFile $destHooks -SuccessMessage "Installed Claude Code hooks in .claude/hooks.json" | Out-Null
    }
}

function Install-IdeCursor {
    if (-not (Test-ShouldInstallIde "cursor")) {
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing Cursor IDE integration"
    }

    $sourceCursor = Join-Path $SourceDir "agent-qa\ide\cursor\rules"
    $destCursor = Join-Path $ProjectDir ".cursor\rules"
    if (Test-Path $sourceCursor) {
        Ensure-Dir -Dir $destCursor
        Copy-SourceMarkdownTree -SourceDir $sourceCursor -DestDir $destCursor -Label "Cursor IDE rules" | Out-Null
        if (-not $script:DRY_RUN) {
            Print-Success "Installed Cursor IDE rules in .cursor/rules/"
        }
    }
}

function Install-IdeVscode {
    if (-not (Test-ShouldInstallIde "vscode")) {
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing VS Code IDE integration"
    }

    $sourceVscode = Join-Path $SourceDir "agent-qa\ide\vscode"
    $destVscode = Join-Path $ProjectDir ".vscode"
    if (Test-Path $sourceVscode) {
        Ensure-Dir -Dir $destVscode
        foreach ($jsonFile in @("settings.json", "tasks.json", "extensions.json")) {
            $sourceFile = Join-Path $sourceVscode $jsonFile
            $destFile = Join-Path $destVscode $jsonFile
            if (Test-Path $sourceFile) {
                Copy-SingleFile -SourceFile $sourceFile -DestFile $destFile -SuccessMessage "Installed VS Code $jsonFile" | Out-Null
            }
        }
    }
}

function Install-IdeGithub {
    if (-not (Test-ShouldInstallIde "github")) {
        return
    }

    if (-not $script:DRY_RUN) {
        Print-Status "Installing GitHub Copilot integration"
    }

    $sourceCopilot = Join-Path $SourceDir "agent-qa\ide\github\copilot-instructions.md"
    $destCopilot = Join-Path $ProjectDir ".github\copilot-instructions.md"
    if (Test-Path $sourceCopilot) {
        Ensure-Dir -Dir (Join-Path $ProjectDir ".github")
        Copy-SingleFile -SourceFile $sourceCopilot -DestFile $destCopilot -SuccessMessage "Installed GitHub Copilot instructions in .github/copilot-instructions.md" | Out-Null
    }
}

# -----------------------------------------------------------------------------
# Main Installation
# -----------------------------------------------------------------------------

function Test-BaseInstallation {
    if (-not (Test-Path $BaseDir)) {
        Print-Error "Agent QA base installation not found at $BaseDir"
        Write-Host ""
        Print-Status "Run the base installation first:"
        Write-Host "  irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex"
        exit 1
    }

    if (-not (Test-Path (Join-Path $BaseDir "agent-qa\commands"))) {
        Print-Error "Agent QA base installation is incomplete at $BaseDir"
        exit 1
    }

    Print-Verbose "Base installation found at: $BaseDir"
}

function Start-ProjectInstall {
    if ($script:DRY_RUN) {
        Print-Warning "DRY RUN - No files will be actually created"
        Write-Host ""
    }

    Write-Host ""
    Print-Section "Agent QA Project Installation"
    Write-Host ""
    Print-Status "Configuration:"
    Print-Color -Color $script:YELLOW -Message "  Base directory: $BaseDir"
    Print-Color -Color $script:YELLOW -Message "  Project directory: $ProjectDir"
    Write-Host ""

    Prompt-RepositoryPlatform
    Prompt-RepositoryProjectId
    Prompt-AzureDevOpsCloudId
    Initialize-IdESelection

    $idesList = Get-InstalledIdesList
    Write-Host ""
    Print-Status "Installing Agent QA..."
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "  IDEs to install: $idesList"
    Write-Host ""

    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\commands")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\rules")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\agents")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\framework")
    Ensure-Dir -Dir (Join-Path $ProjectDir "agent-qa\formats")

    if (-not $script:DRY_RUN) {
        Print-Status "Creating configuration file"
    }
    New-OrUpdateConfig -ProjectDir $ProjectDir -RepositoryPlatform $script:RepositoryPlatform -RepositoryProjectId $script:RepositoryProjectId -AzureDevOpsCloudId $script:AzureDevOpsCloudId
    if (-not $script:DRY_RUN) {
        Write-YamlValue -File (Join-Path $ProjectDir "agent-qa\config.yml") -Key "installed_ides" -Value $idesList
        Print-Success "Created/updated agent-qa/config.yml"
    }
    Write-Host ""

    Install-Commands
    Write-Host ""
    Install-Rules
    Write-Host ""
    Install-Agents
    Write-Host ""
    Install-Framework
    Write-Host ""
    Install-ConfigTemplate
    Install-Formats
    Write-Host ""

    Print-Section "IDE Integrations"
    Install-IdeClaude
    Write-Host ""
    Install-IdeCursor
    Write-Host ""
    Install-IdeVscode
    Write-Host ""
    Install-IdeGithub

    if (-not $script:DRY_RUN) {
        Write-Host ""
        Print-Success "Agent QA has been successfully installed in your project!"
        Write-Host ""
        Print-Color -Color $script:GREEN -Message "Next steps:"
        Write-Host ""
        Print-Color -Color $script:GREEN -Message "1) Verify configuration in agent-qa/config.yml"
        Write-Host ""
        Print-Color -Color $script:GREEN -Message "2) Ensure MCP servers are configured in your IDE:"
        Write-Host "   - Atlassian MCP server (for Jira/Confluence)"
        $platformName = $script:RepositoryPlatform.Substring(0, 1).ToUpper() + $script:RepositoryPlatform.Substring(1)
        Write-Host "   - $platformName MCP server (for git repository access)"
        Write-Host "   - Playwright MCP server (for test automation)"
        Write-Host ""
        Print-Color -Color $script:GREEN -Message "3) Start using Agent QA commands:"
        Write-Host "   Core:   analyze-requirements, generate-test-cases, generate-test-strategy"
        Write-Host "           generate-test-charter, generate-test-plan, generate-risk-register"
        Write-Host "           analyze-commits, generate-release-notes"
        Write-Host "   Extra:  generate-gherkin, generate-playwright-tests, publish-to-confluence"
        Write-Host ""
        Print-Color -Color $script:GREEN -Message "4) IDE integration installed for: $idesList"
        if (Test-ShouldInstallIde "claude") {
            Write-Host "   - Claude Code: .claude/ (commands, rules, agents, hooks)"
        }
        if (Test-ShouldInstallIde "cursor") {
            Write-Host "   - Cursor: .cursor/rules/ + .claude/commands/"
        }
        if (Test-ShouldInstallIde "vscode") {
            Write-Host "   - VS Code: .vscode/ (settings, tasks, extensions)"
        }
        if (Test-ShouldInstallIde "github") {
            Write-Host "   - GitHub Copilot: .github/copilot-instructions.md"
        }
        Write-Host ""
    }
}

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

if ($Help) {
    Show-Help
}

$script:RepositoryPlatform = $RepositoryPlatform
$script:RepositoryProjectId = $RepositoryProjectId
$script:AzureDevOpsCloudId = $AzureDevOpsCloudId

Test-BaseInstallation

if ($ProjectDir.Path -eq $BaseDir) {
    Print-Error "Cannot install Agent QA in the base installation directory"
    Write-Host ""
    Write-Host "Navigate to your project directory and run:"
    Write-Host ""
    Write-Host "  cd path\to\project"
    Write-Host "  & `"$BaseDir\scripts\project-install.ps1`""
    Write-Host ""
    exit 1
}

Start-ProjectInstall
