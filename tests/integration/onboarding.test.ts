import { describe, expect, it } from 'vitest';
import {
	advance,
	deleteToken,
	ensureIndexes,
	findToken,
	issueToken,
	recordFailedAttempt,
	setPuzzle,
} from '../../src/features/onboarding/repository.ts';
import { hashToken } from '../../src/features/onboarding/tokens.ts';
import { useTestDatabase } from './helpers.ts';

const USER = '500000000000000005';

describe('verification token repository', () => {
	const db = useTestDatabase();

	it('creates the expiry and user indexes', async () => {
		await ensureIndexes(db());
		const indexes = await db().collection('verification_tokens').indexes();
		expect(indexes).toContainEqual(expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }));
		expect(indexes).toContainEqual(expect.objectContaining({ key: { userId: 1 } }));
	});

	it('invalidates the previous link when Accept is clicked again', async () => {
		const first = await issueToken(db(), USER);
		const second = await issueToken(db(), USER);
		expect(await findToken(db(), first)).toBeNull();
		expect(await findToken(db(), second)).toMatchObject({ userId: USER, state: 'issued' });
	});

	it('treats expired tokens as missing', async () => {
		const token = await issueToken(db(), USER, -1000);
		expect(await findToken(db(), token)).toBeNull();
	});

	it('only advances from the expected state', async () => {
		const hash = hashToken(await issueToken(db(), USER));
		expect(await advance(db(), hash, 'disclaimer_ok', 'granting')).toBe(false);
		expect(await advance(db(), hash, 'issued', 'disclaimer_ok')).toBe(true);
		expect(await advance(db(), hash, 'issued', 'disclaimer_ok')).toBe(false);
	});

	it('lets exactly one of two simultaneous grants win', async () => {
		const hash = hashToken(await issueToken(db(), USER));
		await advance(db(), hash, 'issued', 'disclaimer_ok');
		const results = await Promise.all([
			advance(db(), hash, 'disclaimer_ok', 'granting'),
			advance(db(), hash, 'disclaimer_ok', 'granting'),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('stores puzzles and counts failed attempts', async () => {
		const token = await issueToken(db(), USER);
		const hash = hashToken(token);
		await setPuzzle(db(), hash, { imageId: 'flask.jpg', angle: 120, issuedAt: new Date() }, 'sig');
		expect(await findToken(db(), token)).toMatchObject({
			puzzle: { imageId: 'flask.jpg', angle: 120 },
			altchaSignature: 'sig',
		});
		expect(await recordFailedAttempt(db(), hash)).toBe(1);
		expect(await recordFailedAttempt(db(), hash)).toBe(2);
		await deleteToken(db(), hash);
		expect(await findToken(db(), token)).toBeNull();
	});
});
