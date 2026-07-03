# =============================================================================
# Agent QA Base Installation Script (Windows)
# Installs Agent QA from GitHub repository to ~/agent-qa
# =============================================================================

param(
    [switch]$Help,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

$script:RepoUrl = "https://github.com/taouani/agent-qa"
$script:RepoBranch = "master"
$script:BaseDir = Join-Path $env:USERPROFILE "agent-qa"
$script:DryRun = $false

$script:Exclusions = @(
    "scripts/base-install.sh",
    "scripts/base-install.ps1",
    ".git*",
    ".github/*",
    "node_modules/*",
    "*.log"
)

# -----------------------------------------------------------------------------
# Bootstrap Functions (before common-functions.ps1 is available)
# -----------------------------------------------------------------------------

function Write-Bootstrap {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-BootstrapError {
    param([string]$Message)
    Write-Host (([char]0x2717) + ' ' + $Message) -ForegroundColor Red
}

function Get-CommonFunctionsScript {
    $scriptRoot = $PSScriptRoot
    if (-not $scriptRoot -and $MyInvocation.PSCommandPath) {
        $scriptRoot = Split-Path -Parent $MyInvocation.PSCommandPath
    }

    $localCommonFunctions = if ($scriptRoot) {
        Join-Path $scriptRoot "common-functions.ps1"
    } else {
        $null
    }

    if ($localCommonFunctions -and (Test-Path $localCommonFunctions)) {
        return $localCommonFunctions
    }

    $functionsUrl = "$($script:RepoUrl)/raw/$($script:RepoBranch)/scripts/common-functions.ps1"
    $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) "agent-qa-common-functions.ps1"

    try {
        Invoke-WebRequest -Uri $functionsUrl -OutFile $tempFile -UseBasicParsing | Out-Null
        return $tempFile
    } catch {
        Write-BootstrapError "Failed to download common-functions.ps1"
        exit 1
    }
}

# -----------------------------------------------------------------------------
# Download Functions
# -----------------------------------------------------------------------------

function Test-ShouldExclude {
    param([string]$FilePath)

    foreach ($pattern in $script:Exclusions) {
        if ($FilePath -eq $pattern) {
            return $true
        }

        if ($pattern -like "*`*") {
            $prefix = $pattern.TrimEnd('*')
            if ($FilePath.StartsWith($prefix)) {
                return $true
            }
        }
    }

    return $false
}

function Get-RepoPath {
    return ($script:RepoUrl -replace '^https://github.com/', '')
}

function Get-LatestVersion {
    $configUrl = "$($script:RepoUrl)/raw/$($script:RepoBranch)/agent-qa/config.yml.template"

    try {
        $content = (Invoke-WebRequest -Uri $configUrl -UseBasicParsing).Content
        foreach ($line in ($content -split "`n")) {
            if ($line -match '^version:\s*(.+)$') {
                return $matches[1].Trim().Trim("`r")
            }
        }
    } catch {
        Print-Verbose "Unable to fetch latest version: $_"
    }

    return "1.0.0"
}

function Get-AllRepoFiles {
    $repoPath = Get-RepoPath
    $treeUrl = "https://api.github.com/repos/$repoPath/git/trees/$($script:RepoBranch)?recursive=true"

    Print-Verbose "Repository path: $repoPath"
    Print-Verbose "Fetching from: $treeUrl"

    try {
        $response = Invoke-RestMethod -Uri $treeUrl -Method Get
    } catch {
        Print-Verbose "GitHub API error: $_"
        return @()
    }

    if (-not $response.tree) {
        Print-Verbose "No tree data in response"
        return @()
    }

    $files = @()
    foreach ($item in $response.tree) {
        if ($item.type -eq "blob" -and -not (Test-ShouldExclude -FilePath $item.path)) {
            $files += $item.path
        }
    }

    return $files
}

function Save-RepoFile {
    param(
        [string]$RelativePath,
        [string]$DestPath
    )

    $fileUrl = "$($script:RepoUrl)/raw/$($script:RepoBranch)/$RelativePath"
    $destDir = Split-Path -Parent $DestPath

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    try {
        Invoke-WebRequest -Uri $fileUrl -OutFile $DestPath -UseBasicParsing | Out-Null
        return $true
    } catch {
        Print-Verbose "  Failed to download: $RelativePath"
        return $false
    }
}

function Install-AllRepoFiles {
    param([string]$DestBase)

    Print-Verbose "Fetching repository file list..."
    $allFiles = Get-AllRepoFiles

    if ($allFiles.Count -eq 0) {
        return 0
    }

    $fileCount = 0
    foreach ($filePath in $allFiles) {
        if ([string]::IsNullOrWhiteSpace($filePath)) {
            continue
        }

        $destFile = Join-Path $DestBase $filePath
        if (Save-RepoFile -RelativePath $filePath -DestPath $destFile) {
            $fileCount++
            Print-Verbose "  Downloaded: $filePath"
        }
    }

    return $fileCount
}

function Install-RepoFilesWithPrefix {
    param(
        [string]$DestBase,
        [string]$Prefix
    )

    $fileCount = 0
    $matchingFiles = Get-AllRepoFiles | Where-Object { $_ -like "$Prefix*" }

    foreach ($filePath in $matchingFiles) {
        $destFile = Join-Path $DestBase $filePath
        if (Save-RepoFile -RelativePath $filePath -DestPath $destFile) {
            $fileCount++
            Print-Verbose "  Downloaded: $filePath"
        }
    }

    return $fileCount
}

# -----------------------------------------------------------------------------
# Installation Functions
# -----------------------------------------------------------------------------

function Install-AllFiles {
    if ($script:DryRun -eq $true) {
        return $true
    }

    if ($script:VERBOSE -eq $true) {
        Print-Status "Installing Agent QA files..."
    } else {
        Write-Host ""
        Print-Status "Installing Agent QA files..."
    }

    $fileCount = Install-AllRepoFiles -DestBase $script:BaseDir

    if ($fileCount -gt 0) {
        Print-Success "Installed $fileCount files to $($script:BaseDir)"
        return $true
    }

    Print-Error "No files were downloaded"
    return $false
}

function New-InstallationBackup {
    $backupDir = "$($script:BaseDir).backup"
    if (Test-Path $backupDir) {
        Remove-Item $backupDir -Recurse -Force
    }

    Copy-Item -Path $script:BaseDir -Destination $backupDir -Recurse -Force
    Print-Success "Backed up existing installation to $backupDir"
    Write-Host ""
}

function Update-FullInstallation {
    param([string]$LatestVersion)

    New-InstallationBackup

    Print-Status "Updating agent-qa files..."
    $agentQaDir = Join-Path $script:BaseDir "agent-qa"
    if (Test-Path $agentQaDir) {
        Remove-Item $agentQaDir -Recurse -Force
    }
    $fileCount = Install-RepoFilesWithPrefix -DestBase $script:BaseDir -Prefix "agent-qa/"
    Print-Success "Updated agent-qa files ($($fileCount) files)"
    Write-Host ""

    Print-Status "Updating scripts..."
    $scriptsDir = Join-Path $script:BaseDir "scripts"
    if (Test-Path $scriptsDir) {
        Remove-Item $scriptsDir -Recurse -Force
    }
    $fileCount = Install-RepoFilesWithPrefix -DestBase $script:BaseDir -Prefix "scripts/"
    Print-Success "Updated scripts ($($fileCount) files)"
    Write-Host ""

    Print-Status "Updating version number in config.yml..."
    $configFile = Join-Path $script:BaseDir "config.yml"
    if ((Test-Path $configFile) -and -not [string]::IsNullOrWhiteSpace($LatestVersion)) {
        Write-YamlValue -File $configFile -Key "version" -Value $LatestVersion
        Print-Success "Updated version to $LatestVersion in config.yml"
    }
    Write-Host ""

    Print-Success "Full update completed!"
}

function Update-ScriptsOnly {
    New-InstallationBackup

    $scriptsDir = Join-Path $script:BaseDir "scripts"
    if (Test-Path $scriptsDir) {
        Remove-Item $scriptsDir -Recurse -Force
    }

    $fileCount = Install-RepoFilesWithPrefix -DestBase $script:BaseDir -Prefix "scripts/"
    Print-Success "Updated scripts ($($fileCount) files)"
    Write-Host ""
    Print-Success "Scripts have been updated!"
}

function Update-ConfigOnly {
    $templateDest = Join-Path $script:BaseDir "config.yml.template"
    if (Save-RepoFile -RelativePath "agent-qa/config.yml.template" -DestPath $templateDest) {
        Print-Verbose "  Downloaded: config.yml.template"
    }

    $configFile = Join-Path $script:BaseDir "config.yml"
    if (-not (Test-Path $configFile) -and (Test-Path $templateDest)) {
        Copy-Item $templateDest $configFile
    }

    Print-Success "Updated config.yml"
    Write-Host ""
    Print-Success "Config has been updated!"
}

function Reset-Installation {
    $backupDir = "$($script:BaseDir).backup"
    if (Test-Path $backupDir) {
        Remove-Item $backupDir -Recurse -Force
    }

    Move-Item -Path $script:BaseDir -Destination $backupDir
    Print-Success "Backed up existing installation to $backupDir"
    Write-Host ""

    Start-FreshInstallation
}

function Show-OverwriteChoice {
    param(
        [string]$CurrentVersion,
        [string]$LatestVersion
    )

    Write-Host ""
    Print-Color -Color $script:YELLOW -Message ('=== ' + [char]0x26A0 + '  Existing Installation Detected ===')
    Write-Host ""
    Write-Host "You already have a base installation of Agent QA"

    if ($CurrentVersion) {
        Print-Color -Color $script:YELLOW -Message "  Your installed version: $CurrentVersion"
    } else {
        Write-Host "  Your installed version: (unknown)"
    }

    if ($LatestVersion) {
        Print-Color -Color $script:YELLOW -Message "  Latest available version: $LatestVersion"
    } else {
        Write-Host "  Latest available version: (unable to determine)"
    }

    Write-Host ""
    Print-Status "What would you like to do?"
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "1) Full update"
    Write-Host ""
    Write-Host "    Updates & overwrites:"
    Write-Host "    - ~/agent-qa/agent-qa/*"
    Write-Host "    - ~/agent-qa/scripts/*"
    Write-Host ""
    Write-Host "    Updates your version number in ~/agent-qa/config.yml but doesn't change anything else in this file."
    Write-Host ""
    Write-Host "    Everything else in your ~/agent-qa folder will remain intact."
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "2) Update scripts only"
    Write-Host ""
    Write-Host "    Updates & overwrites:"
    Write-Host "    - ~/agent-qa/scripts/*"
    Write-Host ""
    Write-Host "    Everything else in your ~/agent-qa folder will remain intact."
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "3) Update config.yml only"
    Write-Host ""
    Write-Host "    Updates & overwrites:"
    Write-Host "    - ~/agent-qa/config.yml"
    Write-Host ""
    Write-Host "    Everything else in your ~/agent-qa folder will remain intact."
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "4) Delete & reinstall fresh"
    Write-Host ""
    Write-Host "    - Makes a backup of your current ~/agent-qa folder at ~/agent-qa.backup"
    Write-Host "    - Deletes your current ~/agent-qa folder and all of its contents."
    Write-Host "    - Installs a fresh ~/agent-qa base installation"
    Write-Host ""
    Print-Color -Color $script:YELLOW -Message "5) Cancel and abort"
    Write-Host ""

    $choice = Read-Host "Enter your choice (1-5)"

    switch ($choice) {
        "1" {
            Write-Host ""
            Print-Status "Performing full update..."
            Update-FullInstallation -LatestVersion $LatestVersion
        }
        "2" {
            Write-Host ""
            Print-Status "Updating scripts..."
            Update-ScriptsOnly
        }
        "3" {
            Write-Host ""
            Print-Status "Updating config.yml..."
            Update-ConfigOnly
        }
        "4" {
            Write-Host ""
            Print-Status "Deleting & reinstalling fresh..."
            Reset-Installation
        }
        "5" {
            Write-Host ""
            Print-Warning "Installation cancelled"
            exit 0
        }
        default {
            Print-Error "Invalid choice. Installation cancelled."
            exit 1
        }
    }
}

function Start-FreshInstallation {
    Write-Host ""
    Print-Status "Configuration:"
    Print-Color -Color $script:YELLOW -Message "  Repository: $($script:RepoUrl)"
    Print-Color -Color $script:YELLOW -Message "  Target: $($script:BaseDir)"
    Write-Host ""

    Ensure-Dir -Dir $script:BaseDir
    Print-Success "Created base directory: $($script:BaseDir)"
    Write-Host ""

    if (-not (Install-AllFiles)) {
        Print-Error "Installation failed"
        exit 1
    }

    Write-Host ""
    Print-Success "Agent QA has been successfully installed!"
    Write-Host ""
    Print-Color -Color $script:GREEN -Message "Next steps:"
    Write-Host ""
    Print-Color -Color $script:GREEN -Message "1) Navigate to a project directory"
    Print-Color -Color $script:YELLOW -Message "   cd path\to\project-directory"
    Write-Host ""
    Print-Color -Color $script:GREEN -Message "2) Install Agent QA in your project by running:"
    Print-Color -Color $script:YELLOW -Message "   $($script:BaseDir)\scripts\project-install.sh"
    Write-Host "   (Use Git Bash or WSL for project-install.sh, or install.ps1 for PowerShell project setup)"
    Write-Host ""
}

function Test-ExistingInstallation {
    if (Test-Path $script:BaseDir) {
        $configFile = Join-Path $script:BaseDir "config.yml"
        $currentVersion = Get-YamlValue -File $configFile -Key "version" -Default ""
        $latestVersion = Get-LatestVersion
        Show-OverwriteChoice -CurrentVersion $currentVersion -LatestVersion $latestVersion
    } else {
        Start-FreshInstallation
    }
}

function Show-Help {
    Write-Host @"
Usage: .\base-install.ps1 [OPTIONS]

Install Agent QA from GitHub to $env:USERPROFILE\agent-qa.

Options:
    -Verbose    Show detailed output
    -Help       Show this help message

Examples:
    .\base-install.ps1
    .\base-install.ps1 -Verbose

One-line install from GitHub:
    irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex

"@
    exit 0
}

if ($Help) {
    Show-Help
}

$script:VERBOSE = [bool]$Verbose

Write-Bootstrap "Initializing..."
$commonFunctionsScript = Get-CommonFunctionsScript
$removeCommonFunctionsScript = $commonFunctionsScript -like "$([System.IO.Path]::GetTempPath())*"
try {
    # Dot-source at script scope so functions are visible to all script functions
    . $commonFunctionsScript
} finally {
    if ($removeCommonFunctionsScript -and (Test-Path $commonFunctionsScript)) {
        Remove-Item $commonFunctionsScript -Force -ErrorAction SilentlyContinue
    }
}

Print-Section "Agent QA Base Installation"
Test-ExistingInstallation
