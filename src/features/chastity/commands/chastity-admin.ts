import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ownerPost, resetConfirmation } from '../messages.ts';
import { SECONDS } from '../time.ts';

/**
 * The owner's side. Registered with Administrator default permissions so regular members
 * never see it (Discord can't hide single subcommands per user), and checked against the
 * configured owner at runtime. Results are posted publicly in the game channel.
 */
@ApplyOptions<Command.Options>({ name: 'chastity-admin', description: 'Owner controls for the chastity game' })
export class ChastityAdminCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		if (!this.container.config.chastity) return;
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((sub) =>
					sub
						.setName('start')
						.setDescription('Start the game with an initial timer')
						.addIntegerOption((o) =>
							o.setName('days').setDescription('Days on the timer').setMinValue(0).setMaxValue(3650),
						)
						.addIntegerOption((o) =>
							o.setName('hours').setDescription('Hours on the timer').setMinValue(0).setMaxValue(87_600),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Set the timer and/or the unlock bank to exact values (to fix mistakes)')
						.addIntegerOption((o) =>
							o.setName('days').setDescription('Timer: days').setMinValue(0).setMaxValue(3650),
						)
						.addIntegerOption((o) =>
							o.setName('hours').setDescription('Timer: hours').setMinValue(0).setMaxValue(87_600),
						)
						.addIntegerOption((o) =>
							o.setName('minutes').setDescription('Timer: minutes').setMinValue(0).setMaxValue(5_256_000),
						)
						.addNumberOption((o) =>
							o
								.setName('bank_hours')
								.setDescription('Unlock bank: hours (up to one decimal)')
								.setMinValue(0),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName('reset')
						.setDescription('End the game so it can be started again (asks first)')
						.addBooleanOption((o) =>
							o.setName('everything').setDescription('Also wipe all balances and leaderboards'),
						),
				)
				.addSubcommand((sub) => sub.setName('unlock').setDescription('Unlock, spending from the unlock bank'))
				.addSubcommand((sub) => sub.setName('relock').setDescription('Lock up again'))
				.addSubcommand((sub) =>
					sub
						.setName('emergency')
						.setDescription('Freeze or unfreeze everything')
						.addStringOption((o) =>
							o
								.setName('state')
								.setDescription('Switch on or off')
								.setRequired(true)
								.addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
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

		const userId = interaction.user.id;
		let result;
		switch (interaction.options.getSubcommand()) {
			case 'start': {
				const days = interaction.options.getInteger('days') ?? 0;
				const hours = interaction.options.getInteger('hours') ?? 0;
				if (days + hours === 0) {
					await interaction.reply({
						content: 'Give the timer some time: days, hours, or both.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
				result = await game.start(userId, days * SECONDS.DAY + hours * SECONDS.HOUR);
				break;
			}
			case 'set': {
				const timer = ['days', 'hours', 'minutes'].map((name) => interaction.options.getInteger(name));
				const bankHours = interaction.options.getNumber('bank_hours');
				if (timer.every((value) => value === null) && bankHours === null) {
					await interaction.reply({
						content: 'Give a new timer (days/hours/minutes), a new unlock bank, or both.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
				const [days, hours, minutes] = timer.map((value) => value ?? 0);
				result = await game.set(userId, {
					...(timer.some((value) => value !== null) && {
						timerSeconds: (days ?? 0) * SECONDS.DAY + (hours ?? 0) * SECONDS.HOUR + (minutes ?? 0) * 60,
					}),
					...(bankHours !== null && { bankSeconds: Math.round(bankHours * 60) * 60 }),
				});
				break;
			}
			case 'reset': {
				const everything = interaction.options.getBoolean('everything') ?? false;
				await interaction.reply(resetConfirmation(everything));
				return;
			}
			case 'unlock':
				result = await game.unlock(userId);
				break;
			case 'relock':
				result = await game.relock(userId);
				break;
			default:
				result = await game.emergency(userId, interaction.options.getString('state', true) === 'on');
		}

		if (!result.ok) {
			await interaction.reply({ content: result.reason, flags: MessageFlags.Ephemeral });
			return;
		}

		// Answer first (Discord allows 3 seconds), then post: the post may wait on a rate limit
		await interaction.reply({ content: 'Done.', flags: MessageFlags.Ephemeral });
		const channel = await this.container.client.channels.fetch(chastity.channelId).catch(() => null);
		if (channel?.isSendable()) await channel.send(ownerPost(result));
	}
}
