import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import {
	DiscordAPIError,
	type Message,
	MessageFlags,
	MessageReferenceType,
	MessageType,
	RESTJSONErrorCodes,
	messageLink,
} from 'discord.js';
import { cleanMessageContent } from '../content.ts';
import { recordRepost } from '../repository.ts';
import { resolveWebhookTarget, sanitizeWebhookName, webhookPool } from '../webhooks.ts';

const MAX_CONTENT_LENGTH = 2000;

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class LinkCleanerRepostListener extends Listener<typeof Events.MessageCreate> {
	public override async run(message: Message): Promise<void> {
		if (!this.isEligible(message)) return;

		const { content, cleaned } = cleanMessageContent(message.content);
		if (cleaned === 0) return;

		const target = resolveWebhookTarget(message.channel);
		if (!target) return;

		const repostContent = this.withReplyHeader(message, content);
		if (repostContent.length > MAX_CONTENT_LENGTH) return;

		const options = {
			content: repostContent,
			username: sanitizeWebhookName(message.member?.displayName ?? message.author.displayName),
			avatarURL: (message.member ?? message.author).displayAvatarURL({ size: 256 }),
			// The original already pinged whoever it mentioned; the repost must not ping again
			allowedMentions: { parse: [] },
			files: message.attachments.map((attachment) => ({
				attachment: attachment.url,
				name: attachment.name,
				...(attachment.description && { description: attachment.description }),
			})),
			flags: message.flags.bitfield & (MessageFlags.SuppressEmbeds | MessageFlags.SuppressNotifications),
			...(target.threadId && { threadId: target.threadId }),
		};

		// Post first, delete after: if anything fails, the worst case is the uncleaned original
		// staying up, never the member's message vanishing.
		let repost: Message;
		try {
			repost = await (await webhookPool.get(target.channel)).send(options);
		} catch (error) {
			if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownWebhook)) throw error;
			// Someone deleted our webhook; make a new one and try once more
			webhookPool.invalidate(target.channel.id);
			repost = await (await webhookPool.get(target.channel)).send(options);
		}

		try {
			await message.delete();
		} catch (error) {
			// Can't remove the original (missing permission?), so don't leave a duplicate behind
			await repost.delete().catch(() => undefined);
			throw error;
		}

		await recordRepost(this.container.db, repost.id, message.author.id);
		this.container.logger.debug(`Link cleaner: cleaned ${cleaned} link(s)`);
	}

	private isEligible(message: Message): message is Message<true> {
		if (!message.inGuild() || message.author.bot || message.webhookId !== null) return false;
		if (message.type !== MessageType.Default && message.type !== MessageType.Reply) return false;
		// Things a webhook can't reproduce: leave those messages as they are
		if (message.poll || message.stickers.size > 0 || message.flags.has(MessageFlags.IsVoiceMessage)) return false;
		if (message.reference?.type === MessageReferenceType.Forward) return false;

		const { enabled, ignoredChannelIds } = this.container.config.linkCleaner;
		if (!enabled) return false;
		const channelIds = [message.channelId, message.channel.isThread() ? message.channel.parentId : null];
		return !channelIds.some((id) => id !== null && ignoredChannelIds.includes(id));
	}

	/** Webhooks can't send real replies, so a reply becomes a small header pointing at the original */
	private withReplyHeader(message: Message<true>, content: string): string {
		const reference = message.reference;
		if (message.type !== MessageType.Reply || !reference?.messageId) return content;

		const link = messageLink(reference.channelId, reference.messageId, message.guildId);
		const repliedUser = message.mentions.repliedUser;
		return `-# ↪ Reply to ${repliedUser ? `<@${repliedUser.id}> ` : ''}${link}\n${content}`;
	}
}
