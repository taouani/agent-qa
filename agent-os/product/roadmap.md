# Product Roadmap

1. [x] Atlassian MCP Server Integration — Integrate with Atlassian MCP server to authenticate and access Jira tickets, including support for reading epics, stories, filters, and retrieving ticket details, acceptance criteria, and metadata `M`

2. [x] Requirements Analysis Engine — Build core requirements analysis capability that extracts and structures requirements from Jira tickets, identifies acceptance criteria, dependencies, and relationships between tickets `M`

3. [x] Test Case Generation — Generate comprehensive test cases from analyzed requirements, including positive, negative, and edge cases with preconditions, test steps, expected results, and test data requirements `L`

4. [x] Test Plan Generation — Create detailed test plans with executive summary, test objectives, scope, test strategy, environment requirements, schedules, entry/exit criteria, and deliverables `M`

5. [x] Test Strategy Generation — Generate comprehensive test strategies covering test levels (integration, system, UAT), test types (specific types based on requirements), test design techniques, automation approach, and metrics `M`

6. [x] Test Charter Generation — Create exploratory test charters with mission/goal, scope (in/out), areas to explore, test approach, risks, resource requirements, and time estimates `S`

7. [x] Risk Register Generation — Automatically identify and document risks with risk ID, description, category, probability, impact, risk score, mitigation strategies, contingency plans, and ownership `M`

8. [x] Confluence Page Analysis — Integrate Confluence page retrieval and analysis through Atlassian MCP, extracting requirements and content from linked Confluence pages referenced in Jira tickets `M`

9. [x] Epic, Sprint, and Release Analysis — Process Jira filters representing epics, sprints, or releases, automatically retrieving all related tickets, child stories, and linked content for comprehensive scope analysis. Use context-aware terminology: "requirement" for single tickets, "release" for release filters, and "sprint" for sprint filters `M`

10. [x] Child Story Processing — Automatically detect and process all child stories when analyzing epics, ensuring complete requirement coverage across hierarchical ticket structures `S`

11. [x] Git Repository Integration Framework — Build framework for integrating with git repositories (GitLab, GitHub, Azure DevOps) through MCP servers, supporting commit analysis, pull request/merge request retrieval, and code change tracking `L`

12. [x] Commit and Pull Request Analysis — Analyze git commits, pull requests, and merge requests to extract code changes, identify affected requirements, and correlate changes with Jira tickets for traceability `M`

13. [ ] Test Automation Script Generation — Generate Playwright automation scripts for selected/candidate test cases using Playwright MCP server, creating maintainable test code following Page Object Model patterns `L`

14. [x] Technical Release Note Generation — Create technical release notes with full requirement traceability, linking code changes (commits/PRs) to requirements (Jira tickets), test cases, and documenting feature changes and impacts `M`

15. [x] Multi-Repository Support — Implement user-selectable repository MCP integration (GitLab, GitHub, or Azure DevOps) with installation-time configuration prompt to choose the appropriate repository platform `S`

16. [x] Installation and Configuration System — Create installation scripts (bash and PowerShell) that prompt users for MCP server configuration, repository platform selection, and set up agent-qa with proper MCP server connections and authentication `M`

17. [x] Agent Command Structure — Implement agent-os compatible command structure for agent-qa workflows, including commands for requirements analysis, test generation, and deliverable creation following agent-os patterns `M`

18. [ ] Output Formatting and Export — Format all generated deliverables (test cases, test plans, test strategies, test charters, risk registers) as markdown documents with proper structure, tables, and export capabilities `S`

19. [ ] Error Handling and Validation — Implement comprehensive error handling for MCP server failures, missing data scenarios, invalid ticket references, and validation of generated deliverables for completeness and quality `M`

> Notes
> - Order items by technical dependencies and agent architecture
> - Each item should represent an end-to-end (frontend + backend) functional and testable feature
> - Focus on MVP first (items 1-7), then expand to advanced features (items 8-19)
> - MCP server integrations are foundational and should be prioritized early
> - Test generation capabilities build incrementally from basic to advanced
> - Use context-aware terminology: "requirement" for single Jira tickets, "release" for Jira filters, "sprint" for sprint-based analysis
> - Jira Xray Integration (previously item #11) has been descoped from the roadmap

