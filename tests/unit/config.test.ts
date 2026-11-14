import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildConfigJsonSchema, parseConfig } from '../../src/lib/config.ts';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('config', () => {
	it('accepts config.example.yaml', async () => {
		const example: unknown = parseYaml(await read('config.example.yaml'));
		expect(() => parseConfig(example)).not.toThrow();
	});

	it('applies presence defaults', () => {
		expect(parseConfig({ guildId: '123456789012345678' }).presence).toEqual({ status: 'online' });
	});

	it('rejects unknown keys so typos do not go unnoticed', () => {
		expect(() => parseConfig({ guildId: '123456789012345678', guildID: 'oops' })).toThrow(/guildID/);
	});

	it('has an up-to-date config.schema.json (run `yarn config:schema`)', async () => {
		const committed: unknown = JSON.parse(await read('config.schema.json'));
		expect(committed).toEqual(buildConfigJsonSchema());
	});
});
