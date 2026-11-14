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
	ModalBuilder,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
	TextDisplayBuilder,
	TextInputStyle,
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

/** The confirmation dialog the "Tripsit me!" button opens */
export const TicketDialog = {
	Id: 'tickets:open-dialog',
	Details: 'details',
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

export function findOpenTicket(category: CategoryChannel, memberId: string): TextChannel | undefined {
	return category.children.cache.find(
		(channel): channel is TextChannel =>
			channel.type === ChannelType.GuildText &&
			channel.name.startsWith(NAME_PREFIX) &&
			channel.permissionOverwrites.cache.get(memberId)?.type === OverwriteType.Member,
	);
}

/**
 * Opens a member's ticket, or returns the one they already have. `details` is their answer
 * to "What's going on?": it is only ever posted into the new channel, never logged or kept.
 */
export function openTicket(
	member: GuildMember,
	category: CategoryChannel,
	config: TicketsConfig,
	details?: string,
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

		await channel.send(ticketIntro(member.id, config, details));
		return { channel, existing: false };
	});
}

/** Quotes every line, so a multi-line answer stays one quote */
const quote = (text: string) =>
	text
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');

export function ticketIntro(memberId: string, config: TicketsConfig, details?: string): MessageCreateOptions {
	const answer = details?.trim();
	const container = new ContainerBuilder()
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`<@${memberId}> <@&${config.tripsitterRoleId}>\n` +
					"### Here's your private tripsitting channel\n" +
					'Only you and our tripsitters can see it. Take your time, someone will be with you shortly.\n' +
					(answer ? `### What's going on\n${quote(answer)}\n` : '') +
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

export function ticketDialog(): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(TicketDialog.Id)
		.setTitle('Open a tripsit channel?')
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				"This opens a private text channel and pings our tripsitters in it. Please don't open one just for fun.",
			),
		)
		.addLabelComponents((label) =>
			label
				.setLabel("What's going on?")
				.setDescription("Optional. What you took, how much, when, and how you're feeling.")
				.setTextInputComponent((input) =>
					input
						.setCustomId(TicketDialog.Details)
						.setStyle(TextInputStyle.Paragraph)
						.setRequired(false)
						.setMaxLength(1000),
				),
		);
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
