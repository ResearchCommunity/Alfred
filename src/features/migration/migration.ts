import type { Db } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';
import { COUNTRIES } from '../nationality/countries.ts';
import { setRoleId } from '../nationality/repository.ts';
import { watch } from '../threadwatch/repository.ts';

/**
 * One-off import of the old bot's data at cutover. The old bot's `/migrate` exports
 * this file; nothing here is needed once the old bot is gone.
 */
export const MigrationFileSchema = z.object({
	format: z.literal('alfred-migration'),
	version: z.literal(1),
	exportedAt: z.iso.datetime(),
	guildId: Snowflake,
	nationalityRoles: z.array(z.object({ country: z.string().regex(/^[A-Z]{2}$/), roleId: Snowflake })),
	watchedThreads: z.array(Snowflake),
});

export type MigrationFile = z.infer<typeof MigrationFileSchema>;

/** The file's content, or a message saying why it can't be imported */
export function parseMigrationFile(text: string, guildId: string): MigrationFile | string {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return "That file isn't JSON. Use the file the old bot's `/migrate` produced.";
	}
	const result = MigrationFileSchema.safeParse(json);
	if (!result.success) return `That's not a valid migration file:\n${z.prettifyError(result.error)}`;
	if (result.data.guildId !== guildId) return 'That file was exported from a different server.';
	return result.data;
}

export interface ImportChecks {
	/** The member running the import, recorded as who watched the imported threads */
	userId: string;
	roleExists: (roleId: string) => boolean;
	threadExists: (threadId: string) => Promise<boolean>;
}

export interface ImportReport {
	roles: { imported: number; skipped: number };
	threads: { imported: number; alreadyWatched: number; skipped: number };
}

const KNOWN_COUNTRIES = new Set<string>(COUNTRIES.map((country) => country.code));

/** Imports everything that still exists on Discord. Running it again changes nothing. */
export async function importMigration(db: Db, data: MigrationFile, checks: ImportChecks): Promise<ImportReport> {
	const report: ImportReport = {
		roles: { imported: 0, skipped: 0 },
		threads: { imported: 0, alreadyWatched: 0, skipped: 0 },
	};

	for (const { country, roleId } of data.nationalityRoles) {
		if (!KNOWN_COUNTRIES.has(country) || !checks.roleExists(roleId)) {
			report.roles.skipped++;
			continue;
		}
		// oxlint-disable-next-line no-await-in-loop -- a few hundred writes at most, once
		await setRoleId(db, country, roleId);
		report.roles.imported++;
	}

	const importedAt = new Date();
	for (const threadId of data.watchedThreads) {
		// oxlint-disable-next-line no-await-in-loop -- sequential on purpose: Discord rate limits
		if (!(await checks.threadExists(threadId))) {
			report.threads.skipped++;
			continue;
		}
		// oxlint-disable-next-line no-await-in-loop
		if (await watch(db, threadId, checks.userId, importedAt)) report.threads.imported++;
		else report.threads.alreadyWatched++;
	}

	return report;
}
