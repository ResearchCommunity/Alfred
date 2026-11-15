import { describe, expect, it } from 'vitest';
import type { InfoView } from '../../src/features/chastity/game.ts';
import { channelTopic } from '../../src/features/chastity/messages.ts';

const H = 3600;
const T0 = new Date('2026-11-14T12:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * H * 1000);
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

const view = (overrides: Partial<Extract<InfoView, { started: true }>> = {}): InfoView => ({
	started: true,
	mode: 'locked',
	projection: { timerSeconds: 76 * H, bankSeconds: 0, timerZeroAt: at(76), bankDryAt: null },
	multiplier: 2,
	happyHourUntil: null,
	timerRanOutAt: null,
	balanceSeconds: null,
	stretch: null,
	...overrides,
});

describe('channelTopic', () => {
	it('shows when a locked owner unlocks, live, and points to the pinned guide', () => {
		const topic = channelTopic(view());
		expect(topic).toContain(`unlocks <t:${unix(at(76))}:R> (<t:${unix(at(76))}:f>)`);
		expect(topic).toContain('adding costs 2.0x');
		expect(topic).toContain('Read the pinned message');
	});

	it('mentions a running happy hour', () => {
		expect(channelTopic(view({ multiplier: 1, happyHourUntil: at(1) }))).toContain(
			`adding costs 1.0x (happy hour, ends <t:${unix(at(1))}:R>)`,
		);
	});

	it('says since when the timer has been at zero, from the recorded moment', () => {
		const topic = channelTopic(
			view({
				projection: { timerSeconds: 0, bankSeconds: 2 * H, timerZeroAt: at(0), bankDryAt: null },
				timerRanOutAt: at(-2),
			}),
		);
		expect(topic).toContain(`the timer ran out <t:${unix(at(-2))}:R>`);
	});

	it('says the timer counts again once the unlock bank is empty while unlocked', () => {
		const topic = channelTopic(
			view({
				mode: 'unlocked',
				projection: { timerSeconds: 3 * H, bankSeconds: 0, timerZeroAt: at(3), bankDryAt: at(-1) },
			}),
		);
		expect(topic).toContain(
			`the unlock bank is empty, the timer is counting down again, runs out <t:${unix(at(3))}:R>`,
		);
		expect(topic).not.toContain('paused');
	});

	it('shows when the bank runs dry while unlocked, and the paused timer', () => {
		const topic = channelTopic(
			view({
				mode: 'unlocked',
				projection: { timerSeconds: 76 * H, bankSeconds: 5 * H, timerZeroAt: at(81), bankDryAt: at(5) },
			}),
		);
		expect(topic).toContain(`unlock bank runs dry <t:${unix(at(5))}:R>`);
		expect(topic).toContain('timer paused at 3d 4h');
	});

	it('says only that the game is paused during an emergency, or that it has not started', () => {
		expect(channelTopic(view({ mode: 'emergency' }))).toMatch(/^The game is paused · /);
		expect(channelTopic({ started: false })).toMatch(/^The game hasn't started yet · /);
	});

	it('stays within the 1024-character topic limit', () => {
		expect(channelTopic(view({ happyHourUntil: at(1) })).length).toBeLessThan(1024);
	});
});
