import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { type Client, GuildNSFWLevel } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
	public override run(client: Client<true>): void {
		const { guildId } = this.container.config;
		this.container.logger.info(`Logged in as ${client.user.tag}`);

		// Catch the classic misconfiguration early instead of failing on the first command
		const guild = client.guilds.cache.get(guildId);
		if (!guild) {
			this.container.logger.warn(`Configured guild ${guildId} not found — is the bot invited to it?`);
		} else if (guild.nsfwLevel !== GuildNSFWLevel.AgeRestricted) {
			this.container.logger.warn(
				`Guild ${guildId} is not marked age-restricted. Discord's age check is the server's real age barrier`,
			);
		}
	}
}
