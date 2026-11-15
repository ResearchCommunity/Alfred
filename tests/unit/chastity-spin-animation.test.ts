import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderSpin, SPIN_SECONDS } from '../../src/features/chastity/spin-animation.ts';
import { DEFAULT_WHEEL, type Roll } from '../../src/features/chastity/wheel.ts';

const ROLLS = {
	common: { tier: 'common', name: 'Nudge', effect: 'timer', minutes: 60 },
	rare: { tier: 'rare', name: 'Jackpot', effect: 'timer', minutes: 900 },
	legendary: { tier: 'legendary', name: 'Heist', effect: 'heist', minutes: 200 },
} satisfies Record<string, Roll>;

/** Total play time of an animation, without the held last frame */
async function playtime(image: Buffer) {
	const { delay = [], ...meta } = await sharp(image, { animated: true }).metadata();
	return { meta, held: delay.at(-1), playing: delay.slice(0, -1).reduce((sum, ms) => sum + ms, 0) };
}

describe('spin animation', () => {
	// The encoder merges identical frames (the slow end of the spin), adding up their delays, so
	// the timing is what to check, not the frame count.
	it('plays a common pull once and leaves a still', async () => {
		const spin = await renderSpin(DEFAULT_WHEEL, ROLLS.common);
		const { meta, held, playing } = await playtime(spin.animation);
		expect(meta).toMatchObject({ format: 'webp', width: 640, pageHeight: 190, loop: 1 });
		expect(held).toBe(60_000);
		expect(playing).toBe(SPIN_SECONDS * 1000);
		expect(spin.durationMs).toBe(SPIN_SECONDS * 1000);
		expect(spin.result.name).toBe('spin.png');
		expect(await sharp(spin.result.data).metadata()).toMatchObject({ format: 'png', width: 640, height: 190 });
	});

	it('celebrates rare and legendary pulls, and leaves a glint that loops forever', async () => {
		for (const [roll, celebration] of [
			[ROLLS.rare, 1000],
			[ROLLS.legendary, 1500],
		] as const) {
			// oxlint-disable-next-line no-await-in-loop -- two cases, one after the other
			const spin = await renderSpin(DEFAULT_WHEEL, roll);
			// Within a frame: 1.5s is 37.5 frames at 25 per second
			expect(Math.abs(spin.durationMs - (SPIN_SECONDS * 1000 + celebration))).toBeLessThanOrEqual(40);
			// oxlint-disable-next-line no-await-in-loop
			expect((await playtime(spin.animation)).playing).toBe(spin.durationMs);
			expect(spin.result.name).toBe('spin.webp');
			// oxlint-disable-next-line no-await-in-loop
			const glint = await sharp(spin.result.data, { animated: true }).metadata();
			expect(glint).toMatchObject({ format: 'webp', loop: 0 });
			expect(glint.delay?.reduce((sum, ms) => sum + ms, 0)).toBe(3000);
		}
	});

	it("refuses an outcome the wheel doesn't have", async () => {
		const roll = { tier: 'rare', name: 'Nope', effect: 'timer', minutes: 1 } as const;
		await expect(renderSpin(DEFAULT_WHEEL, roll)).rejects.toThrow('no rare outcome named Nope');
	});
});
