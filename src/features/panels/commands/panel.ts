import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, type MessageCreateOptions, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { nationalityPanel, rulesPanel } from '../../onboarding/panels.ts';
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
				.addSubcommand((sub) => sub.setName('tickets').setDescription('The "Tripsit me!" button'))
				.addSubcommand((sub) => sub.setName('rules').setDescription('The rules with Accept/Decline'))
				.addSubcommand((sub) => sub.setName('nationality').setDescription('Info about /nationality')),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		const channel = interaction.channel;
		if (!channel?.isSendable()) {
			await interaction.reply({ content: "I can't post in this channel.", flags: MessageFlags.Ephemeral });
			return;
		}

		const message = this.buildPanel(interaction.options.getSubcommand());
		if (typeof message === 'string') {
			await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
			return;
		}
		await channel.send(message);

		await interaction.reply({ content: 'Panel posted.', flags: MessageFlags.Ephemeral });
	}

	/** The panel's message, or why it can't be posted */
	private buildPanel(panel: string): MessageCreateOptions | string {
		const { tickets, onboarding, nationality } = this.container.config;
		switch (panel) {
			case 'tickets':
				return tickets ? ticketPanel(tickets) : 'Set up `tickets` in config.yaml first.';
			case 'rules':
				return onboarding ? rulesPanel(onboarding) : 'Set up `onboarding` in config.yaml first.';
			case 'nationality':
				return nationality.panelText
					? nationalityPanel(nationality.panelText)
					: 'Set `nationality.panelText` in config.yaml first.';
			default:
				throw new Error(`Unknown panel: ${panel}`);
		}
	}
}
