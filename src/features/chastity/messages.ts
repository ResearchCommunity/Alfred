import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	escapeMarkdown,
	type InteractionReplyOptions,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	userMention,
} from 'discord.js';
import type { ChastityConfig } from '../../lib/config.ts';
import { formatCurrency, formatDuration, formatMultiplier, relativeTime } from './format.ts';
import type { ActionResult, InfoView, SendResult } from './game.ts';
import type { Board, GameEvent } from './repository.ts';
import { addPriceSeconds, type Mode, type MomentKind } from './time.ts';
import type { Effect, Roll } from './wheel.ts';

// Everything the game posts. Components V2, no pings (members are named, never notified).

const ACCENT = 0xff3cac;
const GOLD = 0xf7d04a;

/** Fits both channel.send() and interaction.reply() */
interface Post {
	components: ContainerBuilder[];
	flags: MessageFlags.IsComponentsV2;
	allowedMentions: { parse: [] };
}

function post(text: string, accent = ACCENT): Post {
	return {
		components: [
			new ContainerBuilder()
				.setAccentColor(accent)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(text)),
		],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { parse: [] },
	};
}

const reasonSuffix = (reason: string | null) => (reason ? `: *${escapeMarkdown(reason, { maskedLink: true })}*` : '');

function timerLine(result: Extract<ActionResult, { ok: true }>): string {
	const { projection, mode } = result;
	const state = mode === 'unlocked' && projection.bankSeconds > 0 ? ' (paused while unlocked)' : '';
	const happyHour = result.happyHourUntil ? ` (happy hour, ends ${relativeTime(result.happyHourUntil)})` : '';
	return `-# Timer: ${formatDuration(projection.timerSeconds)} left${state} · adding now costs ${formatMultiplier(result.multiplier)}${happyHour}`;
}

function describeRoll(roll: Roll, event: GameEvent, config: ChastityConfig): string {
	const amount = formatDuration(Math.abs(roll.minutes * 60));
	const timer =
		event.timerDeltaSeconds > 0
			? `**+${formatDuration(event.timerDeltaSeconds)}** on the timer`
			: event.timerDeltaSeconds < 0
				? `**${formatDuration(-event.timerDeltaSeconds)}** off the timer`
				: `${amount} off the timer, but it was already at zero`;
	const bank = formatDuration(Math.abs(event.bankDeltaSeconds));

	if (roll.effect === 'timer') return timer;
	if (roll.effect === 'refund')
		return `${timer}, and the spin was free (${formatCurrency(event.creditSeconds, config.currencyName)} back)`;
	if (roll.effect === 'happyHour') return `adding time costs **half** for everyone for the next ${amount}`;
	if (roll.effect === 'windfall')
		return `**+${formatCurrency(event.creditSeconds, config.currencyName)}** for the spinner`;
	if (roll.effect === 'bankDrain')
		return event.bankDeltaSeconds < 0
			? `**${bank} drained** from the unlock bank`
			: 'the unlock bank was already empty';
	if (roll.effect === 'heist')
		return event.bankDeltaSeconds < 0
			? `**${bank} stolen** from the unlock bank and put on the timer (${timer})`
			: `the unlock bank was empty, so it all went on the timer (${timer})`;
	// bankBonus
	return `**+${bank}** into the unlock bank`;
}

const TIER_LABEL: Record<Roll['tier'], string> = {
	common: 'Common',
	uncommon: 'Uncommon',
	rare: 'Rare',
	legendary: 'Legendary',
};

/** The public post for a successful member action */
export function actionPost(result: Extract<ActionResult, { ok: true }>, config: ChastityConfig): Post {
	const { event } = result;
	const who = userMention(event.actorId ?? '');
	const cost = formatCurrency(event.costSeconds, config.currencyName);

	if (event.type === 'add') {
		const factor = formatMultiplier(event.multiplier ?? 1);
		return post(
			`${who} added **${formatDuration(event.timerDeltaSeconds)}** at ${factor} (${cost})${reasonSuffix(event.reason)}\n${timerLine(result)}`,
		);
	}
	if (event.type === 'remove') {
		return post(
			`${who} removed **${formatDuration(-event.timerDeltaSeconds)}** (${cost})${reasonSuffix(event.reason)}\n${timerLine(result)}`,
		);
	}

	// spin
	const roll = result.roll;
	if (!roll) throw new Error('A spin result without a roll');
	const outcome = `**${TIER_LABEL[roll.tier]} · ${escapeMarkdown(roll.name)}:** ${describeRoll(roll, event, config)}`;
	if (roll.tier === 'legendary') {
		return post(`### ✨ Legendary pull!\n${who} spun the wheel (${cost}). ${outcome}\n${timerLine(result)}`, GOLD);
	}
	return post(`${who} spun the wheel (${cost}). ${outcome}\n${timerLine(result)}`);
}

/** The owner's DM about a legendary pull */
export function legendaryDm(result: Extract<ActionResult, { ok: true }>, config: ChastityConfig): Post {
	const roll = result.roll;
	if (!roll) throw new Error('A legendary DM without a roll');
	return post(
		`### ✨ Legendary pull: ${escapeMarkdown(roll.name)}\n${userMention(result.event.actorId ?? '')}: ${describeRoll(roll, result.event, config)}.\n-# Your unlock bank: ${formatDuration(result.projection.bankSeconds)}`,
		GOLD,
	);
}

/** `3d (was 2d 4h)` for a value that just changed by `delta` */
const was = (now: number, delta: number) => `**${formatDuration(now)}** (was ${formatDuration(now - delta)})`;

/** Public posts for the owner's actions. The emergency switch says only that the game paused. */
export function ownerPost(result: Extract<ActionResult, { ok: true }>): Post {
	const owner = userMention(result.event.actorId ?? '');
	const { projection } = result;
	const { type } = result.event;
	if (type === 'start')
		return post(
			`### The game is on\n${owner} is locked with **${formatDuration(projection.timerSeconds)}** on the timer.`,
		);
	if (type === 'unlock')
		return post(
			`${owner} unlocked, spending from the unlock bank (**${formatDuration(projection.bankSeconds)}** banked).\n-# The timer is paused until they lock up again. You can still play.`,
		);
	if (type === 'relock')
		return post(
			`${owner} is locked again. **${formatDuration(projection.bankSeconds)}** left in the unlock bank.\n${timerLine(result)}`,
		);
	if (type === 'set') {
		return post(
			`${owner} set the timer to ${was(projection.timerSeconds, result.event.timerDeltaSeconds)} and the unlock bank to ${was(projection.bankSeconds, result.event.bankDeltaSeconds)}.`,
		);
	}
	if (type === 'emergency-on') return post('The game is paused.');
	return post('The game is back on.');
}

/** Channel post and owner DM for the moments the notifier watches */
export function momentMessages(kind: MomentKind, mode: Mode): { channel: Post; dm: Post } {
	if (kind === 'timer-zero' && mode === 'unlocked') {
		return {
			channel: post(
				'### The timer ran out\nThe owner is still unlocked. Once they lock up, every minute goes into the unlock bank.',
			),
			dm: post('Your timer ran out while you were unlocked. Lock up again to start filling your unlock bank.'),
		};
	}
	if (kind === 'timer-zero') {
		return {
			channel: post(
				'### The timer ran out\nThe owner stays locked, and every minute from now on goes into the unlock bank.',
			),
			dm: post('Your timer ran out. You stay locked; every minute now goes into your unlock bank.'),
		};
	}
	return {
		channel: post('The unlock bank is empty. The timer is counting down again.'),
		dm: post('Your unlock bank is empty. Please lock up again: the timer is counting down regardless.'),
	};
}

const MODE_LABEL = { locked: 'Locked', unlocked: 'Unlocked, spending the unlock bank', emergency: 'Paused' } as const;

/** `/chastity info`: everything a member needs to decide what to do */
export function infoReply(view: InfoView, config: ChastityConfig): InteractionReplyOptions {
	if (!view.started) return { content: "The game hasn't started yet.", flags: MessageFlags.Ephemeral };

	const { projection } = view;
	const lines = [
		'## Chastity',
		`**Status:** ${view.mode === 'unlocked' && projection.bankSeconds === 0 ? 'Unlocked, but the unlock bank is empty: the timer is counting down' : MODE_LABEL[view.mode]}`,
		`**Time left:** ${formatDuration(projection.timerSeconds)}`,
		`**Unlock bank:** ${formatDuration(projection.bankSeconds)}`,
		`**Adding costs:** ${formatMultiplier(view.multiplier)} per hour${view.happyHourUntil ? ` (happy hour, ends ${relativeTime(view.happyHourUntil)})` : ''}`,
		`**A spin costs:** ${formatCurrency(spinPriceSeconds(config, view.multiplier), config.currencyName)}`,
	];
	if (view.balanceSeconds !== null) {
		lines.push(
			`**Your balance:** ${formatCurrency(view.balanceSeconds, config.currencyName)}`,
			`-# You get ${config.allowancePerDayHours} per day, up to ${config.walletCapHours}. Removing costs ${config.removeCostRatio} per hour; adding and spinning follow the multiplier.`,
		);
	}
	return { ...post(lines.join('\n')), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] };
}

const BOARD_TITLE: Record<Board, string> = {
	added: 'Most time added',
	removed: 'Most time removed',
	spent: 'Biggest spenders',
	legendary: 'Most legendary pulls',
};

export function leaderboardPost(
	board: Board,
	rows: Array<{ userId: string; value: number }>,
	config: ChastityConfig,
): Post {
	const value = (n: number) =>
		board === 'legendary' ? `${n}` : board === 'spent' ? formatCurrency(n, config.currencyName) : formatDuration(n);
	const list =
		rows.length > 0
			? rows.map((row, i) => `${i + 1}. ${userMention(row.userId)}: ${value(row.value)}`).join('\n')
			: 'Nobody yet.';
	return post(`### ${BOARD_TITLE[board]}\n${list}`);
}

/** Why an action didn't go through, privately */
export function rejection(
	result: Extract<ActionResult, { ok: false }>,
	config: ChastityConfig,
): InteractionReplyOptions {
	const balance =
		result.balanceSeconds === undefined
			? ''
			: ` Your balance: ${formatCurrency(result.balanceSeconds, config.currencyName)}.`;
	return { content: `${result.reason}${balance}`, flags: MessageFlags.Ephemeral };
}

const PINNED = 'Read the pinned message to learn how to play';

/** Discord's absolute timestamp: date and time in each viewer's own time zone */
const absoluteTime = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:f>`;

/**
 * The game channel's topic. Times are Discord timestamps, which count down live in every
 * viewer's app, so the topic only needs rewriting when the game changes.
 */
export function channelTopic(view: InfoView): string {
	if (!view.started) return `The game hasn't started yet · ${PINNED}`;
	if (view.mode === 'emergency') return `The game is paused · ${PINNED}`;

	const { projection } = view;
	const price = `adding costs ${formatMultiplier(view.multiplier)}${view.happyHourUntil ? ` (happy hour, ends ${relativeTime(view.happyHourUntil)})` : ''}`;

	if (view.mode === 'unlocked' && projection.bankSeconds > 0 && projection.bankDryAt) {
		return `Unlocked · unlock bank runs dry ${relativeTime(projection.bankDryAt)} · timer paused at ${formatDuration(projection.timerSeconds)} · ${price} · ${PINNED}`;
	}
	if (view.mode === 'unlocked') {
		// The unlock bank ran dry: the timer counts down again, even before the owner relocks
		const timer =
			projection.timerSeconds > 0 && projection.timerZeroAt
				? `the timer is counting down again, runs out ${relativeTime(projection.timerZeroAt)}`
				: 'the timer ran out too';
		return `Unlocked · the unlock bank is empty, ${timer} · ${price} · ${PINNED}`;
	}
	if (projection.timerSeconds === 0) {
		const since = view.timerRanOutAt ? ` ${relativeTime(view.timerRanOutAt)}` : '';
		return `Locked · the timer ran out${since}, every minute goes into the unlock bank · ${price} · ${PINNED}`;
	}
	const unlocksAt = projection.timerZeroAt;
	const when = unlocksAt ? `unlocks ${relativeTime(unlocksAt)} (${absoluteTime(unlocksAt)})` : 'timer running';
	return `Locked · ${when} · ${price} · ${PINNED}`;
}

/** Hours-and-minutes range: `1h to 3h`, or a single value when both ends match */
function range(minMinutes: number, maxMinutes: number): string {
	const low = formatDuration(minMinutes * 60);
	const high = formatDuration(maxMinutes * 60);
	return low === high ? low : `${low} to ${high}`;
}

function describeEffect(effect: Effect, config: ChastityConfig, multiplier: number | null): string {
	if (effect.kind === 'windfall') {
		const now =
			multiplier === null
				? ''
				: `, right now ${formatCurrency(Math.round(spinPriceSeconds(config, multiplier) * effect.times), config.currencyName)}`;
		return `**${effect.times.toLocaleString('en-US')}× the spin's price** for the spinner${now}, even past the cap`;
	}
	const { minMinutes: min, maxMinutes: max } = effect;
	if (effect.kind === 'timer')
		return max < 0 ? `**−${range(-max, -min)}** off the timer` : `**+${range(min, max)}** on the timer`;
	if (effect.kind === 'refund') return `**+${range(min, max)}** on the timer, and the spin is free`;
	if (effect.kind === 'happyHour') return `Adding time costs **half** for everyone, for ${range(min, max)}`;
	if (effect.kind === 'bankDrain') return `**${range(min, max)}** drained from the unlock bank`;
	if (effect.kind === 'heist') return `**${range(min, max)}** stolen from the unlock bank and put on the timer`;
	// bankBonus
	return `**+${range(min, max)}** into the unlock bank`;
}

/** `35%`, `7.2%`, `0.5%` */
const percent = (share: number) => `${(Math.round(share * 1000) / 10).toLocaleString('en-US')}%`;

/** `/chastity wheel`: the loot table, built from the live config */
export function wheelReply(config: ChastityConfig, multiplier: number | null): InteractionReplyOptions {
	const total = config.wheel.reduce((sum, tier) => sum + tier.weight, 0);
	const container = new ContainerBuilder()
		.setAccentColor(ACCENT)
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`## The wheel\nA spin costs **${formatCurrency(config.spinCostHours * 3600, config.currencyName)} × the multiplier**${multiplier === null ? '' : `, right now **${formatCurrency(spinPriceSeconds(config, multiplier), config.currencyName)}** at ${formatMultiplier(multiplier)}`}. Happy hour halves it too.`,
			),
		);

	for (const tier of config.wheel) {
		const tierShare = tier.weight / total;
		const outcomeTotal = tier.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
		const title =
			tier.tier === 'legendary'
				? `### ✨ Legendary · ${percent(tierShare)}`
				: `### ${TIER_LABEL[tier.tier]} · ${percent(tierShare)}`;
		const lines = tier.outcomes.map(
			(outcome) =>
				`**${escapeMarkdown(outcome.name)}** · ${percent((tierShare * outcome.weight) / outcomeTotal)}\n${describeEffect(outcome.effect, config, multiplier)}`,
		);
		container
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent([title, ...lines].join('\n')));
	}

	return {
		components: [container],
		flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
		allowedMentions: { parse: [] },
	};
}

/** What a spin costs at the given multiplier */
export function spinPriceSeconds(config: ChastityConfig, multiplier: number): number {
	return addPriceSeconds(config.spinCostHours, multiplier);
}

/** The public post for `/chastity send`. Nobody is pinged. */
export function sendPost(result: Extract<SendResult, { ok: true }>, config: ChastityConfig): Post {
	const { event } = result;
	return post(
		`${userMention(event.actorId ?? '')} sent **${formatCurrency(event.costSeconds, config.currencyName)}** to ${userMention(event.targetId ?? '')}${reasonSuffix(event.reason)}`,
	);
}

/** Posted when the owner ends the game */
export function resetPost(everything: boolean): Post {
	return post(
		everything
			? 'The game was reset. Balances and leaderboards start from scratch.'
			: 'The game was reset. Balances and leaderboards stay.',
	);
}

/** Custom ID prefix of the reset confirmation button: `chastity:reset:<game|everything>:<issued at, ms>` */
export const RESET_BUTTON = 'chastity:reset:';
/** A confirmation left lying around must not wipe a later game */
export const RESET_CONFIRM_MS = 5 * 60_000;

/** Asks the owner to confirm a reset, privately */
export function resetConfirmation(everything: boolean): InteractionReplyOptions {
	return {
		content: everything
			? '**Reset the game and wipe everything?** The timer, the unlock bank, every balance and all leaderboards are deleted for good.'
			: '**Reset the game?** The timer and the unlock bank are deleted; balances and leaderboards stay. You can start a new game afterwards.',
		components: [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`${RESET_BUTTON}${everything ? 'everything' : 'game'}:${Date.now()}`)
					.setStyle(ButtonStyle.Danger)
					.setLabel(everything ? 'Reset and wipe everything' : 'Reset the game'),
			),
		],
		flags: MessageFlags.Ephemeral,
	};
}
