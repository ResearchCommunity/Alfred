import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { AnyThreadChannel } from 'discord.js';
import { isWatched } from '../repository.ts';

@ApplyOptions<Listener.Options>({ event: Events.ThreadUpdate })
export class ThreadwatchUnarchiveListener extends Listener<typeof Events.ThreadUpdate> {
	public override async run(oldThread: AnyThreadChannel, newThread: AnyThreadChannel): Promise<void> {
		if (oldThread.archived || !newThread.archived) return;
		// A moderator locking a thread is a deliberate decision, so don't fight it
		if (newThread.locked) return;
		if (!(await isWatched(this.container.db, newThread.id))) return;

		await newThread.setArchived(false, 'Thread watch');
		this.container.logger.debug(`Unarchived watched thread ${newThread.id}`);
	}
}
