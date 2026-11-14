import { describe, expect, it } from 'vitest';
import { ensureIndexes, findRepost, forgetRepost, recordRepost } from '../../src/features/link-cleaner/repository.ts';
import { useTestDatabase } from './helpers.ts';

const REPOST = '300000000000000003';
const AUTHOR = '400000000000000004';

describe('link cleaner repository', () => {
	const db = useTestDatabase();

	it('creates the expiry index (DocumentDB supports TTL indexes)', async () => {
		await ensureIndexes(db());
		const indexes = await db().collection('cleaned_messages').indexes();
		expect(indexes).toContainEqual(
			expect.objectContaining({ key: { createdAt: 1 }, expireAfterSeconds: 2_592_000 }),
		);
	});

	it('records, finds and forgets reposts', async () => {
		await recordRepost(db(), REPOST, AUTHOR);
		expect(await findRepost(db(), REPOST)).toMatchObject({ _id: REPOST, authorId: AUTHOR });
		await forgetRepost(db(), REPOST);
		expect(await findRepost(db(), REPOST)).toBeNull();
	});
});
