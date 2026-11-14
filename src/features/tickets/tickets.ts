import { randomBytes } from 'node:crypto';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CategoryChannel,
	ChannelType,
	ContainerBuilder,
	type GuildMember,
	MessageFlags,
	type MessageCreateOptions,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
	TextDisplayBuilder,
} from 'discord.js';
import type { Config } from '../../lib/config.ts';
import { Mutex } from '../../lib/mutex.ts';

/*
 * Tripsit tickets keep NOTHING once closed: no database, no transcript, and no
 * member names or IDs in our logs or audit-log reasons. Whether a member already
 * has a ticket is read from Discord itself (a member overwrite in the ticket
 * category), so there is no state that could outlive the channel.
 */

export type TicketsConfig = NonNullable<Config['tickets']>;

export const TicketButton = {
	Open: 'tickets:open',
	Close: 'tickets:close',
	ConfirmClose: 'tickets:close-confirm',
} as const;

const NAME_PREFIX = 'tripsit-';
// Generic on purpose: audit-log reasons are kept by Discord for weeks
const REASON = 'Tripsit ticket';

const VISIBLE = [
	PermissionFlagsBits.ViewChannel,
	PermissionFlagsBits.SendMessages,
	PermissionFlagsBits.ReadMessageHistory,
	PermissionFlagsBits.AttachFiles,
	PermissionFlagsBits.EmbedLinks,
];

/** Opening is serialized so a double-click can't create two channels for one member */
const openLock = new Mutex();

export function isTicketChannel(channel: { parentId: string | null; name: string }, config: TicketsConfig): boolean {
	return channel.parentId === config.categoryId && channel.name.startsWith(NAME_PREFIX);
}

function findOpenTicket(category: CategoryChannel, memberId: string): TextChannel | undefined {
	return category.children.cache.find(
		(channel): channel is TextChannel =>
			channel.type === ChannelType.GuildText &&
			channel.name.startsWith(NAME_PREFIX) &&
			channel.permissionOverwrites.cache.get(memberId)?.type === OverwriteType.Member,
	);
}

export function openTicket(
	member: GuildMember,
	category: CategoryChannel,
	config: TicketsConfig,
): Promise<{ channel: TextChannel; existing: boolean }> {
	return openLock.run(async () => {
		const existing = findOpenTicket(category, member.id);
		if (existing) return { channel: existing, existing: true };

		const channel = await category.children.create({
			name: `${NAME_PREFIX}${randomBytes(2).toString('hex')}`,
			type: ChannelType.GuildText,
			reason: REASON,
			permissionOverwrites: [
				{
					id: member.guild.roles.everyone.id,
					type: OverwriteType.Role,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{ id: member.id, type: OverwriteType.Member, allow: VISIBLE },
				{ id: config.tripsitterRoleId, type: OverwriteType.Role, allow: VISIBLE },
				{
					id: member.client.user.id,
					type: OverwriteType.Member,
					allow: [...VISIBLE, PermissionFlagsBits.ManageChannels],
				},
			],
		});

		await channel.send(ticketIntro(member.id, config));
		return { channel, existing: false };
	});
}

function ticketIntro(memberId: string, config: TicketsConfig): MessageCreateOptions {
	const container = new ContainerBuilder()
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`<@${memberId}> <@&${config.tripsitterRoleId}>\n` +
					"### Here's your private tripsitting channel\n" +
					'Only you and our tripsitters can see it. Take your time, someone will be with you shortly.\n' +
					'-# When you are done, anyone here can close it. The channel and everything in it will be deleted for good.',
			),
		)
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(TicketButton.Close)
					.setStyle(ButtonStyle.Secondary)
					.setLabel('Close ticket')
					.setEmoji('🔒'),
			),
		);

	return {
		components: [container],
		flags: MessageFlags.IsComponentsV2,
		// Explicitly allowed: the client default never pings roles
		allowedMentions: { users: [memberId], roles: [config.tripsitterRoleId] },
	};
}

export function ticketPanel(config: TicketsConfig): MessageCreateOptions {
	const container = new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panelText))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(TicketButton.Open)
					.setStyle(ButtonStyle.Primary)
					.setLabel('Tripsit me!'),
			),
		);

	return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function closeConfirmation(): { components: ActionRowBuilder<ButtonBuilder>[]; content: string } {
	return {
		content: 'Close this ticket? **The channel and every message in it will be deleted permanently.**',
		components: [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(TicketButton.ConfirmClose)
					.setStyle(ButtonStyle.Danger)
					.setLabel('Close and delete everything'),
			),
		],
	};
}

export const CLOSE_REASON = REASON;
