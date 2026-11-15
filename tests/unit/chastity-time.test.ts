import { describe, expect, it } from 'vitest';
import {
	addPriceSeconds,
	emergencyOff,
	emergencyOn,
	type GameState,
	GameRuleError,
	multiplier,
	nextMoment,
	project,
	reanchor,
	removePriceSeconds,
	removeTimer,
	startHappyHour,
	unlock,
} from '../../src/features/chastity/time.ts';

const H = 3600;
const T0 = new Date('2026-11-14T12:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * H * 1000);

const locked = (overrides: Partial<GameState> = {}): GameState => ({
	mode: 'locked',
	resumeMode: null,
	anchorAt: T0,
	timerSeconds: 2 * H,
	bankSeconds: 0,
	happyHourUntil: null,
	...overrides,
});

describe('prices', () => {
	it.each([
		[0, 1],
		[24 * H, 1.3],
		[3 * 24 * H, 2],
		[6 * 24 * H, 4],
		[15 * 24 * H, 32],
	])('multiplier with %i s left is %d', (seconds, expected) => {
		expect(multiplier(seconds, 3)).toBe(expected);
	});

	it('prices adds at one multiplier and removals by what was removed', () => {
		expect(addPriceSeconds(6, 2)).toBe(12 * H);
		expect(removePriceSeconds(1800, 3)).toBe(1.5 * H);
	});
});

describe('project', () => {
	it('runs the timer down, then fills the bank', () => {
		const p = project(locked(), at(3));
		expect(p).toMatchObject({ timerSeconds: 0, bankSeconds: H });
		expect(p.timerZeroAt).toEqual(at(2));
	});

	it('stops growing the bank at the cap, but leaves a bank already above it alone', () => {
		expect(project(locked({ timerSeconds: 0, bankCapSeconds: 24 * H }), at(100)).bankSeconds).toBe(24 * H);
		expect(
			project(locked({ timerSeconds: 0, bankSeconds: 30 * H, bankCapSeconds: 24 * H }), at(5)).bankSeconds,
		).toBe(30 * H);
	});

	it('drains the bank while unlocked, then counts the timer down again, and never grows the bank', () => {
		const state = locked({ mode: 'unlocked', bankSeconds: H, timerSeconds: 5 * H });
		const p = project(state, at(3));
		expect(p).toMatchObject({ bankSeconds: 0, timerSeconds: 3 * H });
		expect(p.bankDryAt).toEqual(at(1));
		expect(project(state, at(20)).bankSeconds).toBe(0);
	});

	it('moves nothing during an emergency, and switching it off restores the mode', () => {
		const paused = emergencyOn(locked({ mode: 'unlocked', bankSeconds: H }), T0);
		expect(project(paused, at(10))).toMatchObject({ timerSeconds: 2 * H, bankSeconds: H });
		expect(emergencyOff(paused, at(10)).mode).toBe('unlocked');
	});
});

describe('reanchor', () => {
	it("doesn't drift: many writes a fraction of a second apart count the same as one projection", () => {
		let state = locked({ timerSeconds: 10 * 24 * H });
		const end = new Date(T0.getTime() + 1000 * 60_999);
		for (let i = 1; i <= 1000; i++) state = reanchor(state, new Date(T0.getTime() + i * 60_999));
		expect(project(state, end).timerSeconds).toBe(project(locked({ timerSeconds: 10 * 24 * H }), end).timerSeconds);
	});
});

describe('transitions', () => {
	it('clamps removal at zero', () => {
		const { state, removedSeconds } = removeTimer(locked({ timerSeconds: 1800 }), T0, H);
		expect(removedSeconds).toBe(1800);
		expect(state.timerSeconds).toBe(0);
	});

	it('extends a running happy hour instead of stacking it', () => {
		const once = startHappyHour(locked(), T0, H);
		expect(startHappyHour(once, at(0.5), H).happyHourUntil).toEqual(at(1.5));
	});

	it('halves the multiplier during a happy hour', () => {
		expect(multiplier(3 * 24 * H, 3, true)).toBe(1);
	});

	it('refuses to unlock with an empty bank', () => {
		expect(() => unlock(locked(), T0)).toThrow(GameRuleError);
	});
});

describe('nextMoment', () => {
	const none = { timerZeroAt: null, bankDryAt: null };

	it('finds a timer-zero moment that passed while offline, but only once', () => {
		expect(nextMoment(locked(), none, at(5))).toEqual({ kind: 'timer-zero', at: at(2) });
		expect(nextMoment(locked(), { ...none, timerZeroAt: at(2) }, at(5))).toBeNull();
	});

	it('finds when the bank runs dry while unlocked', () => {
		const state = locked({ mode: 'unlocked', bankSeconds: H, timerSeconds: 5 * H });
		expect(nextMoment(state, none, T0)).toEqual({ kind: 'bank-dry', at: at(1) });
	});

	it('has nothing to say during an emergency', () => {
		expect(nextMoment(locked({ mode: 'emergency', resumeMode: 'locked' }), none, at(5))).toBeNull();
	});
});
