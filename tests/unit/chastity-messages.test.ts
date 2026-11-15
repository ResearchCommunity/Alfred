import { describe, expect, it } from 'vitest';
import type { ActionResult } from '../../src/features/chastity/game.ts';
import { actionPost, momentMessages } from '../../src/features/chastity/messages.ts';
import { DEFAULT_WHEEL } from '../../src/features/chastity/wheel.ts';

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
	spinCostHours: 4,
	wheel: DEFAULT_WHEEL,
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

	it("doesn't promise unlock bank growth when the timer runs out while unlocked", () => {
		const text = JSON.stringify(momentMessages('timer-zero', 'unlocked', '1'));
		expect(text).toContain('<@1> is still unlocked');
		expect(text).not.toContain('every minute now goes into your unlock bank');
	});
});
