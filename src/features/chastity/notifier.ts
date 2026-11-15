import type { Client, MessageCreateOptions } from 'discord.js';
import type { Db } from 'mongodb';
import type { Logger } from 'pino';
import type { ChastityConfig } from '../../lib/config.ts';
import type { Game } from './game.ts';
import { momentMessages } from './messages.ts';
import { appendEvent, loadState, saveState } from './repository.ts';
import { nextMoment } from './time.ts';

/** setTimeout can't wait longer than this; longer waits just check again then */
const MAX_DELAY = 2 ** 31 - 1;
/** After a failed check (database or Discord hiccup), try again this soon */
const RETRY_MS = 60_000;

/** DMs the owner; a closed DM inbox is logged, not fatal */
export async function notifyOwner(
	client: Client,
	ownerId: string,
	message: MessageCreateOptions,
	logger: Logger,
): Promise<void> {
	try {
		const owner = await client.users.fetch(ownerId);
		await owner.send(message);
	} catch (error) {
		logger.warn({ err: error }, 'Could not DM the chastity owner');
	}
}

/**
 * Posts when the timer runs out and when the bank runs dry while unlocked. One timeout for
 * the next moment, recomputed after every game change and at boot; a moment that passed
 * while the bot was offline is announced at boot, and only once (it's recorded in the state).
 */
export class Notifier {
	private timeout: NodeJS.Timeout | undefined;
	private checking = false;
	private recheck = false;

	public constructor(
		private readonly db: Db,
		private readonly game: Game,
		private readonly config: ChastityConfig,
		private readonly client: Client,
		private readonly logger: Logger,
		private readonly now: () => Date = () => new Date(),
	) {}

	public start(): void {
		this.game.onChange(() => this.schedule());
		this.schedule();
	}

	public stop(): void {
		clearTimeout(this.timeout);
	}

	private schedule(): void {
		clearTimeout(this.timeout);
		void this.check().catch((error: unknown) => {
			this.logger.error({ err: error }, 'Chastity notifier failed, retrying in a minute');
			this.arm(RETRY_MS);
		});
	}

	private arm(delay: number): void {
		clearTimeout(this.timeout);
		this.timeout = setTimeout(() => this.schedule(), Math.min(delay, MAX_DELAY));
	}

	private async check(): Promise<void> {
		// One check at a time; a change during a check triggers one more afterwards
		if (this.checking) {
			this.recheck = true;
			return;
		}
		this.checking = true;
		try {
			do {
				this.recheck = false;
				// oxlint-disable-next-line no-await-in-loop -- sequential by design
				await this.checkOnce();
			} while (this.recheck);
		} finally {
			this.checking = false;
		}
	}

	private async checkOnce(): Promise<void> {
		const stored = await loadState(this.db);
		if (!stored) return;
		const now = this.now();
		const moment = nextMoment(stored, stored.notified, now);
		if (!moment) return;

		const delay = moment.at.getTime() - now.getTime();
		if (delay > 0) {
			this.arm(delay);
			return;
		}

		// Record it first: if two checks race, only the one whose write wins announces it
		const notified = {
			...stored.notified,
			[moment.kind === 'timer-zero' ? 'timerZeroAt' : 'bankDryAt']: moment.at,
		};
		if (!(await saveState(this.db, stored.version, stored, notified))) {
			this.recheck = true;
			return;
		}

		await appendEvent(this.db, {
			at: moment.at,
			actorId: null,
			type: moment.kind,
			source: 'system',
			costSeconds: 0,
			timerDeltaSeconds: 0,
			bankDeltaSeconds: 0,
			multiplier: null,
			reason: null,
			tier: null,
			effect: null,
			outcome: null,
			creditSeconds: 0,
			targetId: null,
		});

		// The DM matters most: a failed channel post (missing permission, Discord hiccup) must not stop it
		const messages = momentMessages(moment.kind, stored.mode, this.config.ownerId);
		try {
			const channel = await this.client.channels.fetch(this.config.channelId);
			if (channel?.isSendable()) await channel.send(messages.channel);
		} catch (error) {
			this.logger.warn({ err: error }, 'Could not post in the chastity channel');
		}
		await notifyOwner(this.client, this.config.ownerId, messages.dm, this.logger);

		// The topic and anything else watching shows the new situation (this also re-runs this check)
		this.game.changed();
		// Another moment may be due right after this one
		this.recheck = true;
	}
}
