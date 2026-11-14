import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	isUpright,
	listPuzzleImages,
	randomStartAngle,
	remainingTilt,
	renderPuzzle,
} from '../../src/features/onboarding/puzzle.ts';

describe('puzzle math', () => {
	it.each([
		[90, -90, true],
		[350, 20, true], // wraps around: tilt 10°
		[30, -14, false], // tilt 16°
		[200, 165, true], // tilt 5°
		[180, 0, false],
	])('isUpright(%i, %i) is %s', (start, applied, expected) => {
		expect(isUpright(start, applied)).toBe(expected);
	});

	it('normalizes the remaining tilt to [-180, 180)', () => {
		expect(remainingTilt(350, 0)).toBe(-10);
		expect(remainingTilt(10, 720)).toBe(10);
		expect(remainingTilt(180, 0)).toBe(-180);
	});

	it('never starts near upright', () => {
		for (let i = 0; i < 1000; i++) {
			const angle = randomStartAngle();
			expect(angle).toBeGreaterThanOrEqual(30);
			expect(angle).toBeLessThanOrEqual(330);
		}
	});
});

describe('renderPuzzle', () => {
	let dir: string;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), 'alfred-puzzle-'));
		// Fixture: a half-blue, half-red square ("up" is the blue half)
		const half = { width: 600, height: 300, channels: 3 } as const;
		await sharp({ create: { width: 600, height: 600, channels: 3, background: '#d00' } })
			.composite([{ input: { create: { ...half, background: '#00d' } }, top: 0, left: 0 }])
			.jpeg()
			.toFile(join(dir, 'fixture.jpg'));
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('lists only image files', async () => {
		expect(await listPuzzleImages(pathToFileURL(`${dir}/`))).toEqual(['fixture.jpg']);
	});

	it('renders a 320px round WebP that differs every time', async () => {
		const url = pathToFileURL(`${dir}/`);
		const first = await renderPuzzle('fixture.jpg', 137, url);
		const second = await renderPuzzle('fixture.jpg', 137, url);

		const meta = await sharp(first).metadata();
		expect(meta).toMatchObject({ format: 'webp', width: 320, height: 320, hasAlpha: true });
		expect(Buffer.compare(first, second)).not.toBe(0);

		// Corners are transparent (circle mask), the center is opaque
		const { data, info } = await sharp(first).raw().toBuffer({ resolveWithObject: true });
		const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
		expect(alphaAt(2, 2)).toBe(0);
		expect(alphaAt(160, 160)).toBe(255);
	});

	it('cannot be tricked into reading outside the pool', async () => {
		await expect(renderPuzzle('../../etc/passwd', 90, pathToFileURL(`${dir}/`))).rejects.toThrow(
			/Input file is missing/,
		);
	});
});
