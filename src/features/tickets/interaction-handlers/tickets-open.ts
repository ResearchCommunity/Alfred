import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, ChannelType, MessageFlags, channelMention } from 'discord.js';
import { openTicket, TicketButton } from '../tickets.ts';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class TicketsOpenHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === TicketButton.Open ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) return;
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const config = this.container.config.tickets;
		const category = config && interaction.guild.channels.cache.get(config.categoryId);
		if (!config || category?.type !== ChannelType.GuildCategory) {
			await interaction.editReply('Tickets are not set up right now. Please reach out to a tripsitter directly.');
			return;
		}

		const { channel, existing } = await openTicket(interaction.member, category, config);
		await interaction.editReply(
			existing
				? `You already have a tripsitting channel: ${channelMention(channel.id)}`
				: `Your private tripsitting channel is ready: ${channelMention(channel.id)}`,
		);
	}
}
