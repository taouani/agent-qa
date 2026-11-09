import { z } from "zod";

/** A Jira date field set when a Test Execution is created: its id and whether it holds a day or a time. */
const executionDateField = z
  .object({
    field: z.string().regex(/^customfield_\d+$/, "a Jira custom field id, such as customfield_10505").describe("The Jira custom field id, such as customfield_10505."),
    type: z.enum(["date", "datetime"]).default("datetime").describe("`date` for a field that holds a day (the UTC day is written), `datetime` for a date and time."),
  })
  .strict();

/**
 * Contract 1: `agent-qa.yaml`. Every section is optional except `version`;
 * each workflow checks only the sections it needs.
 */

/** `${env:NAME}` or `${keychain:NAME}`. Secrets in the file must be one of these. */
export const SECRET_REF = /^\$\{(env|keychain):([A-Za-z_][A-Za-z0-9_.-]*)\}$/;

const secretRef = z
  .string()
  .regex(SECRET_REF, "must be a secret reference like ${env:NAME} or ${keychain:NAME}, never the secret itself");

/** URLs must use `//` and never carry credentials (`user:pass@host`). */
function url(protocol: RegExp, label: string) {
  return z
    .url({ protocol, error: `must be an ${label} URL` })
    .refine((v) => /^[a-z]+:\/\//i.test(v), `must be an ${label} URL`)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.username === "" && u.password === "";
      } catch {
        return false;
      }
    }, "must not contain a username or password; put credentials in a secret reference");
}
const httpsUrl = url(/^https$/, "https://");
const anyUrl = url(/^https?$/, "http(s)://");

export const PROVIDERS = ["anthropic", "openai", "mistral", "xai", "google", "openrouter", "litellm"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** `provider:model`, e.g. `anthropic:<model-id>`. */
const modelId = z
  .string()
  .regex(new RegExp(`^(${PROVIDERS.join("|")}):[A-Za-z0-9._/@-]+$`), `must be provider:model with provider one of ${PROVIDERS.join(", ")}`);

/** `provider:*` or an exact `provider:model`. */
const modelPattern = z
  .string()
  .regex(new RegExp(`^(${PROVIDERS.join("|")}):([A-Za-z0-9._/@-]+|\\*)$`), "must be provider:model or provider:*");

const writePolicy = z.enum(["allow", "ask", "deny"]);

export const configSchema = z
  .object({
    version: z.literal(1).describe("The version of this file's format. Always 1."),

    project: z
      .object({ name: z.string().min(1).describe("A name for the project. Not used by any workflow yet.") })
      .strict()
      .optional()
      .describe("About the project."),

    atlassian: z
      .object({
        site: httpsUrl.describe("Your Jira Cloud site, such as https://acme.atlassian.net."),
        email: z.string().min(1).describe("The email of the Atlassian account the API token belongs to. It is personal data: prefer ${env:ATLASSIAN_EMAIL}, so it stays out of git."),
        token: secretRef.describe("The Atlassian API token, as a secret reference."),
        confluence: z
          .object({
            spaceKey: z.string().min(1).describe("The key of the space documents are published to."),
            parentPageId: z.string().min(1).optional().describe("The id of the page that published documents go under. Without it, they go at the top of the space."),
          })
          .strict()
          .optional()
          .describe("Where `document` publishes to Confluence."),
        /** How requirements are read from Jira. Every key has a default. */
        jira: z
          .object({
            acceptanceCriteriaField: z.string().min(1).optional().describe("The field that holds acceptance criteria, by id or name. Default: a field named like acceptance criteria, else the criteria in the description."),
            extraFields: z.array(z.string().min(1)).optional().describe("More text fields to read into each requirement, by id or name."),
            maxDepth: z.number().int().min(0).max(5).optional().describe("Levels of child issues read below each input issue (epic, story, sub-task). Default 3."),
            maxIssues: z.number().int().min(1).max(500).optional().describe("The most issues read in one run. Default 100."),
            followLinks: z.boolean().optional().describe("Read linked issues, one level out. Default true."),
            followLinkedChildren: z.boolean().optional().describe("Also read the children of linked issues. Default true."),
            maxPages: z.number().int().min(0).max(100).optional().describe("The most linked Confluence pages read in one run. Default 20."),
          })
          .strict()
          .optional()
          .describe("How requirements are read from Jira. Every key has a default."),
      })
      .strict()
      .optional()
      .describe("Jira and Confluence Cloud. Needed by every workflow that reads requirements."),

    xray: z
      .object({
        clientId: z.string().min(1).describe("The Xray API key's client id, or a secret reference to it."),
        clientSecret: secretRef.describe("The Xray API key's client secret, as a secret reference."),
        projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/).describe("The Jira project the tests are created in, such as QA."),
        baseUrl: httpsUrl.optional().describe("The Xray Cloud region's URL. Default https://xray.cloud.getxray.app."),
        priorities: z
          .object({
            P1: z.string().min(1).describe("The Jira priority name for P1."),
            P2: z.string().min(1).describe("The Jira priority name for P2."),
            P3: z.string().min(1).describe("The Jira priority name for P3."),
            P4: z.string().min(1).describe("The Jira priority name for P4."),
          })
          .partial()
          .strict()
          .optional()
          .describe("The Jira priority name for each test priority, such as `P1: Highest`. A priority left out isn't set."),
        linkType: z.string().min(1).max(100).default("Test").describe("The Jira link type from each test to its requirement. Default Test (tests / is tested by)."),
        // Decided with Tarek, 7 Nov 2026.
        attachScreenshots: z
          .boolean()
          .default(false)
          .describe("Attach Playwright's screenshots to the tests of a Test Execution, passed or failed. Off by default: a screenshot can't be masked, so what the page showed (names, record data) goes to Xray as it is."),
        executionDates: z
          .object({
            start: executionDateField.optional().describe("The field for the execution's start."),
            end: executionDateField.optional().describe("The field for the execution's end."),
          })
          .strict()
          .refine((d) => !d.start || !d.end || d.start.field !== d.end.field, "start and end must be different fields")
          .optional()
          .describe("The Test Execution's own start and end date fields, which Xray doesn't set from the results: Jira custom fields, with each field's type."),
      })
      .strict()
      .optional()
      .describe("Xray Cloud, where test cases and Test Executions are written."),

    git: z
      .object({
        platform: z.enum(["github", "gitlab", "azure-devops"]).describe("Where the repository is hosted."),
        repo: z.string().min(1).describe("owner/name on GitHub, organization/project/repository on Azure DevOps, the project's full path (group/subgroup/project) on GitLab."),
        token: secretRef.describe("A token that can read pull requests and open one, as a secret reference."),
        baseUrl: httpsUrl.optional().describe("The REST API root for a self-hosted server, such as https://HOST/api/v3 on GitHub Enterprise Server. Default: the cloud service."),
      })
      .strict()
      .optional()
      .describe("Your git host: read for pull request context, and used to open pull requests from CI."),

    salesforce: z
      .object({
        baseUrl: httpsUrl.describe("The org's My Domain URL, such as https://acme--uat.sandbox.my.salesforce.com."),
        auth: z.literal("jwt").default("jwt").describe("How users sign in. Only jwt: the OAuth JWT bearer flow, which no MFA prompt stops."),
        loginUrl: httpsUrl.default("https://login.salesforce.com").describe("https://login.salesforce.com, or https://test.salesforce.com for a sandbox."),
        audience: httpsUrl.optional().describe("The JWT assertion's audience. Default: https://test.salesforce.com for test.salesforce.com and sandbox My Domains, else https://login.salesforce.com."),
        clientId: z.string().min(1).describe("The External Client App's consumer key, or a secret reference to it."),
        privateKey: secretRef.optional().describe("The app's private key (PEM), as a secret reference. Give this or privateKeyFile."),
        privateKeyFile: z
          .string()
          .min(1)
          .max(1000)
          .refine((v) => !/-----BEGIN|[\r\n]/.test(v), "a path to the key file, not the key itself (use privateKey: ${env:NAME} for the key)")
          .optional()
          .describe("The path to the private key file (PEM), outside the repo, or a secret reference holding the path. Give this or privateKey."),
        users: z
          .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,59}$/, "a role name: letters, digits, _ . -"), z.string().min(1).max(200))
          .refine((u) => Object.keys(u).length > 0, "name at least one user")
          .describe("The Salesforce username for each role, such as `StoreManager-FRA: user@acme.com.uat`, or a secret reference. At least one."),
      })
      .strict()
      .refine((s) => (s.privateKey === undefined) !== (s.privateKeyFile === undefined), { message: "give exactly one of privateKey or privateKeyFile", path: ["privateKey"] })
      .optional()
      .describe("Salesforce sign-in for `explore` and the generated tests: the JWT bearer flow of an External Client App, one user per role. Nothing is stored: each sign-in makes a single-use URL."),

    models: z
      .object({
        default: modelId.describe("The model for every step, as provider:model, such as anthropic:claude-sonnet-5-5."),
        allowed: z.array(modelPattern).min(1).optional().describe("The models that may run, as provider:model or provider:*. A model outside the shipped catalog runs, with a doctor warning."),
        workflows: z.record(z.string(), modelId).optional().describe("A model for one workflow, by workflow id, such as `scripts: anthropic:claude-opus-5-5`."),
        keys: z.partialRecord(z.enum(PROVIDERS), secretRef).optional().describe("The API key for each provider, as a secret reference. Default: the provider's usual variable, such as ANTHROPIC_API_KEY."),
        endpoints: z.partialRecord(z.enum(PROVIDERS), anyUrl).optional().describe("The base URL for a provider: OpenRouter, or your LiteLLM gateway."),
      })
      .strict()
      .optional()
      .describe("The models that answer from the CLI and CI. In an IDE, the IDE's own model answers (docs/models.md)."),

    masking: z
      .object({
        restoreOnWrite: z.boolean().default(false).describe("Put the real values back into what is written to Xray and Confluence, on an approved write. Off: they receive the tokens as they are."),
        detectors: z
          .array(z.enum(["email", "phone", "iban", "card", "national-id", "name", "address", "ip"]))
          .optional()
          .describe("The detectors that run. Default: all. `address` is accepted but has no detector yet."),
        fields: z
          .record(z.string(), z.array(z.string().min(1)))
          .optional()
          .describe('Fields always replaced whole, by source, such as `jira: [customfield_10042, "Customer phone"]`.'),
        languages: z
          .array(z.enum(["en", "fr", "es", "de", "pt", "nl", "it", "ar", "zh"]))
          .optional()
          .describe("The languages whose name lists find names that no people field lists. Default: all nine."),
        presidio: z
          .object({ url: anyUrl.nullable().describe("The Presidio analyzer's URL.") })
          .strict()
          .optional()
          .describe("Accepted and checked by doctor, but nothing sends text to Presidio yet."),
      })
      .strict()
      .default(() => ({ restoreOnWrite: false }))
      .describe("How personal data is masked before a model sees it (docs/security.md)."),

    policy: z
      .object({
        writes: z
          .object({
            xray: writePolicy.default("ask").describe("Creating and updating test cases and Test Executions. In CI, ask is denied."),
            confluence: writePolicy.default("ask").describe("Publishing a document. In CI, ask is denied."),
            testCode: writePolicy.default("ask").describe("Writing or deleting files in your repo. In CI, ask leaves the code as a pull request."),
            jira: writePolicy.default("deny").describe("Reserved: nothing writes to Jira."),
            commands: writePolicy.default("ask").describe("Running the commands the framework profile lists (tests, type check) in your repo. In CI, anything but deny allows."),
          })
          .strict()
          // Factory defaults: each parse gets its own object, so a caller can't change another's defaults.
          .default(() => ({ xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const, commands: "ask" as const }))
          .describe("allow, ask or deny for each target."),
      })
      .strict()
      .default(() => ({ writes: { xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const, commands: "ask" as const } }))
      .describe("What Agent-QA may write outside its run folder, and what it asks you first (docs/security.md)."),

    harness: z
      .object({
        sources: z
          .array(
            z.union([
              z.object({ fixtures: z.string().min(1).describe("A folder of harness cases.") }).strict(),
              z.object({ jira: z.object({ jql: z.string().min(1).describe("A JQL filter.") }).strict().describe("Accepted, but skipped for now: a Jira source has no known seeds to check.") }).strict(),
            ]),
          )
          .min(1)
          .describe("Where the cases come from: `- fixtures: path/to/cases`."),
        seededPersonalData: z.string().min(1).optional().describe("A file of the planted values to look for. Default: the shipped seeds."),
      })
      .strict()
      .optional()
      .describe("Your own cases for `agent-qa harness`. Without this section, it runs the shipped synthetic cases (docs/harness.md)."),

    playwright: z
      .object({
        baseUrl: anyUrl.default("http://localhost:3000").describe("A local app for `explore` to drive when there is no salesforce section."),
        testDir: z.string().min(1).default("tests").describe("Not used: the reviewed framework profile says where the tests are."),
        profile: z.string().min(1).default(".agent-qa/framework-profile.json").describe("Not used: the reviewed profile is always agent-qa.profile.json at the project root."),
      })
      .strict()
      .optional()
      .describe("A local web app, for `explore` without Salesforce."),
  })
  .strict()
  .describe("agent-qa.yaml: Agent-QA's settings. Secrets appear only as ${env:NAME} or ${keychain:NAME} references.");

/** Config as written (defaults not yet applied). */
export type ConfigInput = z.input<typeof configSchema>;
/** Config after validation, with defaults applied. */
export type Config = z.output<typeof configSchema>;
