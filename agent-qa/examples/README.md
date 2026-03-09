# Agent-QA Example Outputs

This folder contains sample outputs demonstrating what each command produces. These examples use a fictional Jira ticket `DEMO-42` (a user login feature).

## Example Files

| File | Command | Description |
|------|---------|-------------|
| `requirement-analysis.md` | `analyze-requirements` | Analyzed requirement with acceptance criteria |
| `test-cases.md` | `generate-test-cases` | Test cases (positive, negative, edge) |
| `xray-bulk-import.csv` | `generate-test-cases` | Xray CSV export |
| `test-strategy.md` | `generate-test-strategy` | Test strategy document |
| `test-charter.md` | `generate-test-charter` | Exploratory test charter |
| `test-plan.md` | `generate-test-plan` | Test plan with scope and schedule |
| `risk-register.md` | `generate-risk-register` | Risk register with scoring |
| `login.feature` | `generate-gherkin` | Gherkin BDD feature file |
| `login.spec.ts` | `generate-playwright-tests` | Playwright test spec |
| `login.page.ts` | `generate-playwright-tests` | Playwright page object |
| `api-tests.md` | `generate-api-tests` | API test specifications |
| `accessibility-tests.md` | `generate-accessibility-tests` | WCAG 2.1 AA test cases |
| `test-data.md` | `generate-test-data` | Structured test data sets |

## How to Use

These examples serve as references for:
- Understanding the output format of each command
- Verifying your generated outputs match expected structure
- Training team members on Agent-QA deliverables
