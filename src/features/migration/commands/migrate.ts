import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	DiscordAPIError,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
} from 'discord.js';
import { importMigration, parseMigrationFile } from '../migration.ts';

const MAX_FILE_SIZE = 1024 * 1024;

/** Imports the old bot's `/migrate` export: nationality roles and watched threads */
@ApplyOptions<Command.Options>({ name: 'migrate', description: "Import the old Alfred's exported data" })
export class MigrateCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.setContexts(InteractionContextType.Guild)
				.addAttachmentOption((option) =>
					option
						.setName('file')
						.setDescription("alfred-migration.json from the old bot's /migrate")
						.setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const file = interaction.options.getAttachment('file', true);
		if (file.size > MAX_FILE_SIZE) {
			await interaction.editReply('That file is far too big to be a migration file.');
			return;
		}
		const response = await fetch(file.url);
		if (!response.ok) {
			await interaction.editReply("I couldn't download that file. Please try again.");
			return;
		}

		const data = parseMigrationFile(await response.text(), interaction.guildId);
		if (typeof data === 'string') {
			await interaction.editReply(data);
			return;
		}

		const { guild } = interaction;
		const report = await importMigration(this.container.db, data, {
			userId: interaction.user.id,
			roleExists: (roleId) => guild.roles.cache.has(roleId),
			threadExists: async (threadId) => {
				try {
					const channel = await this.container.client.channels.fetch(threadId);
					return channel?.isThread() === true && channel.guildId === guild.id;
				} catch (error) {
					if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel)
						return false;
					throw error;
				}
			},
		});

		const { roles, threads } = report;
		await interaction.editReply(
			[
				`Imported from the export of ${data.exportedAt}:`,
				`- Nationality roles: ${roles.imported} imported, ${roles.skipped} skipped (role or country gone)`,
				`- Watched threads: ${threads.imported} imported, ${threads.alreadyWatched} already watched, ${threads.skipped} skipped (thread gone)`,
				'-# Safe to run again: anything already imported stays as it is.',
			].join('\n'),
		);
	}
}
