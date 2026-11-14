import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { type WebhookChannel, webhookPool } from '../webhooks.ts';

/**
 * Webhooks in a channel changed (possibly ours got deleted or edited).
 * Drop the cached one; the next repost re-fetches or recreates it.
 */
@ApplyOptions<Listener.Options>({ event: Events.WebhooksUpdate })
export class LinkCleanerWebhooksUpdateListener extends Listener<typeof Events.WebhooksUpdate> {
	public override run(channel: WebhookChannel): void {
		webhookPool.invalidate(channel.id);
	}
}
