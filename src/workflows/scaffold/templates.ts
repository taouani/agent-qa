import { lightningHelpersSource } from "../packs/salesforce.js";

/**
 * The files of a new Playwright TypeScript repo for Salesforce (S2-12),
 * written into an empty folder once the person says yes. It follows the
 * reference repo's shape: Lightning base pages from the Salesforce pack,
 * sign-in with the OAuth 2.0 JWT bearer flow (no password, so no MFA
 * prompt), faker test data, ESLint and a GitHub Actions workflow. No secret
 * is written: .env.example names the variables, and .env is git-ignored.
 */

export const SCAFFOLD_STYLES = ["bdd", "plain"] as const;
export type ScaffoldStyle = (typeof SCAFFOLD_STYLES)[number];

export interface ScaffoldFile {
  path: string;
  content: string;
  /**
   * When the folder has the file already (a repo made on GitHub, or after
   * `agent-qa init`): keep it as it is, or add only the lines it lacks.
   * Without it, an existing file stops the new repo.
   */
  existing?: "keep" | "add-lines";
}

/** Versions known to work together (Playwright 1.49 is the explorer's minimum). */
const VERSIONS = {
  playwright: "^1.58.0",
  playwrightBdd: "^9.2.1",
  faker: "^10.0.0",
  // typescript-eslint 8 supports TypeScript below 6.1.
  typescript: "^5.9.0",
  eslint: "^10.0.0",
  typescriptEslint: "^8.72.0",
  typesNode: "^22.0.0",
  dotenv: "^17.0.0",
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function packageJson(name: string, style: ScaffoldStyle): string {
  return json({
    name,
    private: true,
    description: "Playwright tests for Salesforce, started by Agent-QA",
    // faker 10 is ESM only: a CommonJS repo loads it with require(esm), from Node 20.19.
    engines: { node: ">=20.19" },
    scripts: {
      test: style === "bdd" ? "bddgen && playwright test" : "playwright test",
      "test:headed": style === "bdd" ? "bddgen && playwright test --headed" : "playwright test --headed",
      typecheck: "tsc --noEmit",
      lint: "eslint .",
    },
    devDependencies: {
      "@faker-js/faker": VERSIONS.faker,
      "@playwright/test": VERSIONS.playwright,
      "@types/node": VERSIONS.typesNode,
      dotenv: VERSIONS.dotenv,
      eslint: VERSIONS.eslint,
      ...(style === "bdd" ? { "playwright-bdd": VERSIONS.playwrightBdd } : {}),
      typescript: VERSIONS.typescript,
      "typescript-eslint": VERSIONS.typescriptEslint,
    },
  });
}

function playwrightConfig(style: ScaffoldStyle): string {
  return `import { defineConfig, devices } from '@playwright/test';
${style === "bdd" ? "import { defineBddConfig } from 'playwright-bdd';\n" : ""}import 'dotenv/config';
${
  style === "bdd"
    ? `
// Gherkin features in tests/features become Playwright tests in .features-gen (npx bddgen).
const testDir = defineBddConfig({
  features: 'tests/features/**/*.feature',
  steps: ['tests/steps/**/*.ts', 'src/fixtures.ts'],
});
`
    : ""
}
export default defineConfig({
  testDir: ${style === "bdd" ? "testDir" : "'tests'"},
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Salesforce flows can be slow.
  timeout: 180_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.SF_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
`;
}

const TSCONFIG = json({
  compilerOptions: {
    target: "ES2022",
    module: "commonjs",
    moduleResolution: "node",
    strict: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["node"],
  },
  include: ["src", "tests", "playwright.config.ts"],
});

const ESLINT = `import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'playwright-report', 'test-results', '.features-gen'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // A fixed wait hides a missing one: wait for an element or a state instead.
      'no-restricted-properties': ['error', { property: 'waitForTimeout', message: 'Wait for an element or a state, never a fixed time.' }],
    },
  },
  {
    // Agent-QA's Lightning helpers poll for a spinner to stay gone: their short pauses are the wait.
    files: ['src/support/lightning.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
`;

const GITIGNORE = `node_modules/
.env
test-results/
playwright-report/
blob-report/
.features-gen/
.agent-qa/
`;

const ENV_EXAMPLE = `# Copy to .env (never commit .env). The tests sign in with the OAuth 2.0 JWT bearer flow
# of an External Client App: no password, so no MFA prompt.

# The org's My Domain URL, e.g. https://acme--uat.sandbox.my.salesforce.com
SF_BASE_URL=
# https://test.salesforce.com for a sandbox, https://login.salesforce.com otherwise
SF_LOGIN_URL=https://test.salesforce.com
# The External Client App's consumer key
SF_CLIENT_ID=
# Its private key: a file path, or the PEM itself in SF_JWT_KEY
SF_JWT_KEY_FILE=../certs/server.key

# One username per test role: SF_USER_<ROLE>, used as signIn('<role>')
SF_USER_STANDARD=
`;

const AUTH = `import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Salesforce sign-in with the OAuth 2.0 JWT bearer flow of an External Client
 * App: no password, so no MFA prompt.
 *
 * 1. Sign an RS256 assertion (iss = consumer key, sub = username, aud = login host).
 * 2. Exchange it at {SF_LOGIN_URL}/services/oauth2/token for an access token.
 * 3. Exchange that at {instance}/services/oauth2/singleaccess for a single-use
 *    URL that opens a Lightning session. It works once, for about a minute:
 *    mint it right before use.
 *
 * Each test user needs the permission set that carries the app, or the token
 * request fails with invalid_app_access.
 */

const HINTS: Record<string, string> = {
  invalid_app_access: 'assign the user the permission set that carries the External Client App',
  invalid_grant: 'the key may not match the app certificate, the username may be wrong for this org, or SF_LOGIN_URL is not https://test.salesforce.com for a sandbox',
  invalid_client: 'the consumer key does not match an app in this org (a new app can take 30 minutes)',
  inactive_user: 'the Salesforce user is inactive',
};

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(\`Set \${name} in .env (see .env.example)\`);
  return value;
}

function privateKey(): string {
  const inline = process.env.SF_JWT_KEY;
  if (inline) return inline.includes('-----BEGIN') ? inline.replace(/\\\\n/g, '\\n') : Buffer.from(inline, 'base64').toString('utf8');
  return readFileSync(required('SF_JWT_KEY_FILE'), 'utf8');
}

/** Salesforce takes only login.salesforce.com or test.salesforce.com as the audience. */
function audience(loginUrl: string): string {
  const host = new URL(loginUrl).hostname.toLowerCase();
  return host === 'test.salesforce.com' || host.endsWith('.sandbox.my.salesforce.com') || host.endsWith('.scratch.my.salesforce.com') ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
}

async function post(url: string, body: URLSearchParams, bearer?: string): Promise<Record<string, string>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(bearer ? { authorization: \`Bearer \${bearer}\` } : {}) },
    body,
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, string>;
  if (!response.ok) {
    const code = json.error ?? String(response.status);
    throw new Error(\`Salesforce refused the sign-in (\${code})\${HINTS[code] ? \`: \${HINTS[code]}\` : ''}\`);
  }
  return json;
}

/** A single-use URL that opens a Lightning session as \`username\`. */
export async function frontdoorUrl(username: string): Promise<string> {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: required('SF_CLIENT_ID'), sub: username, aud: audience(loginUrl), exp: Math.floor(Date.now() / 1000) + 120 }));
  const signer = createSign('RSA-SHA256');
  signer.update(\`\${header}.\${claims}\`);
  const assertion = \`\${header}.\${claims}.\${b64url(signer.sign(createPrivateKey(privateKey())))}\`;
  const token = await post(\`\${new URL(loginUrl).origin}/services/oauth2/token\`, new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }));
  const session = await post(\`\${token.instance_url}/services/oauth2/singleaccess\`, new URLSearchParams(), token.access_token);
  if (!session.frontdoor_uri) throw new Error('Salesforce gave no frontdoor URL: the app needs the "web" or "full" OAuth scope');
  return session.frontdoor_uri;
}
`;

const FIXTURES = (style: ScaffoldStyle) => `${style === "bdd" ? "import { expect } from '@playwright/test';\n// playwright-bdd's test, so its steps can use these fixtures.\nimport { createBdd, test as base } from 'playwright-bdd';\n" : "import { test as base, expect } from '@playwright/test';\n"}import { frontdoorUrl } from './auth/salesforce';
import { waitForLightning } from './support/lightning';
import { BasePage } from './pages/base-page';

interface Fixtures {
  /** Signs in as the role's test user (SF_USER_<ROLE> in .env) and waits for Lightning. */
  signIn: (role: string) => Promise<void>;
  app: BasePage;
}

export const test = base.extend<Fixtures>({
  signIn: async ({ page }, use) => {
    await use(async (role) => {
      const name = \`SF_USER_\${role.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}\`;
      const username = process.env[name];
      if (!username) throw new Error(\`Set \${name} in .env to the username of the \${role} test user\`);
      await page.goto(await frontdoorUrl(username));
      await waitForLightning(page);
    });
  },
  app: async ({ page }, use) => {
    await use(new BasePage(page));
  },
});

export { expect };
${style === "bdd" ? "export const { Given, When, Then } = createBdd(test);\n" : ""}`;

const BASE_PAGE = `import type { Locator, Page } from '@playwright/test';
import { expectToast, fieldValue, openObject, openRecord, waitForLightning } from '../support/lightning';

/** What every Lightning page object shares. Extend it for each page of your app. */
export class BasePage {
  constructor(readonly page: Page) {}

  /** An object's list view, home or new-record form, e.g. openObject('Account'). */
  async openObject(objectApiName: string, view: 'list' | 'home' | 'new' = 'list'): Promise<void> {
    await openObject(this.page, objectApiName, view);
  }

  async openRecord(objectApiName: string, recordId: string): Promise<void> {
    await openRecord(this.page, objectApiName, recordId);
  }

  async waitForLightning(): Promise<void> {
    await waitForLightning(this.page);
  }

  /** The text of the toast that appears next, optionally checked. */
  async expectToast(text?: string | RegExp): Promise<string> {
    return expectToast(this.page, text);
  }

  /** A field's value on a record page, by its label. */
  field(label: string): Locator {
    return fieldValue(this.page, label);
  }
}
`;

const TEST_DATA = `import { faker } from '@faker-js/faker';

/**
 * Made-up values for test records: never real customer data. Tests that
 * create records should use these, so each run makes records of its own.
 */
export const testData = {
  name: () => \`\${faker.person.fullName()} (test)\`,
  email: () => faker.internet.email({ provider: 'example.com' }),
  phone: () => faker.phone.number({ style: 'international' }),
  company: () => \`\${faker.company.name()} (test)\`,
  sentence: () => faker.lorem.sentence(),
};
`;

const SMOKE_SPEC = `import { test, expect } from '../src/fixtures';

test('signs in and opens Lightning', async ({ page, signIn }) => {
  await test.step('1. Sign in as the standard test user', async () => {
    await signIn('standard');
  });
  await test.step('2. The app launcher is there', async () => {
    await expect(page.getByRole('button', { name: 'App Launcher' })).toBeVisible();
  });
});
`;

const SMOKE_FEATURE = `Feature: Sign-in

  @smoke
  Scenario: The standard user signs in to Lightning
    Given I am signed in as "standard"
    Then I see the app launcher
`;

const COMMON_STEPS = `import { expect, Given, Then } from '../../src/fixtures';

Given('I am signed in as {string}', async ({ signIn }, role: string) => {
  await signIn(role);
});

Then('I see the app launcher', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'App Launcher' })).toBeVisible();
});
`;

const WORKFLOW = (style: ScaffoldStyle) => `name: Playwright

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      # Installs from the committed package-lock.json.
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run typecheck
      - run: npm run lint
      # Skipped until the org is set up: SF_BASE_URL is a repository variable.
      - if: \${{ vars.SF_BASE_URL != '' }}
        run: ${style === "bdd" ? "npx bddgen && npx playwright test" : "npx playwright test"}
        env:
          SF_BASE_URL: \${{ vars.SF_BASE_URL }}
          SF_LOGIN_URL: \${{ vars.SF_LOGIN_URL }}
          SF_CLIENT_ID: \${{ secrets.SF_CLIENT_ID }}
          SF_JWT_KEY: \${{ secrets.SF_JWT_KEY }}
          SF_USER_STANDARD: \${{ vars.SF_USER_STANDARD }}
      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() && vars.SF_BASE_URL != '' }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
`;

const README = (style: ScaffoldStyle, atRoot: boolean) => `# Salesforce Playwright tests

Started by Agent-QA: ${style === "bdd" ? "Gherkin features (playwright-bdd) with step definitions" : "Playwright TypeScript specs"}, Lightning page objects, sign-in with the OAuth 2.0 JWT bearer flow and faker test data.

## Set up

1. \`npm install\`, then \`npx playwright install chromium\`. Commit the \`package-lock.json\` it writes: CI installs from it.
2. Copy \`.env.example\` to \`.env\` and fill it in. Never commit \`.env\`.
3. In Salesforce, create an External Client App with the JWT bearer flow (a certificate, the \`api\`, \`web\` and \`refresh_token\` scopes, "Admin approved users are pre-authorized"), and assign each test user the permission set that carries it.
4. \`npm test\`.

## Layout

- ${style === "bdd" ? "\`tests/features/\`: the scenarios; \`tests/steps/\`: their steps" : "\`tests/\`: the specs"}
- \`src/fixtures.ts\`: \`signIn(role)\` and the page objects
- \`src/pages/\`: page objects, on \`BasePage\`
- \`src/support/lightning.ts\`: Lightning waits and helpers (from the Agent-QA Salesforce pack; yours to edit)
- \`src/support/test-data.ts\`: made-up values with faker
- \`src/auth/salesforce.ts\`: the JWT sign-in

${
  atRoot
    ? "In CI (\`.github/workflows/playwright.yml\`), set \`SF_CLIENT_ID\` and \`SF_JWT_KEY\` as secrets, and \`SF_BASE_URL\`, \`SF_LOGIN_URL\` and \`SF_USER_STANDARD\` as variables."
    : "This folder isn't the project root, so no CI workflow was added: GitHub runs workflows only from the repository root's \`.github/workflows\`."
}
`;

/** A package name from the folder's name. */
export function packageName(folder: string): string {
  const base = folder.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".").at(-1) ?? "salesforce-tests";
  const name = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|[-]+$/g, "");
  return name || "salesforce-tests";
}

const atRoot = (folder: string) => folder.replace(/\\/g, "/").split("/").every((p) => p === "" || p === ".");

/** Every file of the new repo, paths relative to its folder. */
export function scaffoldFiles(style: ScaffoldStyle, folder = "."): ScaffoldFile[] {
  return [
    { path: "package.json", content: packageJson(packageName(folder), style) },
    { path: "playwright.config.ts", content: playwrightConfig(style) },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "eslint.config.mjs", content: ESLINT },
    { path: ".gitignore", content: GITIGNORE, existing: "add-lines" },
    { path: ".env.example", content: ENV_EXAMPLE },
    { path: "README.md", content: README(style, atRoot(folder)), existing: "keep" },
    { path: "src/auth/salesforce.ts", content: AUTH },
    { path: "src/fixtures.ts", content: FIXTURES(style) },
    { path: "src/pages/base-page.ts", content: BASE_PAGE },
    { path: "src/support/lightning.ts", content: lightningHelpersSource() },
    { path: "src/support/test-data.ts", content: TEST_DATA },
    ...(style === "bdd"
      ? [
          { path: "tests/features/smoke.feature", content: SMOKE_FEATURE },
          { path: "tests/steps/common.steps.ts", content: COMMON_STEPS },
        ]
      : [{ path: "tests/smoke.spec.ts", content: SMOKE_SPEC }]),
    // GitHub runs workflows from the repository root only.
    ...(atRoot(folder) ? [{ path: ".github/workflows/playwright.yml", content: WORKFLOW(style) }] : []),
  ];
}
