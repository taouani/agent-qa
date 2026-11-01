// @ts-check
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

/**
 * Module boundaries (slice 0 plan, T2). The key rule: only `data` may import
 * `connectors`, so every read of Jira, Confluence, Xray, git or Salesforce
 * passes the masking gateway. Front doors (`cli`, `mcp`) never touch
 * connectors or masking directly.
 */
const allowed = {
  core: ["core"],
  masking: ["core", "masking"],
  connectors: ["core", "connectors"],
  data: ["core", "masking", "connectors", "data"],
  llm: ["core", "llm"],
  workflows: ["core", "data", "workflows"],
  harness: ["core", "data", "masking", "llm", "workflows", "harness"],
  mcp: ["core", "data", "workflows", "mcp"],
  cli: ["core", "data", "llm", "workflows", "harness", "mcp", "cli"],
  // Public library entry point: never exposes connectors or masking internals.
  root: ["core", "data", "workflows"],
};

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,mts,cts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/include": ["src/**/*.{ts,mts,cts,tsx}"],
      "boundaries/dependency-nodes": ["import", "export", "dynamic-import"],
      "boundaries/elements": [
        ...Object.keys(allowed)
          .filter((t) => t !== "root")
          .map((type) => ({ type, pattern: `src/${type}` })),
        { type: "root", pattern: "src/index.ts", mode: "full" },
      ],
    },
    rules: {
      // A dynamic import with a computed path can't be checked by the boundary rule.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.type!='Literal']",
          message: "Dynamic import() needs a literal path so module boundaries can be checked.",
        },
      ],
      "boundaries/no-unknown-files": "error",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: Object.entries(allowed).map(([from, allow]) => ({ from, allow })),
          message: "${file.type} must not import ${dependency.type} (see the module boundaries in eslint.config.js)",
        },
      ],
    },
  },
);
