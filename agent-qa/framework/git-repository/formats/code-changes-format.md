# Code Changes Format

Standardized format for code changes/diffs across all platforms.

## Purpose

This document defines the standardized format for code changes that all platform implementations must return, ensuring consistent data structure regardless of platform.

## Standardized Format

```json
{
  "file_paths": ["string"],
  "files": [
    {
      "file_path": "string",
      "lines_added": 10,
      "lines_removed": 5,
      "diff_snippet": "string"
    }
  ],
  "total_files_changed": 5,
  "total_lines_added": 50,
  "total_lines_removed": 25
}
```

## Field Definitions

### file_paths

- **Type**: Array of strings
- **Description**: List of all file paths changed
- **Format**: Array of relative file paths
- **Required**: Yes

### files

- **Type**: Array of objects
- **Description**: Detailed change information per file
- **Required**: Yes

### files[].file_path

- **Type**: String
- **Description**: Relative file path
- **Format**: File path relative to repository root
- **Required**: Yes

### files[].lines_added

- **Type**: Number
- **Description**: Number of lines added in this file
- **Format**: Integer
- **Required**: Yes

### files[].lines_removed

- **Type**: Number
- **Description**: Number of lines removed in this file
- **Format**: Integer
- **Required**: Yes

### files[].diff_snippet

- **Type**: String
- **Description**: Actual code diff snippet
- **Format**: Unified diff format or platform-specific diff format
- **Required**: Yes (may be empty string if diff not available)

### total_files_changed

- **Type**: Number
- **Description**: Total number of files changed
- **Format**: Integer
- **Required**: Yes

### total_lines_added

- **Type**: Number
- **Description**: Total lines added across all files
- **Format**: Integer
- **Required**: Yes

### total_lines_removed

- **Type**: Number
- **Description**: Total lines removed across all files
- **Format**: Integer
- **Required**: Yes

## Platform Transformations

All platforms must extract:
- File paths from diff response
- Lines added/removed per file
- Diff snippets (actual code changes)
- Calculate totals across all files

## Usage Example

All platform implementations must transform their diff responses to this format before returning to commands.

## Important Notes

- File paths should be relative to repository root
- Diff snippets should contain actual code changes, not just metadata
- Totals should be calculated from individual file changes
- Empty arrays/objects are acceptable if no changes found

