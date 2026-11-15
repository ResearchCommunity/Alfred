import type { ServerType } from '@hono/node-server';
import type { Db, MongoClient } from 'mongodb';
import type { Logger } from 'pino';
import type { Game } from '../features/chastity/game.ts';
import type { Config } from './config.ts';
import type { Env } from './env.ts';

// Sapphire's `container` is a shared dependency bag available in every piece as
// `this.container`. Augmenting its interface makes everything we put on it typed.
// No import needed anywhere: being part of the compilation is enough for the augmentation.
declare module '@sapphire/pieces' {
	interface Container {
		env: Env;
		config: Config;
		/** Root Pino logger. Prefer `.child({ feature })` in feature code. Sapphire's own `logger` writes here too. */
		pino: Logger;
		mongo: MongoClient;
		db: Db;
		http: ServerType;
		/** The chastity game, or null when its config section is missing */
		chastity: Game | null;
	}
}
