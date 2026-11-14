import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { pruneEmptyRoles } from '../roles.ts';

/**
 * Fills the member cache (empty-role detection relies on `role.members`), then
 * removes roles that emptied while Alfred was offline and mappings to deleted roles.
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class NationalitySweepListener extends Listener<typeof Events.ClientReady> {
	public override async run(client: Client<true>): Promise<void> {
		const guild = client.guilds.cache.get(this.container.config.guildId);
		if (!guild) return;

		await guild.members.fetch();
		const pruned = await pruneEmptyRoles(guild);
		if (pruned > 0) this.container.logger.info(`Nationality: pruned ${pruned} empty or missing role(s)`);
	}
}
