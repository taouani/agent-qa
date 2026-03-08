# Read Platform Configuration

Read repository platform configuration from YAML config files.

## Purpose

This instruction file provides a standardized way to read the repository platform setting from agent configuration files. Commands should use this framework file instead of implementing platform reading logic directly.

## Core Responsibilities

1. **Locate Configuration File**: Check for configuration files in standard locations
2. **Read Platform Setting**: Read `repository_platform` value from config
3. **Validate Platform Value**: Ensure platform is one of the supported values
4. **Handle Errors**: Provide clear error messages for missing or invalid configuration

## Workflow

### Step 1: Locate Configuration File

Check for configuration files in the following order:

1. **Check `agent-qa/config.yml`**:
   - Look for file at `agent-qa/config.yml`
   - If found, read from this file

2. **Check `agent-qa/config.yml`** (primary):
   - Read from `agent-qa/config.yml`
   - If found, read from this file

3. **Error if Not Found**:
   - If neither file exists, proceed to error handling

### Step 2: Read Platform Setting

Read the `repository_platform` setting from the configuration file:

1. **Parse YAML File**:
   - Read and parse the YAML configuration file
   - Look for `repository_platform` key at root level

2. **Extract Platform Value**:
   - Read the value of `repository_platform`
   - Supported values: `github`, `gitlab`, `azure-devops` (case-insensitive)
   - Normalize value to lowercase for consistency

3. **Store Platform Value**:
   - Store platform value in memory for use by subsequent operations
   - Document platform value for reference

### Step 3: Validate Platform Value

Validate that the platform value is one of the supported platforms:

1. **Check Supported Platforms**:
   - Valid values: `github`, `gitlab`, `azure-devops`
   - Case-insensitive comparison

2. **Handle Invalid Values**:
   - If value is not one of the supported platforms, proceed to error handling
   - Provide clear error message with supported values

### Step 4: Error Handling

**If Configuration File Not Found:**

```
❌ Repository platform configuration not found

Please configure repository platform in agent-qa/config.yml:

repository_platform: [github|gitlab|azure-devops]
```

**If Platform Value is Invalid:**

```
❌ Invalid repository platform: [value]

Supported platforms: github, gitlab, azure-devops

Please update repository_platform in your config file.
```

**If Platform Value is Missing:**

```
❌ Repository platform not configured

Please add repository_platform setting to agent-qa/config.yml:

repository_platform: [github|gitlab|azure-devops]
```

## Output

If successful, store the platform value:
- **Platform**: `github` | `gitlab` | `azure-devops`
- **Source**: Path to config file used

## Usage Example

```markdown
## Step 1: Read Platform Configuration

Follow the instructions in: `agent-qa/framework/git-repository/config/read-platform-config.md`

Store the platform value for use in subsequent steps.
```

## Reference Patterns

This instruction file follows patterns from:
- `agent-qa/commands/analyze-commits/1-initialize-and-determine-input.md` - Configuration reading patterns

## Important Notes

- Configuration reading is case-insensitive for platform values
- Framework reads from `agent-qa/config.yml`
- Platform value must be one of: `github`, `gitlab`, `azure-devops`
- Clear error messages guide users to fix configuration issues

