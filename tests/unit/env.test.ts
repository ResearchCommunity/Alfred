import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/lib/env.ts';

const valid = { DISCORD_TOKEN: 'token', DATABASE_URL: 'mongodb://user:pass@localhost:10260/' };

describe('env', () => {
	it('applies defaults', () => {
		expect(parseEnv(valid)).toMatchObject({ NODE_ENV: 'development', HTTP_PORT: 3050, DATABASE_NAME: 'alfred' });
	});

	it('coerces the HTTP port', () => {
		expect(parseEnv({ ...valid, HTTP_PORT: '8080' }).HTTP_PORT).toBe(8080);
	});

	it('reports missing secrets', () => {
		expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/DISCORD_TOKEN/);
	});

	it('rejects non-mongodb database URLs', () => {
		expect(() => parseEnv({ ...valid, DATABASE_URL: 'postgres://localhost/alfred' })).toThrow(/DATABASE_URL/);
	});

	it('rejects a short ALTCHA key', () => {
		expect(() => parseEnv({ ...valid, ALTCHA_HMAC_KEY: 'tooshort12' })).toThrow(/ALTCHA_HMAC_KEY/);
	});
});
