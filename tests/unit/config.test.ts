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
	describe('onboarding', () => {
		const base = {
			guildId: '123456789012345678',
			onboarding: {
				verifiedRoleId: '123456789012345678',
				welcomeChannelId: '123456789012345678',
				publicUrl: 'https://verify.example.org/',
				rules: {
					title: 'Rules',
					intro: 'Hi',
					headline: { name: 'No sourcing', text: 'Never' },
					list: [{ name: 'Be nice', text: 'Always' }],
				},
			},
		};

		it('ships the 15 old welcome lines, each with a %user% placeholder', () => {
			const { welcomeMessages } = parseConfig(base).onboarding ?? {};
			expect(welcomeMessages).toHaveLength(15);
			for (const line of welcomeMessages ?? []) expect(line).toContain('%user%');
		});

		it('strips the trailing slash from publicUrl', () => {
			expect(parseConfig(base).onboarding?.publicUrl).toBe('https://verify.example.org');
		});

		it('rejects rules longer than a Discord message', () => {
			const rules = { ...base.onboarding.rules, list: [{ name: 'Long', text: 'x'.repeat(4001) }] };
			expect(() => parseConfig({ ...base, onboarding: { ...base.onboarding, rules } })).toThrow(/4000/);
		});

		it('rejects a publicUrl that is not a URL', () => {
			expect(() => parseConfig({ ...base, onboarding: { ...base.onboarding, publicUrl: 'verify' } })).toThrow(
				/publicUrl/,
			);
		});
	});
});
