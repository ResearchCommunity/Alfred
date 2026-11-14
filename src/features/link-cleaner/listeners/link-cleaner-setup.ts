import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ensureIndexes } from '../repository.ts';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class LinkCleanerSetupListener extends Listener<typeof Events.ClientReady> {
	public override async run(): Promise<void> {
		await ensureIndexes(this.container.db);
	}
}
