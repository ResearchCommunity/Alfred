import { describe, expect, it } from 'vitest';
import { isWatched, listWatched, toggleWatch, unwatch } from '../../src/features/threadwatch/repository.ts';
import { useTestDatabase } from './helpers.ts';

const THREAD = '100000000000000001';
const USER = '200000000000000002';

describe('threadwatch repository', () => {
	const db = useTestDatabase();

	it('toggles a thread on and off', async () => {
		expect(await toggleWatch(db(), THREAD, USER)).toBe('watched');
		expect(await isWatched(db(), THREAD)).toBe(true);
		expect(await listWatched(db())).toEqual([THREAD]);

		expect(await toggleWatch(db(), THREAD, USER)).toBe('unwatched');
		expect(await isWatched(db(), THREAD)).toBe(false);
		expect(await listWatched(db())).toEqual([]);
	});

	it('reports whether unwatching removed anything', async () => {
		await toggleWatch(db(), THREAD, USER);
		expect(await unwatch(db(), THREAD)).toBe(true);
		expect(await unwatch(db(), THREAD)).toBe(false);
	});

	it('survives two simultaneous toggles', async () => {
		// Racing toggles are inherently order-dependent; what matters is that neither
		// throws and the final state agrees with what was reported.
		const results = await Promise.all([toggleWatch(db(), THREAD, USER), toggleWatch(db(), THREAD, USER)]);
		expect(await isWatched(db(), THREAD)).toBe(!results.includes('unwatched'));
		await unwatch(db(), THREAD);
	});
});
