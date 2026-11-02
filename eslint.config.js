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

/**
 * fs functions that only read. Everything else in fs (writes, the default and
 * namespace imports, `promises`) is blocked outside FS_WRITERS, so a new write
 * API can't slip past a list of banned names.
 */
const FS_READS = [
  "readFile", "readFileSync", "readdir", "readdirSync", "stat", "statSync", "lstat", "lstatSync",
  "access", "accessSync", "existsSync", "realpath", "realpathSync", "createReadStream", "opendir",
  "opendirSync", "constants", "Dirent", "Stats",
];
const FS_MODULES = ["fs", "node:fs", "fs/promises", "node:fs/promises"];
const FS_MESSAGE = "Disk writes outside the run store, vault, engine state and audit log go through Policy.guard (src/core/policy).";
/** Modules that can write files by other means. No source file needs them yet. */
const ALWAYS_BLOCKED = ["child_process", "node:child_process", "module", "node:module", "worker_threads", "node:worker_threads"].map(
  (name) => ({ name, message: "Shelling out or loading CommonJS can write files past the policy layer; use Policy.guard." }),
);
/** The only files allowed to write to disk directly: engine state, vault and audit log. Add run store files when they exist. */
const FS_WRITERS = ["src/core/engine/stores.ts", "src/core/policy/audit.ts", "src/masking/vault/vault.ts"];

const restrictedImports = (blockFs) => [
  "error",
  {
    paths: [
      ...(blockFs ? FS_MODULES.map((name) => ({ name, allowImportNames: FS_READS, allowTypeImports: true, message: FS_MESSAGE })) : []),
      ...ALWAYS_BLOCKED,
    ],
  },
];

const restrictedSyntax = (blockFs) => [
  "error",
  {
    // A dynamic import with a computed path can't be checked by the boundary rule.
    selector: "ImportExpression[source.type!='Literal']",
    message: "Dynamic import() needs a literal path so module boundaries can be checked.",
  },
  {
    selector: `ImportExpression[source.value=/^(node:)?(${blockFs ? "fs(\\/promises)?|" : ""}child_process|module|worker_threads)$/]`,
    message: FS_MESSAGE,
  },
  // Loads fs without an import (Node 20.16+), or reaches native bindings: by name
  // (dot access, destructuring), by string key, or by template key.
  { selector: "Identifier[name=/^(getBuiltinModule|_linkedBinding|dlopen)$/]", message: FS_MESSAGE },
  { selector: "MemberExpression[object.name='process'][property.name='binding']", message: FS_MESSAGE },
  {
    selector: "MemberExpression[computed=true][property.value=/^(getBuiltinModule|binding|_linkedBinding|dlopen)$/]",
    message: FS_MESSAGE,
  },
  {
    selector:
      "MemberExpression[computed=true] > TemplateLiteral.property[quasis.0.value.raw=/^(getBuiltinModule|binding|_linkedBinding|dlopen)$/]",
    message: FS_MESSAGE,
  },
  { selector: "CallExpression[callee.name='require']", message: "Use import; require() bypasses the import rules." },
  { selector: "TSImportEqualsDeclaration", message: "Use import; `import x = require()` bypasses the import rules." },
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,mts,cts,tsx,js,mjs,cjs}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/include": ["src/**/*.{ts,mts,cts,tsx,js,mjs,cjs}"],
      "boundaries/dependency-nodes": ["import", "export", "dynamic-import"],
      "boundaries/elements": [
        ...Object.keys(allowed)
          .filter((t) => t !== "root")
          .map((type) => ({ type, pattern: `src/${type}` })),
        { type: "root", pattern: "src/index.ts", mode: "full" },
      ],
    },
    rules: {
      "no-restricted-syntax": restrictedSyntax(true),
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": restrictedImports(true),
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
  {
    files: FS_WRITERS,
    rules: {
      "no-restricted-syntax": restrictedSyntax(false),
      "@typescript-eslint/no-restricted-imports": restrictedImports(false),
    },
  },
);
