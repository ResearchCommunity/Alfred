import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { CLOSE_REASON, isTicketChannel, TicketButton } from '../tickets.ts';

/**
 * Anyone who can see the ticket may close it. Closing deletes the channel, which
 * is all there is: Alfred stores nothing about tickets anywhere.
 */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class TicketsCloseConfirmHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === TicketButton.ConfirmClose ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		const config = this.container.config.tickets;
		const channel = interaction.channel;
		if (!config || !channel || channel.isDMBased() || !isTicketChannel(channel, config)) {
			await interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferUpdate();
		await channel.delete(CLOSE_REASON);
		this.container.logger.info('Tripsit ticket closed');
	}
}
