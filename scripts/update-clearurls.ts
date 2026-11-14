// Refreshes the bundled ClearURLs ruleset (https://github.com/ClearURLs/Rules, LGPL-3.0).
// Run occasionally and commit the result: `yarn rules:update`
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const SOURCE = 'https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json';
const output = new URL('../src/features/link-cleaner/data/clearurls.json', import.meta.url);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

// Sanity check: a broken download should fail here rather than at bot startup
const data = z
	.object({ providers: z.record(z.string(), z.object({ urlPattern: z.string() }).loose()) })
	.parse(await response.json());
await writeFile(output, `${JSON.stringify(data, null, '\t')}\n`);
console.log(`Wrote ${Object.keys(data.providers).length} providers to ${output.pathname}`);
