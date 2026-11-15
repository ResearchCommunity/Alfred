import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { exportGame, recordRules } from '../../src/features/chastity/export.ts';
import { Game } from '../../src/features/chastity/game.ts';
import {
	appendEvent,
	chargeWallet,
	createState,
	leaderboard,
	loadState,
	loadWallet,
	refundWallet,
	saveState,
} from '../../src/features/chastity/repository.ts';
import type { GameState } from '../../src/features/chastity/time.ts';
import { DEFAULT_WHEEL } from '../../src/features/chastity/wheel.ts';
import type { ChastityConfig } from '../../src/lib/config.ts';
import { useTestDatabase } from './helpers.ts';

const H = 3600;
const OWNER = '100000000000000001';
const Line = z.record(z.string(), z.unknown());
const ALICE = '200000000000000002';
const BOB = '300000000000000003';
const T0 = new Date('2026-11-14T12:00:00Z');

const config: ChastityConfig = {
	ownerId: OWNER,
	channelId: '400000000000000004',
	currencyName: 'dubloons',
	allowancePerDayHours: 8,
	walletCapHours: 24,
	startingBalanceHours: 24,
	multiplierFlatHours: 24,
	multiplierTargetDays: 14,
	multiplierTarget: 24,
	bankCapHours: 24,
	removeCostRatio: 3,
	bankShortfallFactor: 4,
	spinCostHours: 4,
	wheel: DEFAULT_WHEEL,
};

const state = (overrides: Partial<GameState> = {}): GameState => ({
	mode: 'locked',
	resumeMode: null,
	anchorAt: T0,
	timerSeconds: 3 * 24 * H,
	bankSeconds: 0,
	happyHourUntil: null,
	...overrides,
});

const event = (actorId: string, timerDeltaSeconds: number, source: 'member' | 'wheel' = 'member') => ({
	at: T0,
	actorId,
	type: 'add' as const,
	source,
	costSeconds: H,
	timerDeltaSeconds,
	bankDeltaSeconds: 0,
	multiplier: null,
	reason: null,
	tier: null,
	effect: null,
	outcome: null,
	creditSeconds: 0,
	targetId: null,
	timerAfterSeconds: null,
	bankAfterSeconds: null,
	balanceAfterSeconds: null,
	rolledMinutes: null,
	rules: null,
});

/** Random numbers that pick the given tier and outcome (by index), then the low end of the range */
const pick = (tierIndex: number, outcomeIndex: number) => {
	const tier = DEFAULT_WHEEL[tierIndex];
	if (!tier) throw new Error('no such tier');
	const tierTotal = DEFAULT_WHEEL.reduce((sum, t) => sum + t.weight, 0);
	const tierStart = DEFAULT_WHEEL.slice(0, tierIndex).reduce((sum, t) => sum + t.weight, 0);
	const outcomeTotal = tier.outcomes.reduce((sum, o) => sum + o.weight, 0);
	const outcomeStart = tier.outcomes.slice(0, outcomeIndex).reduce((sum, o) => sum + o.weight, 0);
	const values = [(tierStart + 0.001) / tierTotal, (outcomeStart + 0.001) / outcomeTotal, 0];
	return () => values.shift() ?? 0;
};

describe('chastity repository', () => {
	const db = useTestDatabase();

	it('refuses a state write based on a stale version', async () => {
		await db().collection('chastity_state').deleteMany({});
		await createState(db(), state());
		const notified = { timerZeroAt: null, bankDryAt: null, hourLeftAt: null };
		expect(await saveState(db(), 0, state({ timerSeconds: 1 }), notified)).toBe(true);
		expect(await saveState(db(), 0, state({ timerSeconds: 2 }), notified)).toBe(false);
		expect((await loadState(db()))?.timerSeconds).toBe(1);
	});

	it('lets only one of two charges on the same wallet snapshot through, and refunds', async () => {
		await chargeWallet(db(), ALICE, null, 10 * H, T0);
		const wallet = await loadWallet(db(), ALICE);
		const results = await Promise.all([
			chargeWallet(db(), ALICE, wallet, 8 * H, T0),
			chargeWallet(db(), ALICE, wallet, 6 * H, T0),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		const charged = (await loadWallet(db(), ALICE))?.balanceSeconds ?? 0;
		await refundWallet(db(), ALICE, 2 * H);
		expect((await loadWallet(db(), ALICE))?.balanceSeconds).toBe(charged + 2 * H);
	});

	it('sums added time per member, wheel included, ignoring removals', async () => {
		await db().collection('chastity_events').deleteMany({});
		await appendEvent(db(), event(ALICE, 2 * H));
		await appendEvent(db(), event(ALICE, H, 'wheel'));
		await appendEvent(db(), event(ALICE, -5 * H));
		await appendEvent(db(), event(BOB, H));
		expect(await leaderboard(db(), 'added')).toEqual([
			{ userId: ALICE, value: 3 * H },
			{ userId: BOB, value: H },
		]);
		expect(await leaderboard(db(), 'removed')).toEqual([{ userId: ALICE, value: 5 * H }]);
		// A fully refunded spin isn't spending
		await appendEvent(db(), { ...event(BOB, H, 'wheel'), type: 'spin', costSeconds: 4 * H, creditSeconds: 4 * H });
		expect((await leaderboard(db(), 'spent')).find((row) => row.userId === BOB)?.value).toBe(H);
	});
});

describe('chastity game', () => {
	const db = useTestDatabase();

	async function freshGame(random = () => 0, timerSeconds = 3 * 24 * H): Promise<Game> {
		await Promise.all(
			['chastity_state', 'chastity_wallets', 'chastity_events'].map((name) =>
				db().collection(name).deleteMany({}),
			),
		);
		const game = new Game(db(), config, () => T0, random);
		expect((await game.start(OWNER, timerSeconds)).ok).toBe(true);
		return game;
	}

	it('charges hours × multiplier for adding time', async () => {
		const game = await freshGame();
		const result = await game.memberAdd(ALICE, 6, 'you know what you did');
		// Charged at the multiplier before the add (1.5x at 3 days); the result shows the new one
		expect(result).toMatchObject({ ok: true, multiplier: 1.7, balanceSeconds: 15 * H });
		expect(result.ok && result.event).toMatchObject({
			multiplier: 1.5,
			costSeconds: 9 * H,
			timerDeltaSeconds: 6 * H,
		});
	});

	it("charges nothing for what a member can't afford", async () => {
		const game = await freshGame();
		// 17h at 1.5x would cost 25.5, one more than a full wallet
		expect(await game.memberAdd(ALICE, 17, null)).toMatchObject({ ok: false, balanceSeconds: 24 * H });
		expect(await loadWallet(db(), ALICE)).toBeNull();
	});

	it('only charges for time actually removed', async () => {
		const game = await freshGame(() => 0, 1800);
		expect(await game.memberRemove(ALICE, 2, null)).toMatchObject({ ok: true, balanceSeconds: 24 * H - 1.5 * H });
		expect(await game.memberRemove(ALICE, 1, null)).toMatchObject({ ok: false });
	});

	it('announces the last hour again only after the timer went back above an hour', async () => {
		const game = await freshGame(() => 0, H / 2);
		await saveState(db(), 0, state({ timerSeconds: H / 2 }), {
			timerZeroAt: null,
			bankDryAt: null,
			hourLeftAt: T0,
		});
		await game.memberAdd(ALICE, 0.25, null);
		expect((await loadState(db()))?.notified.hourLeftAt).toEqual(T0);
		await game.memberAdd(ALICE, 2, null);
		expect((await loadState(db()))?.notified.hourLeftAt).toBeNull();
	});

	it('records the rules once, and again only when they change', async () => {
		await freshGame();
		expect(await recordRules(db(), config, T0)).toBe(true);
		expect(await recordRules(db(), config, T0)).toBe(false);
		expect(await recordRules(db(), { ...config, spinCostHours: 5 }, T0)).toBe(true);
	});

	it('exports the history with pseudonyms, without reasons, and with what things were after each event', async () => {
		const game = await freshGame(pick(0, 0));
		await recordRules(db(), config, T0);
		await game.memberSpin(BOB);
		await game.memberAdd(ALICE, 2, 'a secret reason');
		await game.memberSend(ALICE, BOB, H, 'also secret');

		const { name, data } = await exportGame(db(), config, T0);
		expect(name).toBe('chastity-export-2026-11-14.jsonl');
		const text = data.toString();
		// No Discord IDs, no reasons
		expect(text).not.toMatch(/\d{17,20}/);
		expect(text).not.toContain('secret');

		const [header, ...events] = text
			.trimEnd()
			.split('\n')
			.map((line) => Line.parse(JSON.parse(line)));
		expect(header).toMatchObject({
			format: 'alfred-chastity-export',
			version: 1,
			rules: { spinCostHours: 4 },
			state: { mode: 'locked' },
			members: [
				// m1 spun at 1.5x (6) and got 1 sent: 24 − 6 + 1
				{ member: 'm1', balanceSeconds: 19 * H },
				// m2 added 2h at 1.6x (3.2) and sent 1
				{ member: 'm2', balanceSeconds: 24 * H - 3.2 * H - H },
			],
		});
		expect(events.map((e) => [e.type, e.actor, e.target])).toEqual([
			['start', 'owner', null],
			['config', null, null],
			['spin', 'm1', null],
			['add', 'm2', null],
			['send', 'm2', 'm1'],
		]);
		expect(events[2]).toMatchObject({
			rolledMinutes: 60,
			balanceAfterSeconds: 18 * H,
			timerAfterSeconds: 3 * 24 * H + H,
		});
		expect(events[3]).toMatchObject({ balanceAfterSeconds: 24 * H - 3.2 * H, bankAfterSeconds: 0 });
		expect(events[3]).not.toHaveProperty('reason');
	});

	it('tells how long the current stretch has lasted: since the start, an unlock, or the last relock', async () => {
		await freshGame();
		const at = (hours: number) => new Game(db(), config, () => new Date(T0.getTime() + hours * H * 1000));
		expect(await at(5).info(ALICE)).toMatchObject({ stretch: { locked: true, since: T0, seconds: 5 * H } });

		await saveState(db(), 0, state({ bankSeconds: 10 * H }), {
			timerZeroAt: null,
			bankDryAt: null,
			hourLeftAt: null,
		});
		expect((await at(6).unlock(OWNER)).ok).toBe(true);
		expect(await at(7).info(OWNER)).toMatchObject({ stretch: { locked: false, seconds: H } });

		expect((await at(8).relock(OWNER)).ok).toBe(true);
		expect(await at(10).info(ALICE)).toMatchObject({ stretch: { locked: true, seconds: 2 * H } });
	});

	it('applies two simultaneous adds without losing either', async () => {
		const game = await freshGame(() => 0, H);
		const results = await Promise.all([game.memberAdd(ALICE, 1, null), game.memberAdd(BOB, 1, null)]);
		expect(results.every((r) => r.ok)).toBe(true);
		expect((await loadState(db()))?.timerSeconds).toBe(3 * H);
	});

	it("keeps the owner out of member actions and members out of the owner's", async () => {
		const game = await freshGame();
		expect(await game.memberAdd(OWNER, 1, null)).toMatchObject({ ok: false });
		expect(await game.emergency(ALICE, true)).toMatchObject({ ok: false });
	});

	it('pauses member actions during an emergency without charging anyone', async () => {
		const game = await freshGame();
		await game.emergency(OWNER, true);
		expect(await game.memberAdd(ALICE, 1, null)).toMatchObject({ ok: false, reason: 'The game is paused.' });
		expect(await loadWallet(db(), ALICE)).toBeNull();
	});

	it('a spin costs 4 × the multiplier and adds time', async () => {
		const game = await freshGame(pick(0, 0));
		expect(await game.memberSpin(ALICE)).toMatchObject({
			ok: true,
			roll: { tier: 'common', name: 'Nudge' },
			balanceSeconds: 18 * H,
			event: { timerDeltaSeconds: H, multiplier: 1.5, costSeconds: 6 * H, creditSeconds: 0 },
		});
	});

	it('a refund adds time and gives the price back', async () => {
		const game = await freshGame(pick(1, 1));
		expect(await game.memberSpin(ALICE)).toMatchObject({
			ok: true,
			roll: { name: 'Refund' },
			balanceSeconds: 24 * H,
			event: { timerDeltaSeconds: H, creditSeconds: 6 * H },
		});
	});

	it('a windfall pays twice the spin price, past the cap', async () => {
		const game = await freshGame(pick(2, 2), H);
		// 2 days on the timer: multiplier 1.1, so the spin costs 4.4h and pays 8.8h
		await saveState(db(), 0, state({ timerSeconds: 2 * 24 * H }), {
			timerZeroAt: null,
			bankDryAt: null,
			hourLeftAt: null,
		});
		expect(await game.memberSpin(ALICE)).toMatchObject({
			ok: true,
			roll: { name: 'Windfall' },
			balanceSeconds: (24 * 60 - 264 + 528) * 60,
			event: { costSeconds: 264 * 60, creditSeconds: 528 * 60 },
		});
	});

	it('a happy hour halves the price of adding and spinning for everyone', async () => {
		// Inside the flat first day: 1x, halved to 0.5x
		const game = await freshGame(pick(2, 1), 12 * H);
		expect(await game.memberSpin(ALICE)).toMatchObject({ ok: true, roll: { name: 'Happy hour' }, multiplier: 0.5 });
		expect(await game.memberSpin(BOB)).toMatchObject({ ok: true, event: { multiplier: 0.5, costSeconds: 2 * H } });
		expect(await game.memberAdd(BOB, 6, null)).toMatchObject({
			ok: true,
			event: { multiplier: 0.5, costSeconds: 3 * H },
		});
	});

	it('a heist moves bank time onto the timer, plus 4× what the bank was short', async () => {
		const game = await freshGame(pick(3, 1));
		await saveState(db(), 0, state({ bankSeconds: H }), { timerZeroAt: null, bankDryAt: null, hourLeftAt: null });
		// Rolled 2h with 1h in the bank: 1h stolen, the timer gets 2h + 1h × 4
		expect(await game.memberSpin(ALICE)).toMatchObject({
			ok: true,
			roll: { tier: 'legendary', name: 'Heist' },
			event: { bankDeltaSeconds: -H, timerDeltaSeconds: 6 * H },
		});
	});

	it("a drain puts what it can't take on the timer 4× over, and only that", async () => {
		const game = await freshGame(pick(3, 0));
		// Empty bank: the 2h rolled all go on the timer × 4
		expect(await game.memberSpin(ALICE)).toMatchObject({
			roll: { name: 'Drain' },
			event: { bankDeltaSeconds: 0, timerDeltaSeconds: 8 * H },
		});
		// A full bank: drained, the timer untouched (pick() rigs a single spin, so a fresh game)
		const again = await freshGame(pick(3, 0));
		await saveState(db(), 0, state({ bankSeconds: 10 * H }), {
			timerZeroAt: null,
			bankDryAt: null,
			hourLeftAt: null,
		});
		expect(await again.memberSpin(BOB)).toMatchObject({
			event: { bankDeltaSeconds: -2 * H, timerDeltaSeconds: 0 },
		});
	});

	it('sends currency to another member, past their cap, and the sender pays exactly that', async () => {
		const game = await freshGame();
		expect(await game.memberSend(ALICE, BOB, 10 * H, 'for the big push')).toMatchObject({
			ok: true,
			balanceSeconds: 14 * H,
			recipientBalanceSeconds: 34 * H,
			event: { type: 'send', actorId: ALICE, targetId: BOB, costSeconds: 10 * H },
		});
		expect((await loadWallet(db(), BOB))?.balanceSeconds).toBe(34 * H);
		expect(await leaderboard(db(), 'spent')).toEqual([]);
	});

	it('refuses sends to yourself, to the owner, from the owner, or beyond your balance', async () => {
		const game = await freshGame();
		expect(await game.memberSend(ALICE, ALICE, H, null)).toMatchObject({ ok: false });
		expect(await game.memberSend(ALICE, OWNER, H, null)).toMatchObject({ ok: false });
		expect(await game.memberSend(OWNER, ALICE, H, null)).toMatchObject({ ok: false });
		expect(await game.memberSend(ALICE, BOB, 25 * H, null)).toMatchObject({ ok: false, balanceSeconds: 24 * H });
		expect(await loadWallet(db(), BOB)).toBeNull();
	});

	it('lets the owner set the timer and the unlock bank to exact values, and nobody else', async () => {
		const game = await freshGame();
		expect(await game.set(ALICE, { timerSeconds: H })).toMatchObject({ ok: false });
		expect(await game.set(OWNER, { timerSeconds: 5 * H, bankSeconds: 2 * H })).toMatchObject({
			ok: true,
			projection: { timerSeconds: 5 * H, bankSeconds: 2 * H },
			event: { type: 'set', timerDeltaSeconds: 5 * H - 3 * 24 * H, bankDeltaSeconds: 2 * H },
		});
		expect(await game.set(OWNER, { bankSeconds: 0 })).toMatchObject({
			ok: true,
			projection: { timerSeconds: 5 * H },
		});
	});

	it('resets the game so it can start again, keeping balances unless told to wipe everything', async () => {
		const game = await freshGame();
		await game.memberAdd(ALICE, 1, null);
		expect(await game.reset(ALICE, false)).toMatchObject({ ok: false });

		expect(await game.reset(OWNER, false)).toEqual({ ok: true });
		expect(await loadState(db())).toBeNull();
		expect(await loadWallet(db(), ALICE)).not.toBeNull();
		expect((await game.start(OWNER, H)).ok).toBe(true);

		expect(await game.reset(OWNER, true)).toEqual({ ok: true });
		expect(await loadWallet(db(), ALICE)).toBeNull();
		expect(await leaderboard(db(), 'added')).toEqual([]);
		expect(await game.reset(OWNER, true)).toMatchObject({ ok: false });
	});
});
