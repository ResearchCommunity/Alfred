import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IMAGES_DIR, listPuzzleImages } from '../../src/features/onboarding/puzzle.ts';

const Attributions = z.array(z.object({ file: z.string(), source: z.url(), author: z.string(), license: z.string() }));

describe('puzzle image pool', () => {
	it('has enough images, each with an attribution and a free license', async () => {
		const images = await listPuzzleImages();
		const attributions = Attributions.parse(
			JSON.parse(await readFile(new URL('../attributions.json', IMAGES_DIR), 'utf8')),
		);

		expect(images.length).toBeGreaterThanOrEqual(60);
		expect(attributions.map((a) => a.file).toSorted()).toEqual(images.toSorted());
		for (const { license } of attributions) expect(license).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d\.\d)/);
	});
});
