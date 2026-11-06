/**
 * The hand-written suite of the `debug` harness case (S3-10): a test and a
 * page object as a person writes them, not as Agent-QA generates them. The
 * test opens a seeded person's request by name, submits it, and checks its
 * status, which the stand-in app's seeded bug turns to Rejected.
 */

export const HAND_WRITTEN_SPEC = "tests/submit-request.spec.ts";
export const HAND_WRITTEN_PAGE = "tests/pages/request-page.ts";
/** The test's title, as Playwright reports it. */
export const HAND_WRITTEN_TITLE = "a submitted request shows as Submitted";

/**
 * With `flaws` (the `review` case, S3-4): two known problems a review must
 * find, a fixed wait in the spec (the code scan's) and a check inside the
 * page object (the model's).
 */
export function handWrittenSuite(person: string, flaws = false): Array<{ path: string; content: string }> {
  return [
    {
      path: HAND_WRITTEN_PAGE,
      content: [
        flaws ? "import { expect, type Locator, type Page } from '@playwright/test';" : "import type { Locator, Page } from '@playwright/test';",
        "",
        "export class RequestPage {",
        "  constructor(private readonly page: Page) {}",
        "",
        "  async open(requester: string) {",
        "    await this.page.goto('/lightning/o/Approval_Request__c/list');",
        "    await this.page.getByRole('link', { name: requester }).click();",
        "  }",
        "",
        "  async submit() {",
        "    await this.page.getByRole('button', { name: 'Submit for Approval' }).click();",
        ...(flaws ? ["    await expect(this.page.getByRole('status')).toBeVisible();"] : []),
        "  }",
        "",
        "  details(): Locator {",
        "    return this.page.getByRole('region', { name: 'Details' });",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: HAND_WRITTEN_SPEC,
      content: [
        "import { expect, test } from '@playwright/test';",
        "import { RequestPage } from './pages/request-page';",
        "",
        `test('${HAND_WRITTEN_TITLE}', async ({ page }) => {`,
        "  const request = new RequestPage(page);",
        `  await request.open('${person.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');`,
        ...(flaws ? ["  await page.waitForTimeout(1000);"] : []),
        "  await request.submit();",
        "  await expect(request.details()).toContainText('Submitted');",
        "});",
        "",
      ].join("\n"),
    },
  ];
}
