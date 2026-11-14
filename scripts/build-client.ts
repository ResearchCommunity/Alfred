// Builds the verification site's browser assets into dist/web/public:
// the bundled puzzle script (incl. the ALTCHA widget) plus the static files.
//   node scripts/build-client.ts
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = new URL('../', import.meta.url);
const out = fileURLToPath(new URL('dist/web/public/', root));

await mkdir(out, { recursive: true });
await cp(fileURLToPath(new URL('src/web/public/', root)), out, { recursive: true });
await build({
	input: fileURLToPath(new URL('src/web/client/verify.ts', root)),
	output: { dir: out, format: 'esm', minify: true, entryFileNames: 'verify.js', codeSplitting: false },
});
console.log(`Client assets written to ${out}`);
