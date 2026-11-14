import type { Db } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';
import { generateToken, hashToken } from './tokens.ts';

/**
 * Forward-only state machine of a verification link:
 *   issued → disclaimer_ok → granting → (deleted on success)
 * `granting` is a lock: only the request that moves the token into it may grant
 * the role. If granting fails, it moves back so the visitor can retry.
 */
export const TokenStates = ['issued', 'disclaimer_ok', 'granting'] as const;
export type TokenState = (typeof TokenStates)[number];

const PuzzleStateSchema = z.object({
	imageId: z.string().min(1),
	angle: z.number().int(),
	issuedAt: z.date(),
});

export type PuzzleState = z.infer<typeof PuzzleStateSchema>;

const VerificationTokenSchema = z.object({
	_id: z.string().describe('SHA-256 of the token, base64url'),
	userId: Snowflake,
	state: z.enum(TokenStates),
	createdAt: z.date(),
	expiresAt: z.date(),
	puzzle: PuzzleStateSchema.nullable(),
	attempts: z.number().int().min(0),
	altchaSignature: z.string().nullable(),
});

export type VerificationToken = z.infer<typeof VerificationTokenSchema>;

export const TOKEN_TTL_MS = 15 * 60_000;

const collection = (db: Db) => db.collection<VerificationToken>('verification_tokens');

export async function ensureIndexes(db: Db): Promise<void> {
	await collection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
	await collection(db).createIndex({ userId: 1 });
}

/** Issues a fresh link token for the member, invalidating any earlier one. Returns the raw token. */
export async function issueToken(db: Db, userId: string, ttlMs = TOKEN_TTL_MS): Promise<string> {
	await collection(db).deleteMany({ userId });

	const { token, hash } = generateToken();
	const now = new Date();
	await collection(db).insertOne(
		VerificationTokenSchema.parse({
			_id: hash,
			userId,
			state: 'issued',
			createdAt: now,
			expiresAt: new Date(now.getTime() + ttlMs),
			puzzle: null,
			attempts: 0,
			altchaSignature: null,
		}),
	);
	return token;
}

/** Looks up a raw token. Expired tokens count as missing (TTL deletion runs only every minute or so). */
export async function findToken(db: Db, rawToken: string): Promise<VerificationToken | null> {
	return collection(db).findOne({ _id: hashToken(rawToken), expiresAt: { $gt: new Date() } });
}

/** Moves a token from one state to another. Atomic: exactly one concurrent caller can win. */
export async function advance(db: Db, hash: string, from: TokenState, to: TokenState): Promise<boolean> {
	const result = await collection(db).findOneAndUpdate(
		{ _id: hash, state: from, expiresAt: { $gt: new Date() } },
		{ $set: { state: to } },
	);
	return result !== null;
}

export async function setPuzzle(db: Db, hash: string, puzzle: PuzzleState, altchaSignature?: string): Promise<void> {
	await collection(db).updateOne(
		{ _id: hash },
		{
			$set: {
				puzzle: PuzzleStateSchema.parse(puzzle),
				...(altchaSignature !== undefined && { altchaSignature }),
			},
		},
	);
}

/** Counts a wrong puzzle answer and returns the total so far. */
export async function recordFailedAttempt(db: Db, hash: string): Promise<number> {
	const result = await collection(db).findOneAndUpdate(
		{ _id: hash },
		{ $inc: { attempts: 1 } },
		{ returnDocument: 'after' },
	);
	return result?.attempts ?? Number.POSITIVE_INFINITY;
}

export async function deleteToken(db: Db, hash: string): Promise<void> {
	await collection(db).deleteOne({ _id: hash });
}
