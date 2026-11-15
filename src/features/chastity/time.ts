// Pure time math. Nothing ticks: the stored state is an anchor (values at `anchorAt`), and
// every read projects it to "now". Every change first re-anchors at "now", then edits the
// anchor. That's what makes restarts and downtime lose nothing.
// All durations are integer seconds.

export type Mode = 'locked' | 'unlocked' | 'emergency';

export interface GameState {
	mode: Mode;
	/** The mode to return to when the emergency switch goes off */
	resumeMode: 'locked' | 'unlocked' | null;
	anchorAt: Date;
	timerSeconds: number;
	bankSeconds: number;
	/** Wheel outcome: adding time costs half until then */
	happyHourUntil: Date | null;
	/**
	 * The bank stops growing here (a rule from config, not stored; absent = no cap). A balance
	 * already above it, from a wheel bonus, stays as it is.
	 */
	bankCapSeconds?: number;
}

export interface Projection {
	timerSeconds: number;
	bankSeconds: number;
	/** When the timer reaches (or reached) zero, if it does with things as they are */
	timerZeroAt: Date | null;
	/** When the bank runs (or ran) dry while unlocked */
	bankDryAt: Date | null;
}

/** A rule of the game was broken; the message is meant for the person who tried */
export class GameRuleError extends Error {}

const HOUR = 3600;
const DAY = 24 * HOUR;

const elapsed = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
export const plusSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);
const later = (date: Date, other: Date | null) => (other && other > date ? other : date);

/** The timer counting down from `from` */
function countDown(state: GameState, from: Date, now: Date): { timerSeconds: number; timerZeroAt: Date } {
	return {
		timerSeconds: Math.max(0, state.timerSeconds - elapsed(from, now)),
		timerZeroAt: state.timerSeconds === 0 ? state.anchorAt : plusSeconds(from, state.timerSeconds),
	};
}

export function project(state: GameState, now: Date): Projection {
	const { anchorAt, bankSeconds } = state;

	if (state.mode === 'emergency') {
		return { timerSeconds: state.timerSeconds, bankSeconds, timerZeroAt: null, bankDryAt: null };
	}

	if (state.mode === 'locked') {
		const timer = countDown(state, anchorAt, now);
		// Every second spent at zero goes into the bank, up to the cap
		const cap = state.bankCapSeconds ?? Number.POSITIVE_INFINITY;
		const grown = bankSeconds >= cap ? bankSeconds : Math.min(cap, bankSeconds + elapsed(timer.timerZeroAt, now));
		return { ...timer, bankSeconds: grown, bankDryAt: null };
	}

	// Unlocked: the bank drains in real time; the timer is paused until it's empty, then counts
	// down again (honor system: the owner should have relocked). No bank growth.
	const bankDryAt = plusSeconds(anchorAt, bankSeconds);
	const timer = countDown(state, bankDryAt, now);
	return { ...timer, bankSeconds: Math.max(0, bankSeconds - elapsed(anchorAt, now)), bankDryAt };
}

/** The projected values become the new anchor at `now`; a happy hour that's over is dropped */
export function reanchor(state: GameState, now: Date): GameState {
	const projection = project(state, now);
	return {
		...state,
		// Advance by exactly the whole seconds the projection counted: anchoring at `now` itself
		// would drop the sub-second remainder on every write and slow the timer down over time
		anchorAt: plusSeconds(state.anchorAt, elapsed(state.anchorAt, now)),
		timerSeconds: projection.timerSeconds,
		bankSeconds: projection.bankSeconds,
		happyHourUntil: activeHappyHour(state, now),
	};
}

export function addTimer(state: GameState, now: Date, seconds: number): GameState {
	const next = reanchor(state, now);
	return { ...next, timerSeconds: next.timerSeconds + seconds };
}

/** Removes up to `seconds`; the timer never goes below zero */
export function removeTimer(
	state: GameState,
	now: Date,
	seconds: number,
): { state: GameState; removedSeconds: number } {
	const next = reanchor(state, now);
	const removedSeconds = Math.min(seconds, next.timerSeconds);
	return { state: { ...next, timerSeconds: next.timerSeconds - removedSeconds }, removedSeconds };
}

/** Changes the bank by `seconds` (negative drains), never below zero */
export function adjustBank(state: GameState, now: Date, seconds: number): GameState {
	const next = reanchor(state, now);
	return { ...next, bankSeconds: Math.max(0, next.bankSeconds + seconds) };
}

/** Happy hour: hitting it again during one extends it; it never stacks to a lower price */
export function startHappyHour(state: GameState, now: Date, seconds: number): GameState {
	const next = reanchor(state, now);
	return { ...next, happyHourUntil: later(plusSeconds(now, seconds), next.happyHourUntil) };
}

/** When the running happy hour ends, or null if there's none */
export function activeHappyHour(state: GameState, now: Date): Date | null {
	return state.happyHourUntil && state.happyHourUntil > now ? state.happyHourUntil : null;
}

const PAUSED = 'The game is paused. Turn the emergency switch off first.';

export function unlock(state: GameState, now: Date): GameState {
	const next = reanchor(state, now);
	if (next.mode === 'emergency') throw new GameRuleError(PAUSED);
	if (next.mode === 'unlocked') throw new GameRuleError("You're already unlocked.");
	if (next.bankSeconds <= 0) throw new GameRuleError('Your unlock bank is empty.');
	return { ...next, mode: 'unlocked' };
}

export function relock(state: GameState, now: Date): GameState {
	const next = reanchor(state, now);
	if (next.mode === 'emergency') throw new GameRuleError(PAUSED);
	if (next.mode === 'locked') throw new GameRuleError("You're already locked.");
	return { ...next, mode: 'locked' };
}

export function emergencyOn(state: GameState, now: Date): GameState {
	const next = reanchor(state, now);
	if (next.mode === 'emergency') throw new GameRuleError('The emergency switch is already on.');
	return { ...next, mode: 'emergency', resumeMode: next.mode };
}

export function emergencyOff(state: GameState, now: Date): GameState {
	const next = reanchor(state, now);
	if (next.mode !== 'emergency') throw new GameRuleError('The emergency switch is already off.');
	return { ...next, mode: next.resumeMode ?? 'locked', resumeMode: null };
}

/** Price factor for adding time: doubles with every `doublingDays` left, halved during a happy hour, one decimal */
export function multiplier(timerSeconds: number, doublingDays: number, happyHour = false): number {
	const factor = 2 ** (timerSeconds / (doublingDays * DAY)) / (happyHour ? 2 : 1);
	return Math.round(factor * 10) / 10;
}

/** `hours × multiplier`, as whole minutes of currency (in seconds) */
export function addPriceSeconds(hours: number, factor: number): number {
	return Math.round(hours * factor * 60) * 60;
}

/** Only what was actually removed is charged, rounded up to whole minutes (in seconds) */
export function removePriceSeconds(removedSeconds: number, ratio: number): number {
	return Math.ceil((removedSeconds * ratio) / 60) * 60;
}

export interface Notified {
	timerZeroAt: Date | null;
	bankDryAt: Date | null;
	/** Set once the timer dropped to an hour or less; cleared once it's back above an hour */
	hourLeftAt: Date | null;
}

export type MomentKind = 'hour-left' | 'timer-zero' | 'bank-dry';

/** The earliest moment worth a notification that hasn't been sent yet, past or future */
export function nextMoment(state: GameState, notified: Notified, now: Date): { kind: MomentKind; at: Date } | null {
	if (state.mode === 'emergency') return null;
	const projection = project(state, now);
	const moments: Array<{ kind: MomentKind; at: Date }> = [];
	if (projection.timerZeroAt && !notified.timerZeroAt)
		moments.push({ kind: 'timer-zero', at: projection.timerZeroAt });
	// When the timer is down to an hour. Already there (time was removed): due right away. Already at
	// zero: skipped, since "the timer ran out" says more.
	if (projection.timerZeroAt && projection.timerSeconds > 0 && !notified.hourLeftAt) {
		const hourLeftAt = plusSeconds(projection.timerZeroAt, -HOUR);
		moments.push({ kind: 'hour-left', at: hourLeftAt > now ? hourLeftAt : now });
	}
	if (state.mode === 'unlocked' && projection.bankDryAt && !notified.bankDryAt) {
		moments.push({ kind: 'bank-dry', at: projection.bankDryAt });
	}
	moments.sort((a, b) => a.at.getTime() - b.at.getTime());
	return moments[0] ?? null;
}

export const SECONDS = { HOUR, DAY } as const;
