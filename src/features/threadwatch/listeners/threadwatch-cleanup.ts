import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { AnyThreadChannel } from 'discord.js';
import { unwatch } from '../repository.ts';

@ApplyOptions<Listener.Options>({ event: Events.ThreadDelete })
export class ThreadwatchCleanupListener extends Listener<typeof Events.ThreadDelete> {
	public override async run(thread: AnyThreadChannel): Promise<void> {
		await unwatch(this.container.db, thread.id);
	}
}
