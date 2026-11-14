import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ChannelType, MessageFlags, type ModalSubmitInteraction, channelMention } from 'discord.js';
import { openTicket, TicketDialog } from '../tickets.ts';

/** The confirmation dialog was submitted: open the ticket, with the member's answer if any */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.ModalSubmit })
export class TicketsOpenDialogHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		return interaction.customId === TicketDialog.Id ? this.some() : this.none();
	}

	public override async run(interaction: ModalSubmitInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) return;
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const config = this.container.config.tickets;
		const category = config && interaction.guild.channels.cache.get(config.categoryId);
		if (!config || category?.type !== ChannelType.GuildCategory) {
			await interaction.editReply('Tickets are not set up right now. Please reach out to a tripsitter directly.');
			return;
		}

		const details = interaction.fields.getTextInputValue(TicketDialog.Details);
		const { channel, existing } = await openTicket(interaction.member, category, config, details);
		await interaction.editReply(
			existing
				? `You already have a tripsitting channel: ${channelMention(channel.id)}`
				: `Your private tripsitting channel is ready: ${channelMention(channel.id)}`,
		);
	}
}
