import type { Client } from 'discord.js';
import type { Logger } from 'pino';
import type { Game } from './game.ts';
import { channelTopic } from './messages.ts';

/** Discord allows two topic edits per 10 minutes per channel; this stays clearly below */
const MIN_INTERVAL_MS = 6 * 60_000;
/** The multiplier drifts down as time passes, which no live timestamp can show */
const REFRESH_MS = 30 * 60_000;

/**
 * Keeps the game channel's topic current. Changes only mark it out of date; at most one edit
 * every 6 minutes writes whatever the state is by then, so a burst of activity (say, six spins
 * in a row) costs at most two edits. Unchanged text is never written.
 */
export class TopicUpdater {
	private lastEditAt = 0;
	private pending: NodeJS.Timeout | undefined;
	private refresh: NodeJS.Timeout | undefined;
	/** Rewrites the topic when a happy hour ends, which no action announces */
	private happyHourEnd: NodeJS.Timeout | undefined;

	public constructor(
		private readonly game: Game,
		private readonly client: Client,
		private readonly channelId: string,
		private readonly logger: Logger,
	) {}

	public start(): void {
		this.game.onChange(() => this.markDirty());
		this.refresh = setInterval(() => this.markDirty(), REFRESH_MS);
		this.markDirty();
	}

	public stop(): void {
		clearTimeout(this.pending);
		clearInterval(this.refresh);
		clearTimeout(this.happyHourEnd);
	}

	private markDirty(): void {
		if (this.pending) return; // an edit is already scheduled and will pick up this change too
		const wait = Math.max(0, this.lastEditAt + MIN_INTERVAL_MS - Date.now());
		this.pending = setTimeout(() => {
			this.pending = undefined;
			void this.flush().catch((error: unknown) => {
				this.logger.warn({ err: error }, 'Could not update the chastity channel topic');
			});
		}, wait);
	}

	private async flush(): Promise<void> {
		const channel = await this.client.channels.fetch(this.channelId);
		if (!channel || !('setTopic' in channel)) return;

		const view = await this.game.info(this.game.ownerId);
		clearTimeout(this.happyHourEnd);
		if (view.started && view.happyHourUntil) {
			const wait = view.happyHourUntil.getTime() - Date.now() + 1000;
			this.happyHourEnd = setTimeout(() => this.markDirty(), Math.max(0, wait));
		}

		const topic = channelTopic(view);
		if (channel.topic === topic) return;
		this.lastEditAt = Date.now();
		await channel.setTopic(topic);
	}
}
