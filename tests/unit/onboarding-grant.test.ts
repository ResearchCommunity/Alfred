import { describe, expect, it } from 'vitest';
import { renderWelcome } from '../../src/features/onboarding/grant.ts';
import { parseConfig } from '../../src/lib/config.ts';

describe('welcome messages', () => {
	it('replaces every %user% with a mention', () => {
		expect(renderWelcome('%user% and %user%', '1')).toBe('<@1> and <@1>');
	});

	it('renders all default lines without leftovers', () => {
		const config = parseConfig({
			guildId: '123456789012345678',
			onboarding: {
				verifiedRoleId: '123456789012345678',
				welcomeChannelId: '123456789012345678',
				publicUrl: 'https://verify.example.org',
				rulesContent: 'Be nice',
			},
		});
		for (const line of config.onboarding?.welcomeMessages ?? []) {
			const rendered = renderWelcome(line, '42');
			expect(rendered).toContain('<@42>');
			expect(rendered).not.toContain('%user%');
		}
	});
});
