import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED_IMAGES_DIR, loadImagePool, resolveImagePool } from '../../src/features/onboarding/puzzle.ts';

describe('bundled puzzle image pool', () => {
	it('has enough images, each with a source, author and free license', async () => {
		const pool = await loadImagePool(BUNDLED_IMAGES_DIR);

		expect(pool.files.length).toBeGreaterThanOrEqual(60);
		expect([...pool.info.keys()].toSorted()).toEqual(pool.files);
		for (const info of pool.info.values()) {
			expect(info.source).toBeDefined();
			expect(info.author).toBeDefined();
			expect(info.license).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d\.\d)/);
		}
	});
});

describe('resolveImagePool', () => {
	it('prefers a local folder with images, captions included', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alfred-pool-'));
		try {
			await writeFile(join(dir, 'one.jpg'), '');
			await writeFile(join(dir, 'images.json'), JSON.stringify([{ file: 'one.jpg', caption: 'A flask' }]));
			const { pool, bundled } = await resolveImagePool(dir);
			expect(bundled).toBe(false);
			expect(pool.files).toEqual(['one.jpg']);
			expect(pool.info.get('one.jpg')?.caption).toBe('A flask');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('falls back to the bundled images when the folder is missing or empty', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alfred-pool-'));
		try {
			expect((await resolveImagePool(join(dir, 'missing'))).bundled).toBe(true);
			await mkdir(join(dir, 'empty'));
			expect((await resolveImagePool(join(dir, 'empty'))).bundled).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('refuses a broken images.json instead of silently dropping captions', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alfred-pool-'));
		try {
			await writeFile(join(dir, 'one.jpg'), '');
			await writeFile(join(dir, 'images.json'), '[{"caption": "no file"}]');
			await expect(resolveImagePool(dir)).rejects.toThrow(/images\.json/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
