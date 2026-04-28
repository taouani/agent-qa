# Get Cloud ID (Azure DevOps)

Retrieve Azure DevOps cloud ID from configuration or input parameters.

## Purpose

This instruction file provides a standardized way to handle Azure DevOps cloud ID, which is required for Azure DevOps operations. This is Azure DevOps-specific and should only be used when platform is `azure-devops`.

## Core Responsibilities

1. **Verify Platform**: Ensure platform is Azure DevOps
2. **Check Configuration File**: Look for cloud ID in config file
3. **Check Input Parameters**: Look for cloud ID in input parameters
4. **Validate Cloud ID Format**: Ensure cloud ID format is valid
5. **Handle Errors**: Provide clear error messages for missing or invalid cloud IDs

## Workflow

### Step 1: Verify Platform

Verify that the platform is Azure DevOps:

1. **Get Platform Value**:
   - Retrieve platform value from memory (set by `read-platform-config.md`)
   - Platform must be `azure-devops`

2. **Handle Wrong Platform**:
   - If platform is not `azure-devops`, skip this step
   - Cloud ID is only required for Azure DevOps operations
   - Return early if platform is not Azure DevOps

### Step 2: Check Configuration File

Check for cloud ID in configuration files:

1. **Check `agent-qa/config.yml`**:
   - Look for `azure_devops_cloud_id` key at root level
   - Look for `cloud_id` key at root level (alternative name)
   - If found, read cloud ID value

2. **Check `agent-qa/config.yml`** (primary):
   - Read from `agent-qa/config.yml`
   - If found, read cloud ID value

3. **Store Config Cloud ID**:
   - If found, store cloud ID from config
   - Mark source as "config"

### Step 3: Check Input Parameters

Check for cloud ID in input parameters:

1. **Check Input Parameters**:
   - Look for `azure_devops_cloud_id` parameter
   - Look for `cloud_id` parameter (alternative name)
   - Look for `azure_cloud_id` parameter (alternative name)

2. **Store Input Cloud ID**:
   - If found, store cloud ID from input
   - Mark source as "input"

### Step 4: Determine Cloud ID Source

Determine which cloud ID to use (priority order):

1. **Input Parameter** (highest priority):
   - If cloud ID provided in input parameters, use input value
   - Input parameters override config file values

2. **Configuration File** (fallback):
   - If no input parameter, use config file value
   - Config file provides default value

3. **Error if Neither**:
   - If neither source provides cloud ID, proceed to error handling

### Step 5: Validate Cloud ID Format

Validate cloud ID format:

1. **Cloud ID Format**:
   - Azure DevOps cloud ID is typically a UUID format
   - Can also be extracted from Azure DevOps URLs
   - Format: `[guid]` or extracted from URL pattern

2. **Validation**:
   - Check if cloud ID matches UUID pattern (optional)
   - Accept any non-empty string (Azure DevOps will validate)

### Step 6: Error Handling

**If Cloud ID Not Found:**

```
❌ Azure DevOps cloud ID not found

Please provide azure_devops_cloud_id in one of the following ways:

1. Add to config file (agent-qa/config.yml):
   azure_devops_cloud_id: [your-cloud-id]

2. Provide as input parameter:
   azure_devops_cloud_id: [your-cloud-id]

Cloud ID can be:
- Extracted from Azure DevOps URLs (e.g., from https://dev.azure.com/{organization}/...)
- Found in Azure DevOps API responses
- Retrieved using Azure DevOps MCP tools
```

**If Cloud ID Format Invalid:**

```
❌ Invalid Azure DevOps cloud ID format: [value]

Cloud ID should be a valid UUID or extracted from Azure DevOps URLs.

Please verify the cloud ID format.
```

## Output

If successful:
- **Cloud ID**: The cloud ID value
- **Source**: `config` | `input`
- **Platform**: `azure-devops`

## Usage Example

```markdown
## Step 4: Get Azure DevOps Cloud ID (if platform is azure-devops)

If platform is azure-devops, follow the instructions in: `agent-qa/framework/git-repository/config/get-cloud-id.md`

Store the cloud ID for use in Azure DevOps operations.
```

## Reference Patterns

This instruction file follows patterns from:
- `agent-qa/commands/analyze-commits/1-initialize-and-determine-input.md` - Configuration reading patterns

## Important Notes

- Cloud ID is only required for Azure DevOps platform
- Input parameters take priority over configuration file values
- Cloud ID can be extracted from Azure DevOps URLs or API responses
- Framework supports multiple parameter names for flexibility
- Clear error messages guide users to provide valid cloud IDs

