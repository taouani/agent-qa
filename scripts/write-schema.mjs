// Regenerates schema/agent-qa.schema.json from the zod config schema (run: npm run schema).
import { mkdir, writeFile } from "node:fs/promises";
import { configJsonSchema } from "../dist/index.js";

await mkdir(new URL("../schema/", import.meta.url), { recursive: true });
await writeFile(new URL("../schema/agent-qa.schema.json", import.meta.url), JSON.stringify(configJsonSchema(), null, 2) + "\n");
console.log("wrote schema/agent-qa.schema.json");
