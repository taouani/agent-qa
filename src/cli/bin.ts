#!/usr/bin/env node
import { buildProgram } from "./index.js";

await buildProgram().parseAsync(process.argv);
