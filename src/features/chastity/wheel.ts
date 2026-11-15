import { z } from 'zod';

// The wheel: a flat-priced gamble whose outcomes ignore the multiplier. From the spinner's
// side, adding time is winning and removing it is a backfire. Only legendary outcomes may
// touch the owner's bank. Imported by lib/config.ts, so it must not import it.

export const TIERS = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * - timer: ± time on the timer (negative = backfire)
 * - refund: + time on the timer, and the spinner gets the spin's price back
 * - happyHour: adding costs half for everyone, for this many minutes
 * - windfall: the spinner gets this much currency, even past the cap
 * - bankDrain: time out of the owner's bank
 * - heist: time out of the owner's bank and onto the timer (the timer gets the full amount)
 * - bankBonus: time into the owner's bank
 */
export const EFFECTS = ['timer', 'refund', 'happyHour', 'windfall', 'bankDrain', 'heist', 'bankBonus'] as const;
export type EffectKind = (typeof EFFECTS)[number];

const BANK_EFFECTS: ReadonlySet<EffectKind> = new Set(['bankDrain', 'heist', 'bankBonus']);

const EffectSchema = z
	.strictObject({
		kind: z.enum(EFFECTS),
		minMinutes: z.number().int(),
		maxMinutes: z.number().int(),
	})
	.refine((effect) => effect.minMinutes <= effect.maxMinutes, 'minMinutes must not exceed maxMinutes')
	.refine(
		(effect) => effect.kind === 'timer' || effect.minMinutes > 0,
		'Only timer outcomes may be negative; give the others positive amounts',
	);

export type Effect = z.infer<typeof EffectSchema>;

const Weight = z.number().positive();

export const WheelSchema = z
	.array(
		z.strictObject({
			tier: z.enum(TIERS),
			weight: Weight,
			outcomes: z
				.array(z.strictObject({ name: z.string().trim().min(1).max(40), weight: Weight, effect: EffectSchema }))
				.min(1),
		}),
	)
	.min(1)
	.refine((tiers) => new Set(tiers.map((t) => t.tier)).size === tiers.length, 'Each tier may appear only once')
	.refine(
		(tiers) =>
			tiers.every(
				(t) => t.tier === 'legendary' || t.outcomes.every((outcome) => !BANK_EFFECTS.has(outcome.effect.kind)),
			),
		'Bank outcomes (bankDrain, heist, bankBonus) are only allowed in the legendary tier',
	);

export type Wheel = z.infer<typeof WheelSchema>;

const outcome = (name: string, weight: number, kind: EffectKind, minMinutes: number, maxMinutes = minMinutes) => ({
	name,
	weight,
	effect: { kind, minMinutes, maxMinutes },
});

/** Starting defaults, meant to be tuned through config. Weights within a tier are the overall %. */
export const DEFAULT_WHEEL: Wheel = [
	{
		tier: 'common',
		weight: 60,
		outcomes: [
			outcome('Nudge', 35, 'timer', 60, 180),
			outcome('Shove', 15, 'timer', 180, 360),
			outcome('Backfire', 10, 'timer', -180, -60),
		],
	},
	{
		tier: 'uncommon',
		weight: 25,
		outcomes: [
			outcome('Big push', 10, 'timer', 360, 720),
			outcome('Refund', 8, 'refund', 60, 120),
			outcome('Big backfire', 7, 'timer', -480, -240),
		],
	},
	{
		tier: 'rare',
		weight: 12,
		outcomes: [
			outcome('Jackpot', 5, 'timer', 720, 1440),
			outcome('Happy hour', 5, 'happyHour', 60),
			outcome('Windfall', 2, 'windfall', 480),
		],
	},
	{
		tier: 'legendary',
		weight: 3,
		outcomes: [
			outcome('Drain', 1.5, 'bankDrain', 120, 360),
			outcome('Heist', 1, 'heist', 120, 360),
			outcome('Mercy', 0.5, 'bankBonus', 120),
		],
	},
];

export interface Roll {
	tier: Tier;
	name: string;
	effect: EffectKind;
	/** Whole minutes; only `timer` can be negative (a backfire) */
	minutes: number;
}

function pick<T extends { weight: number }>(items: readonly T[], random: () => number): T {
	const total = items.reduce((sum, item) => sum + item.weight, 0);
	let point = random() * total;
	for (const item of items) {
		point -= item.weight;
		if (point < 0) return item;
	}
	// Floating point can leave a hair of `point`: that belongs to the last item
	const last = items.at(-1);
	if (!last) throw new Error('Cannot pick from an empty list');
	return last;
}

export function roll(wheel: Wheel, random: () => number): Roll {
	const tier = pick(wheel, random);
	const { name, effect } = pick(tier.outcomes, random);
	const minutes = effect.minMinutes + Math.floor(random() * (effect.maxMinutes - effect.minMinutes + 1));
	return { tier: tier.tier, name, effect: effect.kind, minutes: Math.min(minutes, effect.maxMinutes) };
}
