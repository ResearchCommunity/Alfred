import { basename, extname } from 'node:path';
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	type MessageCreateOptions,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from 'discord.js';
import type { Config } from '../../lib/config.ts';
import { rulesMarkdown } from './rules-text.ts';

export type OnboardingConfig = NonNullable<Config['onboarding']>;

export const OnboardingButton = {
	Accept: 'onboarding:accept',
	Decline: 'onboarding:decline',
	ConfirmDecline: 'onboarding:decline-confirm',
} as const;

/** Buttons on rules panels posted by the old bot keep working */
export const LEGACY_ACCEPT = 'rules-accept';
export const LEGACY_DECLINE = 'rules-decline';

const display = (content: string) => new TextDisplayBuilder().setContent(content);
const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large);

/** One container: header with thumbnail, the headline rule, the rest, small print, buttons */
export function rulesPanel(config: OnboardingConfig): MessageCreateOptions {
	const { rules } = config;
	const text = rulesMarkdown(rules);
	const container = new ContainerBuilder().setAccentColor(0xff3cac);

	// A local thumbnail is uploaded with the message, so Discord keeps its own copy
	const files: AttachmentBuilder[] = [];
	let thumbnailUrl: string | null = null;
	if (rules.thumbnail && /^https?:\/\//.test(rules.thumbnail)) {
		thumbnailUrl = rules.thumbnail;
	} else if (rules.thumbnail) {
		const name = `rules-thumbnail${extname(basename(rules.thumbnail))}`;
		files.push(new AttachmentBuilder(rules.thumbnail, { name }));
		thumbnailUrl = `attachment://${name}`;
	}

	// A section needs an accessory, so without a thumbnail the header is plain text
	if (thumbnailUrl) {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(...text.header.map(display))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl)),
		);
	} else {
		container.addTextDisplayComponents(...text.header.map(display));
	}

	container
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(display(text.headline))
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(display(text.list));
	if (text.closing) container.addSeparatorComponents(divider()).addTextDisplayComponents(display(text.closing));
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(OnboardingButton.Accept).setStyle(ButtonStyle.Success).setLabel('Accept'),
			new ButtonBuilder().setCustomId(OnboardingButton.Decline).setStyle(ButtonStyle.Danger).setLabel('Decline'),
		),
	);

	return {
		components: [container],
		files,
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { parse: [] },
	};
}

export function nationalityPanel(text: string): MessageCreateOptions {
	const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
