import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { closeConfirmation, isTicketChannel, TicketButton } from '../tickets.ts';

/** First click: ask for confirmation, so a stray click mid-session can't wipe the conversation */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class TicketsCloseHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		// 'ticket-delete' is the old bot's ID, so its existing panels and tickets keep working
		return interaction.customId === TicketButton.Close || interaction.customId === 'ticket-delete'
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		const config = this.container.config.tickets;
		const channel = interaction.channel;
		if (!config || !channel || channel.isDMBased() || !isTicketChannel(channel, config)) {
			await interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply({ ...closeConfirmation(), flags: MessageFlags.Ephemeral });
	}
}
