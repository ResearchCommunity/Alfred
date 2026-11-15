import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { RESET_BUTTON, RESET_CONFIRM_MS, resetPost } from '../messages.ts';

/** The confirm button of `/chastity-admin reset` */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class ChastityResetHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId.startsWith(RESET_BUTTON) ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		const { chastity: game, config } = this.container;
		if (!game || !config.chastity) {
			await interaction.reply({ content: "The game isn't set up.", flags: MessageFlags.Ephemeral });
			return;
		}

		const [scope, issuedAt] = interaction.customId.slice(RESET_BUTTON.length).split(':');
		const age = Date.now() - Number(issuedAt);
		if (!Number.isFinite(age) || age > RESET_CONFIRM_MS) {
			await interaction.update({ content: 'This confirmation expired. Run the command again.', components: [] });
			return;
		}
		const everything = scope === 'everything';
		const result = await game.reset(interaction.user.id, everything);
		if (!result.ok) {
			await interaction.update({ content: result.reason, components: [] });
			return;
		}

		// Answer first (Discord allows 3 seconds), then post
		await interaction.update({
			content: 'The game was reset. Start a new one with `/chastity-admin start`.',
			components: [],
		});
		const channel = await this.container.client.channels.fetch(config.chastity.channelId).catch(() => null);
		if (channel?.isSendable()) await channel.send(resetPost(everything));
	}
}
