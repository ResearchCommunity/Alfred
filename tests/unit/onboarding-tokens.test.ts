import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/features/onboarding/tokens.ts';

describe('verification tokens', () => {
	it('hashes consistently', () => {
		const { token, hash } = generateToken();
		expect(hashToken(token)).toBe(hash);
		expect(hash).not.toBe(token);
	});

	it('generates 256-bit base64url tokens without repeats', () => {
		const tokens = new Set(Array.from({ length: 1000 }, () => generateToken().token));
		expect(tokens.size).toBe(1000);
		for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
	});
});
