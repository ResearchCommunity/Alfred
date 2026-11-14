import { container } from '@sapphire/framework';
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';

export type GrantResult = 'granted' | 'already' | 'not-member';

export function renderWelcome(template: string, userId: string): string {
	return template.replaceAll('%user%', `<@${userId}>`);
}

/**
 * Gives a member who passed verification the verified role and welcomes them.
 * Throws on unexpected Discord errors, so the caller can let the visitor retry.
 */
export async function grantAccess(userId: string): Promise<GrantResult> {
	const { client, config, logger } = container;
	const onboarding = config.onboarding;
	if (!onboarding) throw new Error('Onboarding is not configured');

	const guild = await client.guilds.fetch(config.guildId);
	let member;
	try {
		member = await guild.members.fetch(userId);
	} catch (error) {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return 'not-member';
		throw error;
	}

	if (member.roles.cache.has(onboarding.verifiedRoleId)) return 'already';
	await member.roles.add(onboarding.verifiedRoleId, 'Verified');
	logger.info(`Verified member ${userId}`);

	// A missing welcome message must not undo a successful verification
	try {
		const channel = await guild.channels.fetch(onboarding.welcomeChannelId);
		if (channel?.isSendable()) {
			const line =
				onboarding.welcomeMessages[Math.floor(Math.random() * onboarding.welcomeMessages.length)] ?? '%user%';
			await channel.send({ content: renderWelcome(line, userId), allowedMentions: { users: [userId] } });
		}
	} catch (error) {
		logger.warn('Could not post welcome message', error);
	}

	return 'granted';
}
