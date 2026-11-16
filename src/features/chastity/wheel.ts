import { z } from 'zod';

// The wheel: a gamble priced at the multiplier, whose time outcomes ignore it. From the
// spinner's side, adding time is winning and removing it is a backfire. Only legendary outcomes may
// touch the owner's bank. Imported by lib/config.ts, so it must not import it.

export const TIERS = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * - timer: ± time on the timer (negative = backfire)
 * - refund: + time on the timer, and the spinner gets `share` of the spin's price back
 * - happyHour: adding costs half for everyone, for this many minutes
 * - windfall: the spinner gets `times` the spin's price, even past the cap (the price follows
 *   the multiplier, so a fixed amount would stop being a win)
 * - bankDrain: time out of the owner's bank
 * - heist: time out of the owner's bank and onto the timer (the timer gets the full amount)
 * - bankBonus: time into the owner's bank
 */
export const EFFECTS = ['timer', 'refund', 'happyHour', 'windfall', 'bankDrain', 'heist', 'bankBonus'] as const;
export type EffectKind = (typeof EFFECTS)[number];

const BANK_EFFECTS: ReadonlySet<EffectKind> = new Set(['bankDrain', 'heist', 'bankBonus']);

const Range = { minMinutes: z.number().int(), maxMinutes: z.number().int() };
const ordered = (effect: { minMinutes: number; maxMinutes: number }) => effect.minMinutes <= effect.maxMinutes;

const RangeEffectSchema = z
	.strictObject({ kind: z.enum(EFFECTS.filter((kind) => kind !== 'windfall' && kind !== 'refund')), ...Range })
	.refine(ordered, 'minMinutes must not exceed maxMinutes')
	.refine(
		(effect) => effect.kind === 'timer' || effect.minMinutes > 0,
		'Only timer outcomes may be negative; give the others positive amounts',
	);

const RefundEffectSchema = z
	.strictObject({
		kind: z.literal('refund'),
		...Range,
		share: z.number().positive().max(1).default(0.5).describe("How much of the spin's price comes back (1 = all)"),
	})
	.refine(ordered, 'minMinutes must not exceed maxMinutes')
	.refine((effect) => effect.minMinutes > 0, 'A refund adds time; give it a positive amount');

const WindfallEffectSchema = z.strictObject({
	kind: z.literal('windfall'),
	times: z.number().positive().describe("Payout as a multiple of the spin's price"),
});

const EffectSchema = z.union([RangeEffectSchema, RefundEffectSchema, WindfallEffectSchema]);

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

const outcome = (
	name: string,
	weight: number,
	kind: Exclude<EffectKind, 'windfall' | 'refund'>,
	minMinutes: number,
	maxMinutes = minMinutes,
) => ({ name, weight, effect: { kind, minMinutes, maxMinutes } });

/**
 * Starting defaults, meant to be tuned through config. Weights within a tier are the overall %.
 * Balanced so a spin is worth about 70% of adding time with the same money: the wheel is the
 * fun, risky option, not the efficient one (see the 2026-11-16 export review).
 */
export const DEFAULT_WHEEL: Wheel = [
	{
		tier: 'common',
		weight: 60,
		outcomes: [
			outcome('Nudge', 33, 'timer', 60, 180),
			outcome('Shove', 14, 'timer', 180, 360),
			outcome('Backfire', 13, 'timer', -180, -60),
		],
	},
	{
		tier: 'uncommon',
		weight: 25,
		outcomes: [
			outcome('Big push', 9, 'timer', 360, 720),
			// Half back, not all: a free spin let one lucky member chain a whole streak
			{ name: 'Refund', weight: 8, effect: { kind: 'refund', minMinutes: 60, maxMinutes: 120, share: 0.5 } },
			outcome('Big backfire', 8, 'timer', -480, -240),
		],
	},
	{
		tier: 'rare',
		weight: 13.5,
		outcomes: [
			outcome('Jackpot', 5, 'timer', 720, 1440),
			outcome('Happy hour', 6.5, 'happyHour', 60),
			{ name: 'Windfall', weight: 2, effect: { kind: 'windfall', times: 2 } },
		],
	},
	{
		tier: 'legendary',
		weight: 1.5,
		outcomes: [
			outcome('Drain', 0.6, 'bankDrain', 120, 360),
			outcome('Heist', 0.4, 'heist', 120, 360),
			outcome('Mercy', 0.5, 'bankBonus', 120),
		],
	},
];

export interface Roll {
	tier: Tier;
	name: string;
	effect: EffectKind;
	/** Whole minutes; only `timer` can be negative (a backfire). 0 for a windfall */
	minutes: number;
	/** Windfall only: the payout as a multiple of the spin's price */
	times?: number;
	/** Refund only: how much of the spin's price comes back */
	share?: number;
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
	if (effect.kind === 'windfall')
		return { tier: tier.tier, name, effect: effect.kind, minutes: 0, times: effect.times };
	const minutes = effect.minMinutes + Math.floor(random() * (effect.maxMinutes - effect.minMinutes + 1));
	return {
		tier: tier.tier,
		name,
		effect: effect.kind,
		minutes: Math.min(minutes, effect.maxMinutes),
		...(effect.kind === 'refund' && { share: effect.share }),
	};
}
