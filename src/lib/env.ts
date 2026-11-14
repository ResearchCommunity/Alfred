import { z } from 'zod';

/**
 * Secrets and infrastructure settings. These come from the process environment
 * (a local `.env` in development, compose's `env_file` in production).
 */
export const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

	DISCORD_TOKEN: z.string().min(1),

	DATABASE_URL: z.url({ protocol: /^mongodb(\+srv)?$/ }),
	DATABASE_NAME: z.string().min(1).default('alfred'),

	HTTP_HOST: z.string().min(1).default('127.0.0.1'),
	HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3050),

	CONFIG_PATH: z.string().min(1).default('config.yaml'),

	// Signs ALTCHA proof-of-work challenges. Required when `onboarding` is configured.
	ALTCHA_HMAC_KEY: z.string().min(32).optional(),

	// Folder of verification puzzle images (kept out of git). Falls back to the bundled lab
	// photos when it's missing or empty. Relative paths resolve from the working directory.
	PUZZLE_IMAGES_DIR: z.string().min(1).default('puzzle-images'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
	const result = EnvSchema.safeParse(source);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
	}
	return result.data;
}
