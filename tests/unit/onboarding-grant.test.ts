import { describe, expect, it } from 'vitest';
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { isMissingMember, renderWelcome } from '../../src/features/onboarding/grant.ts';
import { parseConfig } from '../../src/lib/config.ts';

const apiError = (code: number) =>
	new DiscordAPIError({ code, message: 'x' }, code, 404, 'GET', '/guilds/1/members/2', {});

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
				rules: {
					title: 'Rules',
					intro: 'Hi',
					headline: { name: 'No sourcing', text: 'Never' },
					list: [{ name: 'Be nice', text: 'Always' }],
				},
			},
		});
		for (const line of config.onboarding?.welcomeMessages ?? []) {
			const rendered = renderWelcome(line, '42');
			expect(rendered).toContain('<@42>');
			expect(rendered).not.toContain('%user%');
		}
	});

	it('treats left members and deleted accounts as missing', () => {
		expect(isMissingMember(apiError(RESTJSONErrorCodes.UnknownMember))).toBe(true);
		expect(isMissingMember(apiError(RESTJSONErrorCodes.UnknownUser))).toBe(true);
		expect(isMissingMember(apiError(RESTJSONErrorCodes.MissingPermissions))).toBe(false);
		expect(isMissingMember(new Error('network'))).toBe(false);
	});
});
