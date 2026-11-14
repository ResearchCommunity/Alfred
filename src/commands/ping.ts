import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

@ApplyOptions<Command.Options>({ description: 'Check whether Alfred is alive' })
export class PingCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
		await interaction.reply({
			content: `Pong! Gateway latency: ${Math.round(this.container.client.ws.ping)} ms`,
			flags: MessageFlags.Ephemeral,
		});
	}
}
