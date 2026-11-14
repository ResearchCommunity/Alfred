import { createHmac } from 'node:crypto';
import { type Challenge, createChallenge, type Payload, randomInt, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { z } from 'zod';

/**
 * Silent proof-of-work (ALTCHA). Each verification token gets its own challenge;
 * only a solution to *that* challenge (matched by signature) is accepted.
 */

export interface AltchaDifficulty {
	/** PBKDF2 iterations per attempt */
	cost: number;
	/** The solution counter is drawn from [maxCounter / 2, maxCounter] */
	maxCounter: number;
}

/** A few seconds of background work in a browser; invisible to people, costly at scale */
export const DEFAULT_DIFFICULTY: AltchaDifficulty = { cost: 5_000, maxCounter: 10_000 };

const ALGORITHM = 'PBKDF2/SHA-256';

function secrets(key: string) {
	return {
		hmacSignatureSecret: key,
		hmacKeySignatureSecret: createHmac('sha256', key).update('altcha-key').digest('base64url'),
	};
}

export async function createAltchaChallenge(
	key: string,
	difficulty: AltchaDifficulty = DEFAULT_DIFFICULTY,
): Promise<{ challenge: Challenge; signature: string }> {
	const challenge = await createChallenge({
		algorithm: ALGORITHM,
		cost: difficulty.cost,
		counter: randomInt(difficulty.maxCounter, Math.floor(difficulty.maxCounter / 2)),
		deriveKey,
		expiresAt: new Date(Date.now() + 30 * 60_000),
		...secrets(key),
	});
	if (!challenge.signature) throw new Error('ALTCHA challenge was not signed');
	return { challenge, signature: challenge.signature };
}

const PayloadSchema = z.object({
	challenge: z.object({
		parameters: z.object({
			algorithm: z.string(),
			nonce: z.string(),
			salt: z.string(),
			cost: z.number(),
			keyLength: z.number(),
			keyPrefix: z.string(),
			keySignature: z.string().optional(),
			memoryCost: z.number().optional(),
			parallelism: z.number().optional(),
			expiresAt: z.number().optional(),
			data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
		}),
		signature: z.string(),
	}),
	solution: z.object({ counter: z.number(), derivedKey: z.string(), time: z.number().optional() }),
}) satisfies z.ZodType<Payload>;

/** The widget submits base64(JSON({ challenge, solution })) */
export async function verifyAltcha(payload: string, key: string, expectedSignature: string): Promise<boolean> {
	let parsed: Payload;
	try {
		parsed = PayloadSchema.parse(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')));
	} catch {
		return false;
	}
	if (parsed.challenge.signature !== expectedSignature) return false;

	const result = await verifySolution({
		challenge: parsed.challenge,
		solution: parsed.solution,
		deriveKey,
		...secrets(key),
	});
	return result.verified;
}
