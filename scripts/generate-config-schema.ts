// Generates config.schema.json from the zod config schema, giving editors (VS Code's
// YAML extension) autocomplete and validation for config.yaml.
// Runs directly through Node's native type stripping: `yarn config:schema`
import { writeFile } from 'node:fs/promises';
import { buildConfigJsonSchema } from '../src/lib/config.ts';

const output = new URL('../config.schema.json', import.meta.url);
await writeFile(output, `${JSON.stringify(buildConfigJsonSchema(), null, 4)}\n`);
console.log(`Wrote ${output.pathname}`);
