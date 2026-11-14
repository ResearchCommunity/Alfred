import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { type Client, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { listWatched, unwatch } from '../repository.ts';

/**
 * Threads archived while Alfred was offline never produce a ThreadUpdate for us,
 * so catch up once on startup. Also forgets threads that no longer exist.
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class ThreadwatchSweepListener extends Listener<typeof Events.ClientReady> {
	public override async run(client: Client<true>): Promise<void> {
		const { db, logger } = this.container;
		let unarchived = 0;

		for (const threadId of await listWatched(db)) {
			try {
				// Sequential on purpose: plays nice with rate limits, and the list is small
				// oxlint-disable-next-line no-await-in-loop
				const channel = await client.channels.fetch(threadId);
				if (!channel?.isThread()) {
					// oxlint-disable-next-line no-await-in-loop
					await unwatch(db, threadId);
				} else if (channel.archived && !channel.locked) {
					// oxlint-disable-next-line no-await-in-loop
					await channel.setArchived(false, 'Thread watch');
					unarchived++;
				}
			} catch (error) {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) {
					// oxlint-disable-next-line no-await-in-loop
					await unwatch(db, threadId);
				} else {
					logger.warn(`Thread watch sweep failed for ${threadId}`, error);
				}
			}
		}

		if (unarchived > 0) logger.info(`Thread watch: unarchived ${unarchived} thread(s) archived during downtime`);
	}
}
