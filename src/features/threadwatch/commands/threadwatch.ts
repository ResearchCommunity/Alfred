import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, PermissionFlagsBits, ThreadAutoArchiveDuration } from 'discord.js';
import { toggleWatch } from '../repository.ts';

@ApplyOptions<Command.Options>({
	name: 'threadwatch',
	description: 'Toggle whether Alfred keeps this thread from being archived',
})
export class ThreadwatchCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
				.setContexts(InteractionContextType.Guild),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
		const thread = interaction.channel;
		if (!thread?.isThread()) {
			await interaction.reply({ content: 'This only works inside a thread.', flags: MessageFlags.Ephemeral });
			return;
		}

		const result = await toggleWatch(this.container.db, thread.id, interaction.user.id);

		// Longest auto-archive window, so Alfred has to step in as rarely as possible
		if (result === 'watched' && thread.autoArchiveDuration !== ThreadAutoArchiveDuration.OneWeek) {
			await thread.setAutoArchiveDuration(ThreadAutoArchiveDuration.OneWeek, 'Thread watch').catch((error) => {
				this.container.logger.warn('Could not raise auto-archive duration', error);
			});
		}

		await interaction.reply({
			content:
				result === 'watched'
					? '👀 Watching this thread. I will unarchive it whenever it gets auto-archived.'
					: 'Stopped watching this thread.',
			flags: MessageFlags.Ephemeral,
		});
	}
}
