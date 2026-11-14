import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { OnboardingButton } from '../panels.ts';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class OnboardingDeclineConfirmHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === OnboardingButton.ConfirmDecline ? this.some() : this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) return;

		// Staff testing the panel can't be kicked by the bot anyway
		if (!interaction.member.kickable) {
			await interaction.update({ content: "I can't remove you (you outrank me).", components: [] });
			return;
		}

		await interaction.update({ content: 'Goodbye 👋', components: [] });
		await interaction.member.kick('Declined the rules');
	}
}
