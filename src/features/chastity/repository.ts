import type { Db } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';
import type { GameState, Notified } from './time.ts';
import type { Wallet } from './wallet.ts';
import { TIERS, type Tier } from './wheel.ts';

/*
 * Three collections:
 * - chastity_state: the single game document (an anchor, see time.ts), written with an
 *   optimistic `version` check so concurrent actions can't overwrite each other.
 * - chastity_wallets: one anchor per member, charged with a compare-and-swap.
 * - chastity_events: append-only log; leaderboards aggregate over it.
 */

const STATE_ID = 'game';
const Seconds = z.number().int().min(0);

const StoredStateSchema = z.object({
	_id: z.literal(STATE_ID),
	version: z.number().int().min(0),
	mode: z.enum(['locked', 'unlocked', 'emergency']),
	resumeMode: z.enum(['locked', 'unlocked']).nullable(),
	anchorAt: z.date(),
	timerSeconds: Seconds,
	bankSeconds: Seconds,
	happyHourUntil: z.date().nullable(),
	notified: z.object({
		timerZeroAt: z.date().nullable(),
		bankDryAt: z.date().nullable(),
		// Older states predate it
		hourLeftAt: z.date().nullable().default(null),
	}),
});

export type StoredState = z.infer<typeof StoredStateSchema>;

// May dip below zero in one rare race (a windfall spent before its spin lost a race and was
// taken back); the trickle then fills it up again like any other balance
const WalletSchema = z.object({ _id: Snowflake, balanceSeconds: z.number().int(), anchoredAt: z.date() });

export const EVENT_TYPES = [
	'start',
	'send',
	'add',
	'remove',
	'spin',
	'unlock',
	'relock',
	'emergency-on',
	'emergency-off',
	'hour-left',
	'timer-zero',
	'bank-dry',
	'set',
	'reset',
	'config',
] as const;

const GameEventSchema = z.object({
	at: z.date(),
	actorId: Snowflake.nullable().describe('null for system events'),
	/** Who received currency (send events) */
	targetId: Snowflake.nullable(),
	type: z.enum(EVENT_TYPES),
	source: z.enum(['member', 'wheel', 'owner', 'system']),
	costSeconds: Seconds,
	/** Currency the action paid out to the actor (wheel refund or windfall) */
	creditSeconds: Seconds,
	timerDeltaSeconds: z.number().int(),
	bankDeltaSeconds: z.number().int(),
	multiplier: z.number().nullable(),
	reason: z.string().max(200).nullable(),
	tier: z.enum(TIERS).nullable(),
	effect: z.string().nullable(),
	/** The wheel outcome's display name */
	outcome: z.string().nullable(),
	// For rebalancing (see export.ts). Events from before these existed have them as null.
	/** The timer and unlock bank right after the event; null when it didn't touch the game */
	timerAfterSeconds: Seconds.nullable().default(null),
	bankAfterSeconds: Seconds.nullable().default(null),
	/** The acting member's balance right after (member actions and sends) */
	balanceAfterSeconds: z.number().int().nullable().default(null),
	/** What the wheel rolled, before anything clamped it (a Drain on a short bank) */
	rolledMinutes: z.number().int().nullable().default(null),
	/** `config` events: the game's rules from then on */
	rules: z.record(z.string(), z.unknown()).nullable().default(null),
});

export type GameEvent = z.infer<typeof GameEventSchema>;

const states = (db: Db) => db.collection<StoredState>('chastity_state');
const wallets = (db: Db) => db.collection<z.infer<typeof WalletSchema>>('chastity_wallets');
const events = (db: Db) => db.collection<GameEvent>('chastity_events');

export async function ensureIndexes(db: Db): Promise<void> {
	await events(db).createIndex({ actorId: 1, at: 1 });
}

export async function loadState(db: Db): Promise<StoredState | null> {
	return states(db).findOne({ _id: STATE_ID });
}

const stateFields = (state: GameState) => ({
	mode: state.mode,
	resumeMode: state.resumeMode,
	anchorAt: state.anchorAt,
	timerSeconds: state.timerSeconds,
	bankSeconds: state.bankSeconds,
	happyHourUntil: state.happyHourUntil,
});

/** Starts the game. False if one already exists. */
export async function createState(db: Db, state: GameState): Promise<boolean> {
	const doc = StoredStateSchema.parse({
		_id: STATE_ID,
		version: 0,
		...stateFields(state),
		notified: { timerZeroAt: null, bankDryAt: null, hourLeftAt: null },
	});
	try {
		await states(db).insertOne(doc);
		return true;
	} catch (error) {
		if (error instanceof MongoServerError && error.code === 11_000) return false;
		throw error;
	}
}

/** Writes the next state only if nobody else wrote since `expectedVersion` was read */
export async function saveState(
	db: Db,
	expectedVersion: number,
	next: GameState,
	notified: Notified,
): Promise<boolean> {
	const fields = StoredStateSchema.omit({ _id: true, version: true }).parse({ ...stateFields(next), notified });
	const result = await states(db).updateOne(
		{ _id: STATE_ID, version: expectedVersion },
		{ $set: fields, $inc: { version: 1 } },
	);
	return result.modifiedCount === 1;
}

export async function loadWallet(db: Db, userId: string): Promise<Wallet | null> {
	const doc = await wallets(db).findOne({ _id: userId });
	return doc && { balanceSeconds: doc.balanceSeconds, anchoredAt: doc.anchoredAt };
}

/**
 * Sets the wallet to `balanceSeconds` (anchored at `now`), but only if it still is exactly
 * `current` (null: the member has no wallet yet). False means someone else got there first.
 */
export async function chargeWallet(
	db: Db,
	userId: string,
	current: Wallet | null,
	balanceSeconds: number,
	now: Date,
): Promise<boolean> {
	const doc = WalletSchema.parse({ _id: userId, balanceSeconds, anchoredAt: now });
	if (!current) {
		try {
			await wallets(db).insertOne(doc);
			return true;
		} catch (error) {
			if (error instanceof MongoServerError && error.code === 11_000) return false;
			throw error;
		}
	}
	const result = await wallets(db).updateOne(
		{ _id: userId, balanceSeconds: current.balanceSeconds, anchoredAt: current.anchoredAt },
		{ $set: { balanceSeconds: doc.balanceSeconds, anchoredAt: doc.anchoredAt } },
	);
	return result.modifiedCount === 1;
}

/** Gives back a charge whose action didn't go through. Keeps the wallet's anchor. */
export async function refundWallet(db: Db, userId: string, seconds: number): Promise<void> {
	await wallets(db).updateOne({ _id: userId }, { $inc: { balanceSeconds: seconds } });
}

/** Ends the game. With `everything`, balances and history (leaderboards) go too. */
export async function resetGame(db: Db, everything: boolean): Promise<boolean> {
	const { deletedCount } = await states(db).deleteOne({ _id: STATE_ID });
	if (everything) await Promise.all([wallets(db).deleteMany({}), events(db).deleteMany({})]);
	return deletedCount === 1;
}

/** Checks an event before anything is written, so a bad one can't fail after money moved */
export function validateEvent(event: GameEvent): GameEvent {
	return GameEventSchema.parse(event);
}

export async function appendEvent(db: Db, event: GameEvent): Promise<void> {
	await events(db).insertOne(GameEventSchema.parse(event));
}

/** The whole log, oldest first */
export function allEvents(db: Db): AsyncIterable<GameEvent> {
	return events(db)
		.find({}, { projection: { _id: 0 } })
		.sort({ at: 1, _id: 1 });
}

/** The rules recorded last, to tell whether the config changed since */
export async function lastRules(db: Db): Promise<Record<string, unknown> | null> {
	const event = await events(db).findOne({ type: 'config' }, { sort: { at: -1, _id: -1 } });
	return event?.rules ?? null;
}

export async function allWallets(db: Db): Promise<Array<{ userId: string } & Wallet>> {
	const docs = await wallets(db).find({}).toArray();
	return docs.map(({ _id, balanceSeconds, anchoredAt }) => ({ userId: _id, balanceSeconds, anchoredAt }));
}

export const BOARDS = ['added', 'removed', 'spent', 'legendary'] as const;
export type Board = (typeof BOARDS)[number];

const BOARD_VALUE: Record<Board, unknown> = {
	added: { $cond: [{ $gt: ['$timerDeltaSeconds', 0] }, '$timerDeltaSeconds', 0] },
	removed: { $cond: [{ $lt: ['$timerDeltaSeconds', 0] }, { $multiply: ['$timerDeltaSeconds', -1] }, 0] },
	// Net of what the action paid back (a refund spin costs nothing overall)
	spent: {
		$cond: [
			{ $in: ['$type', ['add', 'remove', 'spin']] },
			{ $max: [0, { $subtract: ['$costSeconds', '$creditSeconds'] }] },
			0,
		],
	},
	legendary: { $cond: [{ $eq: ['$tier', 'legendary' satisfies Tier] }, 1, 0] },
};

/** All-time top members for a board (seconds, or a count for `legendary`) */
export async function leaderboard(db: Db, board: Board, limit = 10): Promise<Array<{ userId: string; value: number }>> {
	const rows = await events(db)
		.aggregate<{ _id: string; value: number }>([
			{ $match: { source: { $in: ['member', 'wheel'] }, actorId: { $ne: null } } },
			{ $group: { _id: '$actorId', value: { $sum: BOARD_VALUE[board] } } },
			{ $match: { value: { $gt: 0 } } },
			{ $sort: { value: -1, _id: 1 } },
			{ $limit: limit },
		])
		.toArray();
	return rows.map((row) => ({ userId: row._id, value: row.value }));
}
