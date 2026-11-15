import type { Db } from 'mongodb';
import type { ChastityConfig } from '../../lib/config.ts';
import {
	appendEvent,
	chargeWallet,
	createState,
	type GameEvent,
	loadState,
	loadWallet,
	refundWallet,
	resetGame,
	saveState,
	type StoredState,
	validateEvent,
} from './repository.ts';
import {
	addPriceSeconds,
	addTimer,
	adjustBank,
	emergencyOff,
	emergencyOn,
	type GameState,
	GameRuleError,
	type Mode,
	multiplier,
	type Notified,
	type Projection,
	project,
	reanchor,
	relock,
	removePriceSeconds,
	removeTimer,
	SECONDS,
	activeHappyHour,
	startHappyHour,
	unlock,
} from './time.ts';
import { newWallet, type Wallet, walletBalance } from './wallet.ts';
import { type Roll, roll } from './wheel.ts';

export type ActionResult =
	| {
			ok: true;
			event: GameEvent;
			mode: Mode;
			projection: Projection;
			multiplier: number;
			/** When the running happy hour ends, if one is running */
			happyHourUntil: Date | null;
			/** The member's balance after paying; null for owner actions */
			balanceSeconds: number | null;
			roll?: Roll;
	  }
	| { ok: false; reason: string; balanceSeconds?: number };

export type SendResult =
	| { ok: true; event: GameEvent; balanceSeconds: number; recipientBalanceSeconds: number }
	| { ok: false; reason: string; balanceSeconds?: number };

export type InfoView =
	| { started: false }
	| {
			started: true;
			mode: Mode;
			projection: Projection;
			multiplier: number;
			/** When the running happy hour ends (adding costs half until then) */
			happyHourUntil: Date | null;
			/** When the timer actually ran out (meaningful while it's at zero) */
			timerRanOutAt: Date | null;
			/** The caller's balance; null for the owner, who has none */
			balanceSeconds: number | null;
	  };

/** What a member action would do to the game, worked out from the state it was read from */
interface Plan {
	priceSeconds: number;
	/** Paid out to the member (wheel refund or windfall); may push them past the cap */
	creditSeconds: number;
	next: GameState;
	event: Omit<GameEvent, 'at' | 'actorId' | 'costSeconds' | 'creditSeconds'>;
}

const MAX_ATTEMPTS = 5;
const BUSY = 'A lot is happening at once. Please try again.';
const NOT_STARTED = "The game hasn't started yet.";

const noEvent = {
	timerDeltaSeconds: 0,
	bankDeltaSeconds: 0,
	multiplier: null,
	reason: null,
	tier: null,
	effect: null,
	outcome: null,
	creditSeconds: 0,
	targetId: null,
} as const;

/**
 * A notification is due again once things change back: the timer leaves zero, or the bank
 * holds time again while unlocked.
 */
function notifiedAfter(stored: StoredState, next: GameState): Notified {
	return {
		timerZeroAt: next.timerSeconds > 0 ? null : stored.notified.timerZeroAt,
		bankDryAt: next.mode === 'unlocked' && next.bankSeconds > 0 ? null : stored.notified.bankDryAt,
	};
}

export class Game {
	private readonly listeners: Array<() => void> = [];

	public constructor(
		private readonly db: Db,
		private readonly config: ChastityConfig,
		private readonly now: () => Date = () => new Date(),
		private readonly random: () => number = Math.random,
	) {}

	/** Called after every change; the notifier reschedules from here */
	public onChange(listener: () => void): void {
		this.listeners.push(listener);
	}

	public get ownerId(): string {
		return this.config.ownerId;
	}

	public async info(userId: string): Promise<InfoView> {
		const stored = this.withRules(await loadState(this.db));
		if (!stored) return { started: false };
		const now = this.now();
		const projection = project(stored, now);
		return {
			started: true,
			mode: stored.mode,
			projection,
			multiplier: this.price(stored, projection.timerSeconds, now),
			happyHourUntil: activeHappyHour(stored, now),
			// The recorded moment; the projection's own resets with every write while at zero
			timerRanOutAt: stored.notified.timerZeroAt ?? projection.timerZeroAt,
			balanceSeconds: userId === this.config.ownerId ? null : await this.balance(userId, now),
		};
	}

	public memberAdd(userId: string, hours: number, reason: string | null): Promise<ActionResult> {
		return this.memberAction(userId, (stored, now) => {
			const factor = this.price(stored, project(stored, now).timerSeconds, now);
			const seconds = hours * SECONDS.HOUR;
			return {
				priceSeconds: addPriceSeconds(hours, factor),
				creditSeconds: 0,
				next: addTimer(stored, now, seconds),
				event: {
					...noEvent,
					type: 'add',
					source: 'member',
					timerDeltaSeconds: seconds,
					multiplier: factor,
					reason,
				},
			};
		});
	}

	public memberRemove(userId: string, hours: number, reason: string | null): Promise<ActionResult> {
		return this.memberAction(userId, (stored, now) => {
			const { state, removedSeconds } = removeTimer(stored, now, hours * SECONDS.HOUR);
			if (removedSeconds === 0) return 'The timer is already at zero.';
			return {
				priceSeconds: removePriceSeconds(removedSeconds, this.config.removeCostRatio),
				creditSeconds: 0,
				next: state,
				event: { ...noEvent, type: 'remove', source: 'member', timerDeltaSeconds: -removedSeconds, reason },
			};
		});
	}

	public memberSpin(userId: string): Promise<ActionResult> {
		// Rolled once, outside the retry loop: a lost race must not mean a second chance
		const outcome = roll(this.config.wheel, this.random);
		return this.memberAction(
			userId,
			(stored, now) => {
				// The price is set before the outcome applies, at the multiplier everyone sees right now
				const factor = this.price(stored, project(stored, now).timerSeconds, now);
				const priceSeconds = addPriceSeconds(this.config.spinCostHours, factor);
				const { next, timerDeltaSeconds, bankDeltaSeconds } = applyRoll(stored, now, outcome);
				return {
					priceSeconds,
					creditSeconds:
						outcome.effect === 'refund'
							? priceSeconds
							: outcome.effect === 'windfall'
								? Math.round(priceSeconds * (outcome.times ?? 0))
								: 0,
					next,
					event: {
						...noEvent,
						type: 'spin',
						source: 'wheel',
						timerDeltaSeconds,
						bankDeltaSeconds,
						multiplier: factor,
						tier: outcome.tier,
						effect: outcome.effect,
						outcome: outcome.name,
					},
				};
			},
			outcome,
		);
	}

	/**
	 * Gives currency to another member. The recipient may go past the cap; the sender pays
	 * exactly what's sent. Doesn't touch the game, so it works whatever state the game is in.
	 */
	public async memberSend(fromId: string, toId: string, seconds: number, reason: string | null): Promise<SendResult> {
		if (fromId === this.config.ownerId) return { ok: false, reason: "You're the one in the cage." };
		if (toId === this.config.ownerId) return { ok: false, reason: "The owner can't hold any currency." };
		if (toId === fromId) return { ok: false, reason: "You can't send to yourself." };
		if (seconds <= 0) return { ok: false, reason: 'Send at least a minute.' };

		const draft = validateEvent({
			...noEvent,
			at: this.now(),
			actorId: fromId,
			targetId: toId,
			type: 'send',
			source: 'member',
			costSeconds: seconds,
			reason,
		});

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const now = this.now();
			// oxlint-disable-next-line no-await-in-loop -- each attempt re-reads what the last one lost to
			const from = await loadWallet(this.db, fromId);
			const fromBalance = this.walletNow(from, now);
			if (fromBalance < seconds)
				return { ok: false, reason: "You can't afford that.", balanceSeconds: fromBalance };
			// oxlint-disable-next-line no-await-in-loop
			if (!(await chargeWallet(this.db, fromId, from, fromBalance - seconds, now))) continue;

			// oxlint-disable-next-line no-await-in-loop
			const toBalance = await this.credit(toId, seconds);
			if (toBalance === null) {
				// oxlint-disable-next-line no-await-in-loop
				await refundWallet(this.db, fromId, seconds);
				return { ok: false, reason: BUSY };
			}

			const event: GameEvent = { ...draft, at: now };
			// oxlint-disable-next-line no-await-in-loop
			await appendEvent(this.db, event);
			return { ok: true, event, balanceSeconds: fromBalance - seconds, recipientBalanceSeconds: toBalance };
		}
		return { ok: false, reason: BUSY };
	}

	public async start(userId: string, timerSeconds: number): Promise<ActionResult> {
		if (userId !== this.config.ownerId) return { ok: false, reason: 'Only the owner can do that.' };
		const now = this.now();
		const state: GameState = {
			mode: 'locked',
			resumeMode: null,
			anchorAt: now,
			timerSeconds,
			bankSeconds: 0,
			happyHourUntil: null,
		};
		if (!(await createState(this.db, state))) return { ok: false, reason: 'The game is already running.' };

		const event: GameEvent = {
			...noEvent,
			at: now,
			actorId: userId,
			type: 'start',
			source: 'owner',
			costSeconds: 0,
			timerDeltaSeconds: timerSeconds,
		};
		await appendEvent(this.db, event);
		this.emit();
		return this.result(event, state, now, null);
	}

	/** Sets the timer and/or the unlock bank to exact values, keeping the mode */
	public set(userId: string, values: { timerSeconds?: number; bankSeconds?: number }): Promise<ActionResult> {
		return this.ownerAction(userId, 'set', (state, now) => {
			const next = reanchor(state, now);
			return {
				...next,
				timerSeconds: values.timerSeconds ?? next.timerSeconds,
				bankSeconds: values.bankSeconds ?? next.bankSeconds,
			};
		});
	}

	/** Ends the game so it can be started again; `everything` also clears balances and history */
	public async reset(userId: string, everything: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
		if (userId !== this.config.ownerId) return { ok: false, reason: 'Only the owner can do that.' };
		if (!(await resetGame(this.db, everything))) return { ok: false, reason: NOT_STARTED };
		if (!everything) {
			await appendEvent(this.db, {
				...noEvent,
				at: this.now(),
				actorId: userId,
				type: 'reset',
				source: 'owner',
				costSeconds: 0,
			});
		}
		this.emit();
		return { ok: true };
	}

	public unlock(userId: string): Promise<ActionResult> {
		return this.ownerAction(userId, 'unlock', unlock);
	}

	public relock(userId: string): Promise<ActionResult> {
		return this.ownerAction(userId, 'relock', relock);
	}

	public emergency(userId: string, on: boolean): Promise<ActionResult> {
		return this.ownerAction(userId, on ? 'emergency-on' : 'emergency-off', on ? emergencyOn : emergencyOff);
	}

	private async balance(userId: string, now: Date): Promise<number> {
		return this.walletNow(await loadWallet(this.db, userId), now);
	}

	/** A wallet's balance right now; no wallet yet means the starting balance */
	private walletNow(wallet: Wallet | null, now: Date): number {
		return wallet
			? walletBalance(wallet, now, this.config)
			: newWallet(now, this.config.startingBalanceHours).balanceSeconds;
	}

	/** Adds to a member's wallet (past the cap, keeping what they'd accrued); null if it kept losing races */
	private async credit(userId: string, seconds: number): Promise<number | null> {
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const now = this.now();
			// oxlint-disable-next-line no-await-in-loop -- each attempt re-reads what the last one lost to
			const wallet = await loadWallet(this.db, userId);
			const balance = this.walletNow(wallet, now) + seconds;
			// oxlint-disable-next-line no-await-in-loop
			if (await chargeWallet(this.db, userId, wallet, balance, now)) return balance;
		}
		return null;
	}

	private async memberAction(
		userId: string,
		plan: (stored: StoredState, now: Date) => Plan | string,
		outcome?: Roll,
	): Promise<ActionResult> {
		if (userId === this.config.ownerId) return { ok: false, reason: "You're the one in the cage." };

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const now = this.now();
			// oxlint-disable-next-line no-await-in-loop -- each attempt re-reads what the last one lost to
			const stored = this.withRules(await loadState(this.db));
			if (!stored) return { ok: false, reason: NOT_STARTED };
			if (stored.mode === 'emergency') return { ok: false, reason: 'The game is paused.' };

			const planned = plan(stored, now);
			if (typeof planned === 'string') return { ok: false, reason: planned };

			// oxlint-disable-next-line no-await-in-loop
			const wallet = await loadWallet(this.db, userId);
			const balance = this.walletNow(wallet, now);
			if (balance < planned.priceSeconds) {
				return { ok: false, reason: "You can't afford that.", balanceSeconds: balance };
			}

			// Built and checked before any write: nothing may fail once money has moved
			const event = validateEvent({
				...planned.event,
				at: now,
				actorId: userId,
				costSeconds: planned.priceSeconds,
				creditSeconds: planned.creditSeconds,
			});

			const after = balance - planned.priceSeconds + planned.creditSeconds;
			// oxlint-disable-next-line no-await-in-loop
			if (!(await chargeWallet(this.db, userId, wallet, after, now))) continue;

			// oxlint-disable-next-line no-await-in-loop
			if (!(await saveState(this.db, stored.version, planned.next, notifiedAfter(stored, planned.next)))) {
				// Someone else changed the game first: give the money back and price it again
				// oxlint-disable-next-line no-await-in-loop
				await refundWallet(this.db, userId, planned.priceSeconds - planned.creditSeconds);
				continue;
			}

			// oxlint-disable-next-line no-await-in-loop
			await appendEvent(this.db, event);
			this.emit();
			return { ...this.result(event, planned.next, now, after), ...(outcome && { roll: outcome }) };
		}
		return { ok: false, reason: BUSY };
	}

	private async ownerAction(
		userId: string,
		type: GameEvent['type'],
		transition: (state: GameState, now: Date) => GameState,
	): Promise<ActionResult> {
		if (userId !== this.config.ownerId) return { ok: false, reason: 'Only the owner can do that.' };

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const now = this.now();
			// oxlint-disable-next-line no-await-in-loop -- each attempt re-reads what the last one lost to
			const stored = this.withRules(await loadState(this.db));
			if (!stored) return { ok: false, reason: NOT_STARTED };

			let next: GameState;
			try {
				next = transition(stored, now);
			} catch (error) {
				if (error instanceof GameRuleError) return { ok: false, reason: error.message };
				throw error;
			}
			// oxlint-disable-next-line no-await-in-loop
			if (!(await saveState(this.db, stored.version, next, notifiedAfter(stored, next)))) continue;

			// What changed, against the state as it stood at this moment
			const before = reanchor(stored, now);
			const event: GameEvent = {
				...noEvent,
				at: now,
				actorId: userId,
				type,
				source: 'owner',
				costSeconds: 0,
				timerDeltaSeconds: next.timerSeconds - before.timerSeconds,
				bankDeltaSeconds: next.bankSeconds - before.bankSeconds,
			};
			// oxlint-disable-next-line no-await-in-loop
			await appendEvent(this.db, event);
			this.emit();
			return this.result(event, next, now, null);
		}
		return { ok: false, reason: BUSY };
	}

	private result(event: GameEvent, state: GameState, now: Date, balanceSeconds: number | null): ActionResult {
		const projection = project(state, now);
		return {
			ok: true,
			event,
			mode: state.mode,
			projection,
			multiplier: this.price(state, projection.timerSeconds, now),
			happyHourUntil: activeHappyHour(state, now),
			balanceSeconds,
		};
	}

	/** Stored state plus the rules that live in config (the bank cap) */
	private withRules(stored: StoredState | null): (StoredState & { bankCapSeconds: number }) | null {
		return stored && { ...stored, bankCapSeconds: this.config.bankCapHours * SECONDS.HOUR };
	}

	/** The current multiplier for adding time, happy hour included */
	private price(state: GameState, timerSeconds: number, now: Date): number {
		return multiplier(timerSeconds, this.config.multiplierDoublingDays, activeHappyHour(state, now) !== null);
	}

	/** Tells listeners the game changed without an action (the notifier, when a moment passes) */
	public changed(): void {
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

/** A wheel outcome applied to the game; deltas are what actually changed (after clamping) */
export function applyRoll(
	state: GameState,
	now: Date,
	outcome: Roll,
): { next: GameState; timerDeltaSeconds: number; bankDeltaSeconds: number } {
	const seconds = outcome.minutes * 60;
	const before = reanchor(state, now);
	let next: GameState;
	if (outcome.effect === 'timer' || outcome.effect === 'refund') {
		next = seconds >= 0 ? addTimer(before, now, seconds) : removeTimer(before, now, -seconds).state;
	} else if (outcome.effect === 'happyHour') {
		next = startHappyHour(before, now, seconds);
	} else if (outcome.effect === 'bankDrain') {
		next = adjustBank(before, now, -seconds);
	} else if (outcome.effect === 'heist') {
		// Takes what the bank has, but the timer always gets the full amount
		next = addTimer(adjustBank(before, now, -seconds), now, seconds);
	} else if (outcome.effect === 'bankBonus') {
		next = adjustBank(before, now, seconds);
	} else {
		// windfall: the payout is the spinner's, the game itself doesn't change
		next = before;
	}
	return {
		next,
		timerDeltaSeconds: next.timerSeconds - before.timerSeconds,
		bankDeltaSeconds: next.bankSeconds - before.bankSeconds,
	};
}
