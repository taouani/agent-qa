// Regenerates schema/agent-qa.schema.json and docs/config.md from the zod config schema
// (run: npm run schema).
import { mkdir, writeFile } from "node:fs/promises";
import { configJsonSchema } from "../dist/index.js";
import { configReference } from "./config-docs.mjs";

const schema = configJsonSchema();
await mkdir(new URL("../schema/", import.meta.url), { recursive: true });
await writeFile(new URL("../schema/agent-qa.schema.json", import.meta.url), JSON.stringify(schema, null, 2) + "\n");
await writeFile(new URL("../docs/config.md", import.meta.url), configReference(schema));
console.log("wrote schema/agent-qa.schema.json and docs/config.md");
