import { describe, expect, it } from 'vitest';
import { DEFAULT_WHEEL, roll, WheelSchema } from '../../src/features/chastity/wheel.ts';

/** Deterministic pseudo-random numbers (mulberry32) */
function seeded(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

describe('wheel', () => {
	it('maps the lowest and highest random numbers to the first and last outcomes', () => {
		expect(roll(DEFAULT_WHEEL, () => 0)).toEqual({ tier: 'common', name: 'Nudge', effect: 'timer', minutes: 60 });
		expect(roll(DEFAULT_WHEEL, () => 0.999_999)).toEqual({
			tier: 'legendary',
			name: 'Mercy',
			effect: 'bankBonus',
			minutes: 120,
		});
	});

	it('adds time far more often than it backfires, and lands on legendary about 3% of the time', () => {
		const random = seeded(42);
		const rolls = Array.from({ length: 10_000 }, () => roll(DEFAULT_WHEEL, random));
		const share = rolls.filter((r) => r.tier === 'legendary').length / rolls.length;
		expect(share).toBeGreaterThan(0.02);
		expect(share).toBeLessThan(0.04);
		const adds = rolls.filter((r) => (r.effect === 'timer' || r.effect === 'refund') && r.minutes > 0).length;
		const backfires = rolls.filter((r) => r.effect === 'timer' && r.minutes < 0).length;
		expect(adds).toBeGreaterThan(backfires * 3);
	});

	it('keeps bank effects out of the common and rare tiers', () => {
		const bad = [
			{
				tier: 'common',
				weight: 1,
				outcomes: [{ weight: 1, effect: { kind: 'bank', minMinutes: 1, maxMinutes: 2 } }],
			},
		];
		expect(WheelSchema.safeParse(bad).success).toBe(false);
		expect(WheelSchema.safeParse(DEFAULT_WHEEL).success).toBe(true);
	});
});
