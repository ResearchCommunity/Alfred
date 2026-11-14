import { createHash, randomBytes } from 'node:crypto';

/**
 * Verification links carry a random token; the database only ever sees its hash,
 * so a leaked database can't be used to verify anyone.
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

export function generateToken(): { token: string; hash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, hash: hashToken(token) };
}
