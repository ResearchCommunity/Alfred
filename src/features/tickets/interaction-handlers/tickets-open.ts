import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, ChannelType, MessageFlags, channelMention } from 'discord.js';
import { findOpenTicket, TicketButton, ticketDialog } from '../tickets.ts';

/** "Tripsit me!": asks for confirmation in a dialog before a channel is opened and people are pinged */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class TicketsOpenHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		// 'ticket-create' is the old bot's ID, so its existing panels and tickets keep working
		return interaction.customId === TicketButton.Open || interaction.customId === 'ticket-create'
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) return;

		const config = this.container.config.tickets;
		const category = config && interaction.guild.channels.cache.get(config.categoryId);
		if (!config || category?.type !== ChannelType.GuildCategory) {
			await interaction.reply({
				content: 'Tickets are not set up right now. Please reach out to a tripsitter directly.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const existing = findOpenTicket(category, interaction.user.id);
		if (existing) {
			await interaction.reply({
				content: `You already have a tripsitting channel: ${channelMention(existing.id)}`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Must be the first response to the click: no defer before it
		await interaction.showModal(ticketDialog());
	}
}
