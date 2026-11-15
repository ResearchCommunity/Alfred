import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { setTimeout } from 'node:timers/promises';
import { channelMention, InteractionContextType, MessageFlags } from 'discord.js';
import type { ChastityConfig } from '../../../lib/config.ts';
import type { ActionResult } from '../game.ts';
import {
	actionPost,
	infoReply,
	leaderboardPost,
	legendaryDm,
	rejection,
	sendPost,
	spinningPost,
	wheelReply,
	withImage,
} from '../messages.ts';
import { notifyOwner } from '../notifier.ts';
import { BOARDS, type Board, leaderboard } from '../repository.ts';
import { type RenderedSpin, renderSpin } from '../spin-animation.ts';

const MAX_REASON = 200;
/** After the animation lands, before the result replaces it */
const REVEAL_PAUSE_MS = 1000;

const isBoard = (value: string): value is Board => (BOARDS as readonly string[]).includes(value);

/** At most MAX_REASON UTF-16 units (what the event log stores), never cutting a character in half */
function cleanReason(raw: string | null): string | null {
	let reason = '';
	for (const { segment } of new Intl.Segmenter().segment(raw?.trim() ?? '')) {
		if (reason.length + segment.length > MAX_REASON) break;
		reason += segment;
	}
	return reason || null;
}

const BOARD_CHOICES: Record<Board, string> = {
	added: 'Time added',
	removed: 'Time removed',
	spent: 'Currency spent',
	legendary: 'Legendary pulls',
};

/** The members' side of the game. Only works in the configured game channel. */
@ApplyOptions<Command.Options>({ name: 'chastity', description: "Play with xenorio's chastity timer" })
export class ChastityCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		if (!this.container.config.chastity) return;
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((sub) => sub.setName('info').setDescription('Time left, prices, and your balance'))
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setDescription('Add time (costs hours × the current multiplier)')
						.addIntegerOption((o) =>
							o
								.setName('hours')
								.setDescription('Whole hours')
								.setMinValue(1)
								.setMaxValue(10_000)
								.setRequired(true),
						)
						.addStringOption((o) =>
							o.setName('reason').setDescription('Shown with your action').setMaxLength(MAX_REASON),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setDescription('Remove time (flat price per hour)')
						.addIntegerOption((o) =>
							o
								.setName('hours')
								.setDescription('Whole hours')
								.setMinValue(1)
								.setMaxValue(10_000)
								.setRequired(true),
						)
						.addStringOption((o) =>
							o.setName('reason').setDescription('Shown with your action').setMaxLength(MAX_REASON),
						),
				)
				.addSubcommand((sub) => sub.setName('spin').setDescription('Spin the wheel (4 × the multiplier)'))
				.addSubcommand((sub) =>
					sub
						.setName('send')
						.setDescription('Give some of your currency to another member')
						.addUserOption((o) => o.setName('member').setDescription('Who gets it').setRequired(true))
						.addNumberOption((o) =>
							o
								.setName('amount')
								.setDescription('How much (up to one decimal)')
								.setMinValue(0.1)
								.setMaxValue(100_000)
								.setRequired(true),
						)
						.addStringOption((o) =>
							o.setName('reason').setDescription('Shown with the transfer').setMaxLength(MAX_REASON),
						),
				)
				.addSubcommand((sub) => sub.setName('wheel').setDescription("What's on the wheel, and how likely"))
				.addSubcommand((sub) =>
					sub
						.setName('top')
						.setDescription('Leaderboards')
						.addStringOption((o) =>
							o
								.setName('board')
								.setDescription('Which leaderboard')
								.setRequired(true)
								.addChoices(...BOARDS.map((board) => ({ name: BOARD_CHOICES[board], value: board }))),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		const { chastity: game, config } = this.container;
		const chastity = config.chastity;
		if (!game || !chastity) {
			await interaction.reply({ content: "The game isn't set up.", flags: MessageFlags.Ephemeral });
			return;
		}
		if (interaction.channelId !== chastity.channelId) {
			await interaction.reply({
				content: `This only works in ${channelMention(chastity.channelId)}.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const userId = interaction.user.id;
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'info') {
			await interaction.reply(infoReply(await game.info(userId), chastity));
			return;
		}
		if (subcommand === 'wheel') {
			const view = await game.info(userId);
			await interaction.reply(wheelReply(chastity, view.started ? view.multiplier : null));
			return;
		}
		if (subcommand === 'send') {
			const recipient = interaction.options.getMember('member');
			if (!recipient) {
				await interaction.reply({ content: "They're not on this server.", flags: MessageFlags.Ephemeral });
				return;
			}
			if (recipient.user.bot) {
				await interaction.reply({ content: "Bots don't play.", flags: MessageFlags.Ephemeral });
				return;
			}
			const seconds = Math.round(interaction.options.getNumber('amount', true) * 60) * 60;
			const reason = cleanReason(interaction.options.getString('reason'));
			const sent = await game.memberSend(userId, recipient.id, seconds, reason);
			if (sent.ok) await this.post(interaction, sendPost(sent, chastity));
			else await interaction.reply(rejection(sent, chastity));
			return;
		}
		if (subcommand === 'top') {
			const board = interaction.options.getString('board', true);
			if (!isBoard(board)) return;
			await interaction.reply(leaderboardPost(board, await leaderboard(this.container.db, board), chastity));
			return;
		}

		const hours = interaction.options.getInteger('hours') ?? 0;
		const reason = cleanReason(interaction.options.getString('reason'));
		const result =
			subcommand === 'add'
				? await game.memberAdd(userId, hours, reason)
				: subcommand === 'remove'
					? await game.memberRemove(userId, hours, reason)
					: await game.memberSpin(userId);

		if (!result.ok) {
			await interaction.reply(rejection(result, chastity));
			return;
		}
		if (result.roll) await this.spin(interaction, result, chastity);
		else await this.post(interaction, actionPost(result, chastity));
		if (result.roll?.tier === 'legendary') {
			await notifyOwner(
				this.container.client,
				chastity.ownerId,
				legendaryDm(result, chastity),
				this.container.pino,
			);
		}
	}

	/**
	 * Plays the spin: the animation first, then the result once it has landed. The spin has
	 * already happened, so anything going wrong here only costs the show: the result is posted
	 * regardless.
	 */
	private async spin(
		interaction: Command.ChatInputCommandInteraction<'cached'>,
		result: Extract<ActionResult, { ok: true }>,
		config: ChastityConfig,
	): Promise<void> {
		const { pino } = this.container;
		const roll = result.roll;
		if (!roll) return;
		try {
			// Rendering takes about a second, more than is safe inside Discord's 3-second window
			await interaction.deferReply();
		} catch (error) {
			pino.warn({ err: error }, 'Chastity reply failed, posting to the channel instead');
			if (interaction.channel?.isSendable()) await interaction.channel.send(actionPost(result, config));
			return;
		}

		let image: RenderedSpin['result'] | null = null;
		try {
			const rendered = await renderSpin(config.wheel, roll);
			await interaction.editReply(withImage(spinningPost(result, config), 'spin.webp', rendered.animation));
			image = rendered.result;
			await setTimeout(rendered.durationMs + REVEAL_PAUSE_MS);
		} catch (error) {
			pino.warn({ err: error }, 'Spin animation failed, showing the result right away');
		}

		const reveal = actionPost(result, config);
		try {
			await interaction.editReply(
				image ? withImage(reveal, image.name, image.data) : { ...reveal, attachments: [] },
			);
		} catch (error) {
			pino.warn({ err: error }, 'Spin reveal failed, posting to the channel instead');
			if (interaction.channel?.isSendable()) await interaction.channel.send(actionPost(result, config));
		}
	}

	/**
	 * Posts an action's public message as the reply. The action has already happened by now,
	 * so if the reply fails (Discord's 3-second window passed under load), the post goes to the
	 * channel directly instead of getting lost.
	 */
	private async post(
		interaction: Command.ChatInputCommandInteraction<'cached'>,
		message: ReturnType<typeof actionPost>,
	): Promise<void> {
		try {
			await interaction.reply(message);
		} catch (error) {
			this.container.pino.warn({ err: error }, 'Chastity reply failed, posting to the channel instead');
			if (interaction.channel?.isSendable()) await interaction.channel.send(message);
		}
	}
}
