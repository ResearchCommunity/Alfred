import { describe, expect, it } from 'vitest';
import { importMigration, parseMigrationFile } from '../../src/features/migration/migration.ts';
import { listAll } from '../../src/features/nationality/repository.ts';
import { listWatched } from '../../src/features/threadwatch/repository.ts';
import { useTestDatabase } from './helpers.ts';

const GUILD = '100000000000000001';
const ADMIN = '200000000000000002';
const ROLE_DE = '300000000000000003';
const ROLE_GONE = '300000000000000004';
const THREAD = '400000000000000005';
const THREAD_GONE = '400000000000000006';

const file = JSON.stringify({
	format: 'alfred-migration',
	version: 1,
	exportedAt: '2026-11-14T20:00:00.000Z',
	guildId: GUILD,
	nationalityRoles: [
		{ country: 'DE', roleId: ROLE_DE },
		{ country: 'FR', roleId: ROLE_GONE },
		{ country: 'ZZ', roleId: ROLE_DE },
	],
	watchedThreads: [THREAD, THREAD_GONE],
});

const checks = {
	userId: ADMIN,
	roleExists: (roleId: string) => roleId === ROLE_DE,
	threadExists: async (threadId: string) => threadId === THREAD,
};

describe('parseMigrationFile', () => {
	it('accepts an export of this server', () => {
		expect(typeof parseMigrationFile(file, GUILD)).toBe('object');
	});

	it('refuses other servers, other JSON and non-JSON with a reason', () => {
		expect(parseMigrationFile(file, '999999999999999999')).toMatch(/different server/);
		expect(parseMigrationFile('{"hello": 1}', GUILD)).toMatch(/not a valid migration file/);
		expect(parseMigrationFile('not json', GUILD)).toMatch(/isn't JSON/);
	});
});

describe('importMigration', () => {
	const db = useTestDatabase();

	it('imports what still exists, skips the rest, and changes nothing the second time', async () => {
		const data = parseMigrationFile(file, GUILD);
		if (typeof data === 'string') throw new Error(data);

		expect(await importMigration(db(), data, checks)).toEqual({
			roles: { imported: 1, skipped: 2 },
			threads: { imported: 1, alreadyWatched: 0, skipped: 1 },
		});
		expect(await listAll(db())).toEqual([{ _id: 'DE', roleId: ROLE_DE }]);
		expect(await listWatched(db())).toEqual([THREAD]);

		expect((await importMigration(db(), data, checks)).threads).toEqual({
			imported: 0,
			alreadyWatched: 1,
			skipped: 1,
		});
		expect(await listWatched(db())).toEqual([THREAD]);
	});
});
