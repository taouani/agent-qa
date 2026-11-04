import { z } from "zod";

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
    version: z.literal(1),

    project: z.object({ name: z.string().min(1) }).strict().optional(),

    atlassian: z
      .object({
        site: httpsUrl,
        /** Personal data if written literally; prefer ${env:ATLASSIAN_EMAIL} so it stays out of git. */
        email: z.string().min(1),
        token: secretRef,
        confluence: z.object({ spaceKey: z.string().min(1), parentPageId: z.string().min(1).optional() }).strict().optional(),
        /** How requirements are read from Jira. Every key has a default. */
        jira: z
          .object({
            /** Field id or name holding acceptance criteria. Default: found by name; else read from the description. */
            acceptanceCriteriaField: z.string().min(1).optional(),
            /** More text fields to read into each requirement, by id or name. */
            extraFields: z.array(z.string().min(1)).optional(),
            /** Levels of child issues below each input issue. Default 3. */
            maxDepth: z.number().int().min(0).max(5).optional(),
            /** Most issues per run. Default 100. */
            maxIssues: z.number().int().min(1).max(500).optional(),
            /** Follow issue links one level out. Default true. */
            followLinks: z.boolean().optional(),
            /** Also read the children of linked issues. Default true. */
            followLinkedChildren: z.boolean().optional(),
            /** Most linked Confluence pages per run. Default 20. */
            maxPages: z.number().int().min(0).max(100).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    xray: z
      .object({
        /** The API key's client id, or a secret reference to it. */
        clientId: z.string().min(1),
        clientSecret: secretRef,
        /** Jira project the tests are created in. */
        projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
        /** Xray Cloud region URL; default https://xray.cloud.getxray.app. */
        baseUrl: httpsUrl.optional(),
        /** Jira priority name for each test priority; priorities left out are not set. */
        priorities: z.object({ P1: z.string().min(1), P2: z.string().min(1), P3: z.string().min(1), P4: z.string().min(1) }).partial().strict().optional(),
        /** Jira link type from each test to its requirement. Default "Test" (tests / is tested by). */
        linkType: z.string().min(1).max(100).default("Test"),
      })
      .strict()
      .optional(),

    git: z
      .object({
        platform: z.enum(["github", "gitlab", "azure-devops"]),
        repo: z.string().min(1),
        token: secretRef,
        baseUrl: anyUrl.optional(),
      })
      .strict()
      .optional(),

    /**
     * Salesforce sign-in for the explorer and generated tests (S2-3): the JWT
     * bearer flow of an External Client App, one user per role. Nothing is stored:
     * each sign-in mints a single-use frontdoor URL.
     */
    salesforce: z
      .object({
        /** The org's My Domain URL, e.g. https://acme--uat.sandbox.my.salesforce.com. */
        baseUrl: httpsUrl,
        auth: z.literal("jwt").default("jwt"),
        /** https://login.salesforce.com, or https://test.salesforce.com for a sandbox. */
        loginUrl: httpsUrl.default("https://login.salesforce.com"),
        /** The assertion's audience. Default: the login URL's origin. */
        audience: httpsUrl.optional(),
        /** The app's consumer key, or a secret reference to it. */
        clientId: z.string().min(1),
        /** The app's private key (PEM), as a secret reference. Or give privateKeyFile. */
        privateKey: secretRef.optional(),
        /** Path to the private key file (PEM), outside the repo. The file holds the secret, not this setting. */
        privateKeyFile: z.string().min(1).max(1000).optional(),
        /** The Salesforce username for each role, e.g. StoreManager-FRA: user@acme.com.uat, or a secret reference. */
        users: z
          .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,59}$/, "a role name: letters, digits, _ . -"), z.string().min(1).max(200))
          .refine((u) => Object.keys(u).length > 0, "name at least one user"),
      })
      .strict()
      .refine((s) => (s.privateKey === undefined) !== (s.privateKeyFile === undefined), { message: "give exactly one of privateKey or privateKeyFile", path: ["privateKey"] })
      .optional(),

    models: z
      .object({
        default: modelId,
        /** Narrows the shipped catalog. A model outside the catalog is allowed, with a doctor warning. */
        allowed: z.array(modelPattern).min(1).optional(),
        workflows: z.record(z.string(), modelId).optional(),
        keys: z.partialRecord(z.enum(PROVIDERS), secretRef).optional(),
        /** Base URLs for OpenRouter or a LiteLLM proxy. */
        endpoints: z.partialRecord(z.enum(PROVIDERS), anyUrl).optional(),
      })
      .strict()
      .optional(),

    masking: z
      .object({
        restoreOnWrite: z.boolean().default(false),
        detectors: z.array(z.enum(["email", "phone", "iban", "card", "national-id", "name", "address", "ip"])).optional(),
        /** Fields always replaced whole, by source: `jira: [customfield_10042, "Customer phone"]`. */
        fields: z.record(z.string(), z.array(z.string().min(1))).optional(),
        /** Languages for finding names that no people field lists. Default: all nine. */
        languages: z.array(z.enum(["en", "fr", "es", "de", "pt", "nl", "it", "ar", "zh"])).optional(),
        presidio: z.object({ url: anyUrl.nullable() }).strict().optional(),
      })
      .strict()
      .default(() => ({ restoreOnWrite: false })),

    policy: z
      .object({
        writes: z
          .object({
            xray: writePolicy.default("ask"),
            confluence: writePolicy.default("ask"),
            testCode: writePolicy.default("ask"),
            jira: writePolicy.default("deny"),
            /** Running the commands the framework profile lists (tests, type check) in your repo. In CI, anything but deny allows. */
            commands: writePolicy.default("ask"),
          })
          .strict()
          // Factory defaults: each parse gets its own object, so a caller can't change another's defaults.
          .default(() => ({ xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const, commands: "ask" as const })),
      })
      .strict()
      .default(() => ({ writes: { xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const, commands: "ask" as const } })),

    harness: z
      .object({
        sources: z
          .array(
            z.union([
              z.object({ fixtures: z.string().min(1) }).strict(),
              z.object({ jira: z.object({ jql: z.string().min(1) }).strict() }).strict(),
            ]),
          )
          .min(1),
        seededPersonalData: z.string().min(1).optional(),
      })
      .strict()
      .optional(),

    playwright: z
      .object({
        baseUrl: anyUrl.default("http://localhost:3000"),
        testDir: z.string().min(1).default("tests"),
        profile: z.string().min(1).default(".agent-qa/framework-profile.json"),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Config as written (defaults not yet applied). */
export type ConfigInput = z.input<typeof configSchema>;
/** Config after validation, with defaults applied. */
export type Config = z.output<typeof configSchema>;
