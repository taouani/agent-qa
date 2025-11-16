# Manage Project ID

Manage repository project ID from configuration or input parameters.

## Purpose

This instruction file provides a standardized way to handle repository project ID, which may come from configuration files or input parameters. Commands should use this framework file to ensure consistent project ID management across platforms.

## Core Responsibilities

1. **Check Configuration File**: Look for project ID in config file
2. **Check Input Parameters**: Look for project ID in input parameters
3. **Validate Project ID Format**: Ensure project ID format is valid for the platform
4. **Handle Errors**: Provide clear error messages for missing or invalid project IDs

## Workflow

### Step 1: Check Configuration File

Check for project ID in configuration files:

1. **Check `agent-qa/config.yml`**:
   - Look for `repository_project_id` key at root level
   - If found, read project ID value

2. **Check `agent-os/config.yml`** (fallback):
   - If not found in `agent-qa/config.yml`, check `agent-os/config.yml`
   - If found, read project ID value

3. **Store Config Project ID**:
   - If found, store project ID from config
   - Mark source as "config"

### Step 2: Check Input Parameters

Check for project ID in input parameters:

1. **Check Input Parameters**:
   - Look for `repository_project_id` parameter
   - Look for `project_id` parameter (alternative name)
   - Look for `repo_project_id` parameter (alternative name)

2. **Store Input Project ID**:
   - If found, store project ID from input
   - Mark source as "input"

### Step 3: Determine Project ID Source

Determine which project ID to use (priority order):

1. **Input Parameter** (highest priority):
   - If project ID provided in input parameters, use input value
   - Input parameters override config file values

2. **Configuration File** (fallback):
   - If no input parameter, use config file value
   - Config file provides default value

3. **Error if Neither**:
   - If neither source provides project ID, proceed to error handling

### Step 4: Validate Project ID Format

Validate project ID format based on platform:

#### GitLab Platform

- Project ID can be numeric (e.g., `12345`) or path-based (e.g., `group/project`)
- Both formats are valid
- No strict format validation required

#### GitHub Platform

- Repository identifier can be `owner/repo` format (e.g., `octocat/Hello-World`)
- Must contain forward slash
- Validate format: `[owner]/[repo]`

#### Azure DevOps Platform

- Project ID is typically a GUID or project name
- Repository ID may also be required (separate parameter)
- Validate format based on Azure DevOps requirements

### Step 5: Error Handling

**If Project ID Not Found:**

```
❌ Repository project ID not found

Please provide repository_project_id in one of the following ways:

1. Add to config file (agent-os/config.yml or agent-qa/config.yml):
   repository_project_id: [your-project-id]

2. Provide as input parameter:
   repository_project_id: [your-project-id]

Platform-specific formats:
- GitLab: Numeric ID (12345) or path (group/project)
- GitHub: owner/repo format (octocat/Hello-World)
- Azure DevOps: Project GUID or name
```

**If Project ID Format Invalid:**

```
❌ Invalid repository project ID format: [value]

Expected format for [Platform]:
- GitLab: Numeric ID or path (group/project)
- GitHub: owner/repo format
- Azure DevOps: Project GUID or name

Please verify the project ID format.
```

## Output

If successful:
- **Project ID**: The project ID value
- **Source**: `config` | `input`
- **Platform**: Platform identifier for format validation

## Usage Example

```markdown
## Step 3: Get Repository Project ID

Follow the instructions in: `agent-qa/framework/git-repository/config/manage-project-id.md`

Store the project ID for use in repository operations.
```

## Reference Patterns

This instruction file follows patterns from:
- `agent-qa/commands/analyze-commits/1-initialize-and-determine-input.md` - Project ID management patterns

## Important Notes

- Input parameters take priority over configuration file values
- Project ID format validation is platform-specific
- Framework supports multiple parameter names for flexibility
- Clear error messages guide users to provide valid project IDs
- Azure DevOps may require both project ID and repository ID (handled separately)

