import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { findRepost, forgetRepost } from '../repository.ts';

/**
 * Webhook reposts don't belong to the member anymore, so Discord's own delete button
 * doesn't work for them. This gives them back the ability to remove their message.
 */
@ApplyOptions<Command.Options>({ name: 'Delete my message' })
export class LinkCleanerDeleteCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerContextMenuCommand((builder) =>
			builder
				.setName(this.name)
				.setType(ApplicationCommandType.Message)
				.setContexts(InteractionContextType.Guild),
		);
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction): Promise<void> {
		if (!interaction.isMessageContextMenuCommand()) return;
		const message = interaction.targetMessage;

		const record = await findRepost(this.container.db, message.id);
		const isAuthor = record?.authorId === interaction.user.id;
		const isModerator = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) === true;

		if (!record || (!isAuthor && !isModerator)) {
			await interaction.reply({
				content: 'This only works on your own messages that I reposted after cleaning their links.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await message.delete();
		await forgetRepost(this.container.db, message.id);
		await interaction.reply({ content: '🗑️ Deleted.', flags: MessageFlags.Ephemeral });
	}
}
