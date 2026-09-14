# =============================================================================
# Agent QA Common Functions
# Shared utilities for Agent QA PowerShell scripts
# =============================================================================

# Colors for output
$script:RED = "`e[38;2;255;32;86m"
$script:GREEN = "`e[38;2;0;234;179m"
$script:YELLOW = "`e[38;2;255;185;0m"
$script:BLUE = "`e[38;2;0;208;255m"
$script:PURPLE = "`e[38;2;142;81;255m"
$script:NC = "`e[0m" # No Color

# -----------------------------------------------------------------------------
# Global Variables (set by scripts that source this file)
# -----------------------------------------------------------------------------
# These should be set by the calling script:
# $PROJECT_DIR, $DRY_RUN, $VERBOSE

# -----------------------------------------------------------------------------
# Output Functions
# -----------------------------------------------------------------------------

function Print-Color {
    param(
        [string]$Color,
        [string]$Message
    )
    Write-Host "$Color$Message$script:NC"
}

function Print-Section {
    param([string]$Title)
    Write-Host ""
    Print-Color -Color $script:BLUE -Message "=== $Title ==="
    Write-Host ""
}

function Print-Status {
    param([string]$Message)
    Print-Color -Color $script:BLUE -Message $Message
}

function Print-Success {
    param([string]$Message)
    Print-Color -Color $script:GREEN -Message (([char]0x2713) + ' ' + $Message)
}

function Print-Warning {
    param([string]$Message)
    Print-Color -Color $script:YELLOW -Message (([char]0x26A0) + '  ' + $Message)
}

function Print-Error {
    param([string]$Message)
    Print-Color -Color $script:RED -Message (([char]0x2717) + ' ' + $Message)
}

function Print-Verbose {
    param([string]$Message)
    if ($script:VERBOSE -eq $true) {
        Write-Host "[VERBOSE] $Message" -ForegroundColor Gray
    }
}

# -----------------------------------------------------------------------------
# YAML Parsing Functions
# -----------------------------------------------------------------------------

function Get-YamlValue {
    param(
        [string]$File,
        [string]$Key,
        [string]$Default = ""
    )

    if (-not (Test-Path $File)) {
        return $Default
    }

    $content = Get-Content $File -Raw
    $lines = $content -split "`n"

    foreach ($line in $lines) {
        # Normalize tabs to spaces
        $line = $line -replace "`t", "    "
        # Trim leading/trailing spaces
        $line = $line.Trim()

        # Match key: value pattern
        if ($line -match "^$Key\s*:\s*(.+)$") {
            $value = $matches[1].Trim()
            # Remove quotes if present
            $value = $value -replace '^[''"]', '' -replace '[''"]$', ''
            if ($value.Length -gt 0) {
                return $value
            }
        }
    }

    return $Default
}

function Get-YamlArray {
    param(
        [string]$File,
        [string]$Key
    )

    if (-not (Test-Path $File)) {
        return @()
    }

    $content = Get-Content $File
    $found = $false
    $keyIndent = -1
    $arrayIndent = -1
    $result = @()

    foreach ($line in $content) {
        # Normalize tabs to spaces
        $line = $line -replace "`t", "    "
        
        # Get indentation level
        $indent = $line.Length - $line.TrimStart().Length
        $trimmedLine = $line.Trim()

        # Found the key
        if (-not $found -and $trimmedLine -match "^$Key\s*:") {
            $found = $true
            $keyIndent = $indent
            continue
        }

        # Process array items under the key
        if ($found) {
            # If we hit a line with same or less indentation as key, stop
            if ($indent -le $keyIndent -and $trimmedLine -ne "" -and $trimmedLine -notmatch "^\s*$") {
                break
            }

            # Look for array items (- item)
            if ($trimmedLine -match "^\s*-\s*(.+)$") {
                # Set array indent from first item
                if ($arrayIndent -eq -1) {
                    $arrayIndent = $indent
                }

                # Only process items at the expected indentation
                if ($indent -eq $arrayIndent) {
                    $item = $matches[1].Trim()
                    # Remove quotes if present
                    $item = $item -replace '^[''"]', '' -replace '[''"]$', ''
                    $result += $item
                }
            }
        }
    }

    return $result
}

function Write-YamlValue {
    param(
        [string]$File,
        [string]$Key,
        [string]$Value
    )

    if (-not (Test-Path $File)) {
        # Create new file with the key-value pair
        "$Key`: $Value" | Out-File -FilePath $File -Encoding UTF8
        return
    }

    $content = Get-Content $File
    $updated = $false
    $newContent = @()

    foreach ($line in $content) {
        if ($line -match "^[`t ]*$Key\s*:") {
            # Update existing key
            $newContent += "$Key`: $Value"
            $updated = $true
        } else {
            $newContent += $line
        }
    }

    if (-not $updated) {
        # Append new key-value pair
        $newContent += "$Key`: $Value"
    }

    $newContent | Out-File -FilePath $File -Encoding UTF8
}

# -----------------------------------------------------------------------------
# File Operations Functions
# -----------------------------------------------------------------------------

function Ensure-Dir {
    param([string]$Dir)

    if ($script:DRY_RUN -eq $true) {
        if (-not (Test-Path $Dir)) {
            Print-Verbose "Would create directory: $Dir"
        }
    } else {
        if (-not (Test-Path $Dir)) {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
            Print-Verbose "Created directory: $Dir"
        }
    }
}

function Copy-File {
    param(
        [string]$Source,
        [string]$Dest
    )

    if ($script:DRY_RUN -eq $true) {
        return $Dest
    } else {
        $destDir = Split-Path -Parent $Dest
        Ensure-Dir -Dir $destDir
        Copy-Item -Path $Source -Destination $Dest -Force
        Print-Verbose "Copied: $Source -> $Dest"
        return $Dest
    }
}

function Write-File {
    param(
        [string]$Content,
        [string]$Dest
    )

    if ($script:DRY_RUN -eq $true) {
        return $Dest
    } else {
        $destDir = Split-Path -Parent $Dest
        Ensure-Dir -Dir $destDir
        $Content | Out-File -FilePath $Dest -Encoding UTF8
        Print-Verbose "Wrote file: $Dest"
    }
}

# -----------------------------------------------------------------------------
# Version Functions
# -----------------------------------------------------------------------------

function Get-Version {
    param([string]$ConfigFile)
    return Get-YamlValue -File $ConfigFile -Key "version" -Default "1.0.0"
}

# -----------------------------------------------------------------------------
# Configuration Functions
# -----------------------------------------------------------------------------

function Get-ProjectConfig {
    param(
        [string]$ProjectDir,
        [string]$Key,
        [string]$Default = ""
    )

    $configFile = Join-Path $ProjectDir "agent-qa\config.yml"
    return Get-YamlValue -File $configFile -Key $Key -Default $Default
}

function Test-AgentQAInstalled {
    param([string]$ProjectDir)

    $configFile = Join-Path $ProjectDir "agent-qa\config.yml"
    return (Test-Path $configFile)
}

# Backfill automation config keys into an existing config.yml.
# Projects installed before the live-automation feature was added never had
# these keys written by their original install, and the update path below
# only rewrites a handful of known keys. This appends any of the five keys
# that are missing, using the same defaults as config.yml.template. It never
# touches a key that is already present (whatever its value), and is safe to
# run repeatedly - already-present keys are left exactly as they are.
function Add-MissingAutomationConfig {
    param([string]$ConfigFile)

    if (-not (Test-Path $ConfigFile)) {
        return
    }

    $content = Get-Content $ConfigFile -Raw

    if ($content -notmatch '(?m)^playwright_project_root\s*:') {
        Add-Content -Path $ConfigFile -Value ""
        Add-Content -Path $ConfigFile -Value 'playwright_project_root: ""'
        Print-Verbose "Added missing config key: playwright_project_root"
        $content = Get-Content $ConfigFile -Raw
    }

    if ($content -notmatch '(?m)^browser_cli_command\s*:') {
        Add-Content -Path $ConfigFile -Value 'browser_cli_command: "playwright-cli"'
        Print-Verbose "Added missing config key: browser_cli_command"
        $content = Get-Content $ConfigFile -Raw
    }

    if ($content -notmatch '(?m)^automation\s*:\s*$') {
        Add-Content -Path $ConfigFile -Value ""
        Add-Content -Path $ConfigFile -Value "automation:"
        Add-Content -Path $ConfigFile -Value "  allow_source_edits: false      # Master switch. While false, all commands are report-only and never write outside agent-qa/."
        Add-Content -Path $ConfigFile -Value "  auth_state_ttl_minutes: 60     # Reuse a saved browser auth state younger than this."
        Add-Content -Path $ConfigFile -Value "  stability_runs: 3              # Consecutive passing runs required before a fix is considered stable."
        Print-Verbose "Added missing config block: automation"
        return
    }

    # automation: already exists - append only the sub-keys that are missing,
    # right after the automation: line, without touching existing sub-keys.
    $missingLines = @()
    if ($content -notmatch '(?m)^[ \t]+allow_source_edits\s*:') {
        $missingLines += "  allow_source_edits: false      # Master switch. While false, all commands are report-only and never write outside agent-qa/."
    }
    if ($content -notmatch '(?m)^[ \t]+auth_state_ttl_minutes\s*:') {
        $missingLines += "  auth_state_ttl_minutes: 60     # Reuse a saved browser auth state younger than this."
    }
    if ($content -notmatch '(?m)^[ \t]+stability_runs\s*:') {
        $missingLines += "  stability_runs: 3              # Consecutive passing runs required before a fix is considered stable."
    }

    if ($missingLines.Count -gt 0) {
        $lines = Get-Content $ConfigFile
        $newLines = @()
        $inserted = $false
        foreach ($line in $lines) {
            $newLines += $line
            if (-not $inserted -and $line -match '^automation\s*:\s*$') {
                $newLines += $missingLines
                $inserted = $true
            }
        }
        $newLines | Out-File -FilePath $ConfigFile -Encoding UTF8
        Print-Verbose "Added missing automation sub-key(s)"
    }
}

function New-OrUpdateConfig {
    param(
        [string]$ProjectDir,
        [string]$RepositoryPlatform,
        [string]$RepositoryProjectId,
        [string]$AzureDevOpsCloudId = ""
    )

    $configFile = Join-Path $ProjectDir "agent-qa\config.yml"
    $templateFile = Join-Path $ProjectDir "agent-qa\config.yml.template"

    # If template doesn't exist in project, use source template (for initial installation)
    if (-not (Test-Path $templateFile)) {
        # Try to find template in source location (where installation script is running from)
        $scriptDir = Split-Path -Parent $MyInvocation.PSCommandPath
        $templateFile = Join-Path (Split-Path -Parent $scriptDir) "agent-qa\config.yml.template"
    }

    if (Test-Path $configFile) {
        # Update existing config - preserve existing values unless new ones provided
        $existingVersion = Get-YamlValue -File $configFile -Key "version" -Default "1.0.0"
        $existingRepoPlatform = Get-YamlValue -File $configFile -Key "repository_platform" -Default ""
        $existingRepoProjectId = Get-YamlValue -File $configFile -Key "repository_project_id" -Default ""
        $existingCloudId = Get-YamlValue -File $configFile -Key "azure_devops_cloud_id" -Default ""

        # Use provided values or keep existing
        $finalRepoPlatform = if ($RepositoryPlatform) { $RepositoryPlatform } else { $existingRepoPlatform }
        $finalRepoProjectId = if ($RepositoryProjectId) { $RepositoryProjectId } else { $existingRepoProjectId }
        $finalCloudId = if ($AzureDevOpsCloudId) { $AzureDevOpsCloudId } else { $existingCloudId }

        # Update config file
        Write-YamlValue -File $configFile -Key "version" -Value $existingVersion
        Write-YamlValue -File $configFile -Key "last_installed" -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Write-YamlValue -File $configFile -Key "repository_platform" -Value $finalRepoPlatform
        Write-YamlValue -File $configFile -Key "repository_project_id" -Value $finalRepoProjectId
        if ($finalCloudId -or $AzureDevOpsCloudId) {
            Write-YamlValue -File $configFile -Key "azure_devops_cloud_id" -Value $finalCloudId
        }

        Print-Verbose "Updated existing config.yml"

        # Backfill automation keys that did not exist when this project was
        # first installed. Only adds missing keys; never rewrites existing ones.
        Add-MissingAutomationConfig -ConfigFile $configFile
    } else {
        # Create new config from template
        if (Test-Path $templateFile) {
            # Read template and replace placeholders
            $configContent = Get-Content $templateFile -Raw
            $configContent = $configContent -replace "last_installed:.*", "last_installed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            $configContent = $configContent -replace "repository_platform:.*", "repository_platform: $(if ($RepositoryPlatform) { $RepositoryPlatform } else { 'gitlab' })"
            $configContent = $configContent -replace 'repository_project_id:.*', "repository_project_id: `"$RepositoryProjectId`""
            if ($AzureDevOpsCloudId) {
                $configContent = $configContent -replace 'azure_devops_cloud_id:.*', "azure_devops_cloud_id: `"$AzureDevOpsCloudId`""
            }

            Write-File -Content $configContent -Dest $configFile
            Print-Verbose "Created new config.yml from template"
        } else {
            # Create minimal config if template not found
            $configContent = @"
version: 1.0.0
last_installed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

repository_platform: $(if ($RepositoryPlatform) { $RepositoryPlatform } else { 'gitlab' })
repository_project_id: "$RepositoryProjectId"
"@
            if ($AzureDevOpsCloudId) {
                $configContent += [Environment]::NewLine + "azure_devops_cloud_id: `"$AzureDevOpsCloudId`""
            }
            Write-File -Content $configContent -Dest $configFile
            Print-Verbose "Created minimal config.yml"
        }
    }
}

