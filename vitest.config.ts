import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Vite 8 transforms TS with Oxc and no longer reliably inherits `experimentalDecorators`
	// from tsconfig. Without this, Sapphire's @ApplyOptions is emitted raw and explodes.
	oxc: {
		decorator: { legacy: true },
		// Same story for JSX: use Hono's runtime, not React's
		jsx: { runtime: 'automatic', importSource: 'hono/jsx' },
	},
	test: {
		environment: 'node',
		projects: [
			{
				extends: true,
				test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.test.ts'],
					// Starts one real DocumentDB container for the whole run (needs Docker)
					globalSetup: ['tests/integration/setup/documentdb.ts'],
					hookTimeout: 30_000,
				},
			},
		],
	},
});
