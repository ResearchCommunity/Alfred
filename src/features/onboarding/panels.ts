import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	type MessageCreateOptions,
	MessageFlags,
	TextDisplayBuilder,
} from 'discord.js';
import type { Config } from '../../lib/config.ts';

export type OnboardingConfig = NonNullable<Config['onboarding']>;

export const OnboardingButton = {
	Accept: 'onboarding:accept',
	Decline: 'onboarding:decline',
	ConfirmDecline: 'onboarding:decline-confirm',
} as const;

/** Buttons on rules panels posted by the old bot keep working */
export const LEGACY_ACCEPT = 'rules-accept';
export const LEGACY_DECLINE = 'rules-decline';

export function rulesPanel(config: OnboardingConfig): MessageCreateOptions {
	const container = new ContainerBuilder()
		.setAccentColor(0xff3cac)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.rulesContent))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(OnboardingButton.Accept)
					.setStyle(ButtonStyle.Success)
					.setLabel('Accept')
					.setEmoji('👍'),
				new ButtonBuilder()
					.setCustomId(OnboardingButton.Decline)
					.setStyle(ButtonStyle.Danger)
					.setLabel('Decline')
					.setEmoji('👎'),
			),
		);

	return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function nationalityPanel(text: string): MessageCreateOptions {
	const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
