import {
	ApplicationCommandRegistries,
	container,
	LogLevel,
	RegisterBehavior,
	SapphireClient,
} from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { loadConfig } from './lib/config.ts';
import { connectDatabase } from './lib/database.ts';
import { type Env, parseEnv } from './lib/env.ts';
import { Game } from './features/chastity/game.ts';
import { recordRules } from './features/chastity/export.ts';
import { ensureIndexes as ensureChastityIndexes } from './features/chastity/repository.ts';
import { grantAccess } from './features/onboarding/grant.ts';
import { resolveImagePool } from './features/onboarding/puzzle.ts';
import { onboardingRoutes } from './features/onboarding/web/routes.tsx';
import { registerFeatures } from './lib/features.ts';
import { createHttpApp, describeAddress, startHttpServer, stopHttpServer } from './lib/http.ts';
import { createLogger, SapphirePinoLogger } from './lib/logger.ts';
import { toPresenceData } from './lib/presence.ts';

let env: Env;
try {
	env = parseEnv();
} catch (error) {
	// No logger yet (its config comes from env) — print just the readable message
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
}

const logger = createLogger(env);
container.env = env;
container.pino = logger;

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));

const shutdownTasks: Array<{ name: string; run: () => Promise<unknown> }> = [];
let shuttingDown = false;

async function shutdown(exitCode: number): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info('Shutting down');

	// Tear down in reverse start order: Discord → HTTP → database
	for (const task of shutdownTasks.toReversed()) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- teardown order matters
			await task.run();
		} catch (error) {
			logger.error({ err: error }, `Failed to stop ${task.name}`);
		}
	}

	logger.flush();
	process.exit(exitCode);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

try {
	const config = await loadConfig(env.CONFIG_PATH);
	container.config = config;
	if (config.onboarding && !env.ALTCHA_HMAC_KEY) {
		throw new Error('ALTCHA_HMAC_KEY must be set (32+ characters) when onboarding is configured');
	}

	const database = await connectDatabase(env);
	container.mongo = database.client;
	container.db = database.db;
	shutdownTasks.push({ name: 'database', run: () => database.client.close() });
	logger.info({ database: env.DATABASE_NAME }, 'Connected to database');

	container.chastity = config.chastity ? new Game(database.db, config.chastity) : null;
	if (config.chastity) {
		await ensureChastityIndexes(database.db);
		// The event log notes every change to the rules, so an export knows which applied when
		await recordRules(database.db, config.chastity);
	}

	// Single-guild bot: register slash commands to the guild (instant) rather than globally,
	// and overwrite Discord's copy whenever our definitions differ.
	ApplicationCommandRegistries.setDefaultGuildIds([config.guildId]);
	ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

	const client = new SapphireClient({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			// Privileged: the link cleaner has to read message text
			GatewayIntentBits.MessageContent,
		],
		presence: toPresenceData(config.presence),
		// Safe default: never ping @everyone/@here/roles unless a message explicitly opts in
		allowedMentions: { parse: ['users'], repliedUser: false },
		logger: { instance: new SapphirePinoLogger(logger), level: LogLevel.Trace },
	});

	const features = await registerFeatures(client);
	logger.info({ features }, `Registered ${features.length} feature(s)`);

	const routes = [];
	if (config.onboarding && env.ALTCHA_HMAC_KEY) {
		const { pool, bundled } = await resolveImagePool(env.PUZZLE_IMAGES_DIR);
		if (pool.files.length === 0) throw new Error('The verification puzzle has no images');
		if (bundled) {
			logger.warn(`No puzzle images in ${env.PUZZLE_IMAGES_DIR}, using the bundled lab photos`);
		} else {
			logger.info({ images: pool.files.length }, `Using puzzle images from ${env.PUZZLE_IMAGES_DIR}`);
		}
		routes.push(
			onboardingRoutes({
				db: database.db,
				config: config.onboarding,
				altchaKey: env.ALTCHA_HMAC_KEY,
				// Plain http on localhost in development
				secureCookies: config.onboarding.publicUrl.startsWith('https://'),
				grant: grantAccess,
				images: pool,
			}),
		);
	}

	const http = await startHttpServer(createHttpApp({ isReady: () => client.isReady(), routes }), {
		host: env.HTTP_HOST,
		port: env.HTTP_PORT,
	});
	container.http = http;
	shutdownTasks.push({ name: 'http server', run: () => stopHttpServer(http) });
	logger.info(`HTTP server listening on ${describeAddress(http)}`);

	shutdownTasks.push({ name: 'discord client', run: () => client.destroy() });
	await client.login(env.DISCORD_TOKEN);
} catch (error) {
	logger.fatal({ err: error }, 'Startup failed');
	await shutdown(1);
}
