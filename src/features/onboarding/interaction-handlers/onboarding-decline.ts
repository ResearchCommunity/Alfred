import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, type ButtonInteraction, ButtonStyle, MessageFlags } from 'discord.js';
import { LEGACY_DECLINE, OnboardingButton } from '../panels.ts';

/** First click: confirm, so a misclick doesn't get anyone kicked */
@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class OnboardingDeclineHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === OnboardingButton.Decline || interaction.customId === LEGACY_DECLINE
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		await interaction.reply({
			content: "Are you sure? Declining the rules means you'll be removed from the server.",
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(OnboardingButton.ConfirmDecline)
						.setStyle(ButtonStyle.Danger)
						.setLabel('Leave the server'),
				),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}
