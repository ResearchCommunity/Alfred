import { describe, expect, it } from 'vitest';
import type { ActionResult } from '../../src/features/chastity/game.ts';
import { actionPost, momentMessages } from '../../src/features/chastity/messages.ts';
import type { GameState } from '../../src/features/chastity/time.ts';
import { DEFAULT_WHEEL } from '../../src/features/chastity/wheel.ts';

const NOW = new Date('2026-11-15T12:00:00Z');
const state = (overrides: Partial<GameState> = {}): GameState => ({
	mode: 'locked',
	resumeMode: null,
	anchorAt: NOW,
	timerSeconds: 3600,
	bankSeconds: 0,
	happyHourUntil: null,
	...overrides,
});

const config = {
	ownerId: '100000000000000001',
	channelId: '200000000000000002',
	currencyName: 'dubloons',
	allowancePerDayHours: 8,
	walletCapHours: 24,
	startingBalanceHours: 24,
	bankCapHours: 24,
	multiplierDoublingDays: 3,
	removeCostRatio: 3,
	bankShortfallFactor: 4,
	spinCostHours: 4,
	wheel: DEFAULT_WHEEL,
};

/** A spin's public post, for a Drain or Heist with the given deltas (in hours) */
const spin = (name: string, effect: 'bankDrain' | 'heist', bank: number, timer: number) => {
	const result: Extract<ActionResult, { ok: true }> = {
		ok: true,
		mode: 'locked',
		projection: { timerSeconds: 10 * 3600, bankSeconds: 0, timerZeroAt: null, bankDryAt: null },
		multiplier: 1,
		happyHourUntil: null,
		balanceSeconds: 0,
		roll: { tier: 'legendary', name, effect, minutes: 120 },
		event: {
			at: NOW,
			actorId: '300000000000000003',
			targetId: null,
			timerAfterSeconds: null,
			bankAfterSeconds: null,
			balanceAfterSeconds: null,
			rolledMinutes: null,
			rules: null,
			type: 'spin',
			source: 'wheel',
			costSeconds: 4 * 3600,
			creditSeconds: 0,
			timerDeltaSeconds: timer * 3600,
			bankDeltaSeconds: bank * 3600,
			multiplier: 1,
			reason: null,
			tier: 'legendary',
			effect,
			outcome: name,
		},
	};
	return JSON.stringify(actionPost(result, config).components);
};

describe('chastity messages', () => {
	it("doesn't let a reason disguise a link", () => {
		const result: Extract<ActionResult, { ok: true }> = {
			ok: true,
			mode: 'locked',
			projection: { timerSeconds: 3600, bankSeconds: 0, timerZeroAt: null, bankDryAt: null },
			multiplier: 1,
			happyHourUntil: null,
			balanceSeconds: 0,
			event: {
				at: new Date(),
				actorId: '300000000000000003',
				targetId: null,
				timerAfterSeconds: null,
				bankAfterSeconds: null,
				balanceAfterSeconds: null,
				rolledMinutes: null,
				rules: null,
				type: 'add',
				source: 'member',
				costSeconds: 3600,
				creditSeconds: 0,
				timerDeltaSeconds: 3600,
				bankDeltaSeconds: 0,
				multiplier: 1,
				reason: '[free nitro](https://evil.example)',
				tier: null,
				effect: null,
				outcome: null,
			},
		};
		// Escaped as \[free nitro], which Discord shows as plain text instead of a link
		// (in the JSON below, that backslash appears doubled)
		const json = JSON.stringify(actionPost(result, config).components);
		expect(json).toContain(String.raw`\\[free nitro](https://evil.example)`);
	});

	it('says when Drain and Heist made up for a short unlock bank on the timer', () => {
		expect(spin('Drain', 'bankDrain', -2, 0)).toContain('**2h drained** from the unlock bank');
		expect(spin('Drain', 'bankDrain', -1, 4)).toContain(
			"what it couldn't take went on the timer ×4 (**+4h** on the timer)",
		);
		expect(spin('Drain', 'bankDrain', 0, 8)).toContain('the unlock bank was empty, so it all went on the timer ×4');
		expect(spin('Heist', 'heist', -2, 2)).toContain('**2h stolen** from the unlock bank and put on the timer');
		expect(spin('Heist', 'heist', -1, 6)).toContain('the timer got the rest ×4 on top (**+6h** on the timer)');
		expect(spin('Heist', 'heist', 0, 10)).toContain('the unlock bank was empty, so the timer got it ×4 on top');
	});

	it("doesn't promise unlock bank growth when the timer runs out while unlocked", () => {
		const text = JSON.stringify(momentMessages('timer-zero', state({ mode: 'unlocked' }), '1', NOW));
		expect(text).toContain('<@1> is still unlocked');
		expect(text).not.toContain('every minute now goes into your unlock bank');
	});

	it('announces the last hour in the channel only, with a mention and the live end time', () => {
		const messages = momentMessages('hour-left', state(), '1', NOW);
		const text = JSON.stringify(messages.channel.components);
		expect(text).toContain("Less than an hour left on <@1>'s timer");
		expect(text).toContain(`<t:${NOW.getTime() / 1000 + 3600}:R>`);
		expect(messages.dm).toBeNull();
	});
});
