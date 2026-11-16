import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, PermissionFlagsBits, userMention } from 'discord.js';
import { kickUnverified } from '../kick.ts';

const MAX_LISTED = 40;

/** Runs the nightly kick of unverified members right now, or shows who it would kick */
@ApplyOptions<Command.Options>({
	name: 'kick-unverified',
	description: 'Kick members who still have no roles a while after joining',
})
export class KickUnverifiedCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		const autoKick = this.container.config.autoKick;
		if (!autoKick) return;
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(`Kick members who have had no roles for ${autoKick.afterDays}+ days since joining`)
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.setContexts(InteractionContextType.Guild)
				.addBooleanOption((o) => o.setName('preview').setDescription('Only show who would be kicked')),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		const autoKick = this.container.config.autoKick;
		if (!autoKick) return;
		const preview = interaction.options.getBoolean('preview') ?? false;
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const { memberIds, failed } = await kickUnverified(interaction.guild, autoKick.afterDays, preview);
		const listed = memberIds.slice(0, MAX_LISTED).map((id) => userMention(id));
		const more = memberIds.length > MAX_LISTED ? ` and ${memberIds.length - MAX_LISTED} more` : '';
		const who = memberIds.length > 0 ? `: ${listed.join(' ')}${more}` : '.';
		const head = preview
			? `${memberIds.length} member(s) would be kicked${who}`
			: `Kicked ${memberIds.length} member(s)${who}`;
		await interaction.editReply({
			content: failed > 0 ? `${head}\n${failed} couldn't be kicked; see the logs.` : head,
			allowedMentions: { parse: [] },
		});
	}
}
