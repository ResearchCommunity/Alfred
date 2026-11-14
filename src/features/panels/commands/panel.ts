import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ticketPanel } from '../../tickets/tickets.ts';

/**
 * Posts a feature's panel message (the thing with the buttons) into the current
 * channel. Each feature owns its panel's content; this command just places it.
 */
@ApplyOptions<Command.Options>({ name: 'panel', description: 'Post a feature panel in this channel' })
export class PanelCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((sub) => sub.setName('tickets').setDescription('The "Tripsit me!" button')),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		const channel = interaction.channel;
		if (!channel?.isSendable()) {
			await interaction.reply({ content: "I can't post in this channel.", flags: MessageFlags.Ephemeral });
			return;
		}

		const panel = interaction.options.getSubcommand();
		switch (panel) {
			case 'tickets': {
				const config = this.container.config.tickets;
				if (!config) {
					await interaction.reply({
						content: 'Set up `tickets` in config.yaml first.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
				await channel.send(ticketPanel(config));
				break;
			}
			default:
				throw new Error(`Unknown panel: ${panel}`);
		}

		await interaction.reply({ content: 'Panel posted.', flags: MessageFlags.Ephemeral });
	}
}
