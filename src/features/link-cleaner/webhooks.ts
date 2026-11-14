import { container } from '@sapphire/framework';
import {
	type Channel,
	ChannelType,
	type ClientEvents,
	type GuildTextBasedChannel,
	type Webhook,
	type WebhookType,
} from 'discord.js';

/** Channel types that can own webhooks (threads post through their parent's webhook) */
export type WebhookChannel = ClientEvents['webhooksUpdate'][0];

export interface WebhookTarget {
	channel: WebhookChannel;
	threadId?: string;
}

const WEBHOOK_CHANNEL_TYPES = new Set<ChannelType>([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildVoice,
	ChannelType.GuildForum,
	ChannelType.GuildMedia,
]);

function isWebhookChannel(channel: Channel | null): channel is WebhookChannel {
	return channel !== null && WEBHOOK_CHANNEL_TYPES.has(channel.type);
}

export function resolveWebhookTarget(channel: GuildTextBasedChannel): WebhookTarget | null {
	if (channel.isThread()) {
		return isWebhookChannel(channel.parent) ? { channel: channel.parent, threadId: channel.id } : null;
	}
	return isWebhookChannel(channel) ? { channel } : null;
}

/**
 * One reusable Alfred-owned webhook per channel, created on first use and cached.
 * Channels allow 15 webhooks at most, so creating one per message isn't an option.
 */
export class WebhookPool {
	readonly #cache = new Map<string, Webhook<WebhookType.Incoming>>();

	async get(channel: WebhookChannel): Promise<Webhook<WebhookType.Incoming>> {
		const cached = this.#cache.get(channel.id);
		if (cached) return cached;

		const botUser = container.client.user;
		const existing = (await channel.fetchWebhooks()).find(
			(webhook) => webhook.isIncoming() && webhook.owner?.id === botUser?.id && webhook.token !== null,
		);
		const webhook =
			existing?.isIncoming() === true
				? existing
				: await channel.createWebhook({
						name: 'Alfred',
						avatar: botUser?.displayAvatarURL() ?? null,
						reason: 'Link cleaner reposts',
					});

		this.#cache.set(channel.id, webhook);
		return webhook;
	}

	invalidate(channelId: string): void {
		this.#cache.delete(channelId);
	}
}

/** Shared by the repost listener and the webhooksUpdate invalidation */
export const webhookPool = new WebhookPool();

/** Webhook usernames can't contain "discord" or "clyde" and are capped at 80 characters */
export function sanitizeWebhookName(name: string): string {
	const sanitized = name
		.replace(/discord/gi, (match) => match.replace(/o/i, '0'))
		.replace(/clyde/gi, (match) => match.replace(/e/i, '3'))
		.trim()
		.slice(0, 80);
	return sanitized || 'Member';
}
