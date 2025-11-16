# Generate Release Notes Command

You are helping to generate technical release notes with full requirement traceability, linking code changes, requirements, and test cases for agent-qa.

This command checks for existing requirements analysis, prompts the user to choose which one to use (or automatically calls `analyze-requirements` if none found), loads related deliverables, and generates comprehensive technical release notes.

**Input**: User selection of requirements analysis folder (or automatic `analyze-requirements` call)
**Output**: Release note markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/release-notes/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-release-notes/1-find-and-select-requirements.md}}

{{PHASE 2: @agent-qa/commands/generate-release-notes/2-load-requirements-and-check-commits.md}}

{{PHASE 3: @agent-qa/commands/generate-release-notes/3-generate-release-note-content.md}}

{{PHASE 4: @agent-qa/commands/generate-release-notes/4-generate-traceability-matrix.md}}

{{PHASE 5: @agent-qa/commands/generate-release-notes/5-generate-release-note-files.md}}
