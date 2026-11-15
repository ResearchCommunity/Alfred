import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { Notifier } from '../notifier.ts';
import { TopicUpdater } from '../topic.ts';

/** Starts the notifier (catches up on missed moments) and the channel topic once Discord is reachable */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class ChastityReadyListener extends Listener<typeof Events.ClientReady> {
	public override run(client: Client<true>): void {
		const { chastity: game, config, db, pino } = this.container;
		if (!game || !config.chastity) return;
		const logger = pino.child({ feature: 'chastity' });
		new Notifier(db, game, config.chastity, client, logger).start();
		new TopicUpdater(game, client, config.chastity.channelId, logger).start();
	}
}
