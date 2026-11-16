import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { kickUnverified, nextMidnight, TIME_ZONE } from '../kick.ts';

/**
 * Kicks unverified members every night at midnight. A night the bot was down is simply
 * skipped; the next one catches up, since it looks at join dates, not at what changed.
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class AutoKickScheduleListener extends Listener<typeof Events.ClientReady> {
	public override run(client: Client<true>): void {
		if (!this.container.config.autoKick) return;
		this.schedule(client);
	}

	private schedule(client: Client<true>): void {
		// From a minute ahead, so a timer that fires a hair early can't pick the same midnight again
		const at = nextMidnight(new Date(Date.now() + 60_000), TIME_ZONE);
		setTimeout(() => void this.tick(client), at.getTime() - Date.now()).unref();
	}

	private async tick(client: Client<true>): Promise<void> {
		const { config, logger } = this.container;
		try {
			const guild = await client.guilds.fetch(config.guildId);
			if (config.autoKick) await kickUnverified(guild, config.autoKick.afterDays);
		} catch (error) {
			logger.error('Auto-kick: nightly run failed', error);
		}
		this.schedule(client);
	}
}
