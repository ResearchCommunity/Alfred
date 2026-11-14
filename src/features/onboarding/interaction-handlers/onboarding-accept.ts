import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, type ButtonInteraction, ButtonStyle, MessageFlags } from 'discord.js';
import { LEGACY_ACCEPT, OnboardingButton } from '../panels.ts';
import { issueToken, TOKEN_TTL_MS } from '../repository.ts';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class OnboardingAcceptHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === OnboardingButton.Accept || interaction.customId === LEGACY_ACCEPT
			? this.some()
			: this.none();
	}

	public override async run(interaction: ButtonInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) return;
		const config = this.container.config.onboarding;
		if (!config) {
			await interaction.reply({
				content: 'Verification is not set up right now.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (interaction.member.roles.cache.has(config.verifiedRoleId)) {
			await interaction.reply({ content: "You've already accepted the rules!", flags: MessageFlags.Ephemeral });
			return;
		}

		const token = await issueToken(this.container.db, interaction.user.id);
		await interaction.reply({
			content:
				'Just one more step! Open the link below to verify.\n' +
				`-# The link only works for you and expires in ${TOKEN_TTL_MS / 60_000} minutes. Don't share it.`,
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setStyle(ButtonStyle.Link)
						.setURL(`${config.publicUrl}/v/${token}`)
						.setLabel('Verify'),
				),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}
