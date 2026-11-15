import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderSpin, SPIN_SECONDS } from '../../src/features/chastity/spin-animation.ts';
import { DEFAULT_WHEEL } from '../../src/features/chastity/wheel.ts';

describe('spin animation', () => {
	it('renders a one-shot animation and its final frame', async () => {
		const roll = { tier: 'rare', name: 'Jackpot', effect: 'timer', minutes: 900 } as const;
		const { animation, still } = await renderSpin(DEFAULT_WHEEL, roll);

		const animated = await sharp(animation, { animated: true }).metadata();
		expect(animated).toMatchObject({ format: 'webp', width: 640, pageHeight: 190, loop: 1 });
		// The spin, then the landed frame held for a minute. (The encoder merges identical frames
		// at the slow end, adding up their delays, so the timing is what to check, not the count.)
		const delays = animated.delay ?? [];
		expect(delays.at(-1)).toBe(60_000);
		expect(delays.slice(0, -1).reduce((sum, ms) => sum + ms, 0)).toBe(SPIN_SECONDS * 1000);

		expect(await sharp(still).metadata()).toMatchObject({ format: 'png', width: 640, height: 190 });
	});

	it("refuses an outcome the wheel doesn't have", async () => {
		const roll = { tier: 'rare', name: 'Nope', effect: 'timer', minutes: 1 } as const;
		await expect(renderSpin(DEFAULT_WHEEL, roll)).rejects.toThrow('no rare outcome named Nope');
	});
});
