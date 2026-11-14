import { randomBytes, randomInt } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';

/**
 * The lab photos committed to the repo. Same relative depth from src/ and dist/, so this
 * resolves in tests and in production. Used when no local pool is set up.
 */
export const BUNDLED_IMAGES_DIR = new URL('../../../assets/verification/images/', import.meta.url);

/** Optional per-image details, kept as `images.json` next to the images */
export const IMAGE_MANIFEST = 'images.json';

export const ImageInfoSchema = z.object({
	file: z.string().min(1),
	/** Shown to the visitor after they answered, never during the puzzle */
	caption: z.string().min(1).optional(),
	source: z.url({ protocol: /^https?$/ }).optional(),
	author: z.string().min(1).optional(),
	license: z.string().min(1).optional(),
});

export type ImageInfo = z.infer<typeof ImageInfoSchema>;

export interface ImagePool {
	dir: URL;
	files: string[];
	info: ReadonlyMap<string, ImageInfo>;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const OUTPUT_SIZE = 320;
const WORK_SIZE = Math.round(OUTPUT_SIZE * 1.5);

/** Never close to upright, so "submit without touching" can't pass */
export function randomStartAngle(): number {
	return randomInt(30, 331);
}

/** Tilt left after the visitor's rotation, normalized to [-180, 180) */
export function remainingTilt(startAngle: number, appliedRotation: number): number {
	return ((((startAngle + appliedRotation) % 360) + 540) % 360) - 180;
}

export function isUpright(startAngle: number, appliedRotation: number, tolerance = 15): boolean {
	return Math.abs(remainingTilt(startAngle, appliedRotation)) <= tolerance;
}

export async function listPuzzleImages(dir: URL = BUNDLED_IMAGES_DIR): Promise<string[]> {
	return (await readdir(dir)).filter((file) => IMAGE_EXTENSIONS.test(file)).toSorted();
}

const isMissing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** Reads a pool directory. The manifest is optional; images without an entry just have no caption. */
export async function loadImagePool(dir: URL): Promise<ImagePool> {
	const files = await listPuzzleImages(dir);
	let entries: ImageInfo[] = [];
	try {
		const text = await readFile(new URL(IMAGE_MANIFEST, dir), 'utf8');
		entries = z.array(ImageInfoSchema).parse(JSON.parse(text));
	} catch (error) {
		if (!isMissing(error)) throw new Error(`Invalid ${IMAGE_MANIFEST} in ${fileURLToPath(dir)}`, { cause: error });
	}
	return { dir, files, info: new Map(entries.map((entry) => [entry.file, entry])) };
}

/**
 * The local pool at `path` (kept out of git) if it holds any images, else the bundled
 * lab photos. A missing or empty folder is not an error: compose creates an empty one
 * for a bind mount whose source doesn't exist.
 */
export async function resolveImagePool(path: string): Promise<{ pool: ImagePool; bundled: boolean }> {
	const dir = pathToFileURL(resolve(path) + sep);
	try {
		const local = await loadImagePool(dir);
		if (local.files.length > 0) return { pool: local, bundled: false };
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	return { pool: await loadImagePool(BUNDLED_IMAGES_DIR), bundled: true };
}

/**
 * Renders the puzzle image as the visitor will see it: turned by `angle` degrees,
 * cropped to a circle (square corners would give the angle away), slightly
 * jittered so the same source never yields byte-identical output, WebP, no metadata.
 */
export async function renderPuzzle(imageId: string, angle: number, dir: URL = BUNDLED_IMAGES_DIR): Promise<Buffer> {
	const path = fileURLToPath(new URL(basename(imageId), dir));

	// Rotating grows the canvas with transparent corners. The circle inscribed in the
	// original square is untouched by rotation, so cropping the center back to the
	// original size and masking that circle never shows a corner.
	const rotated = await sharp(path)
		.resize(WORK_SIZE, WORK_SIZE, { fit: 'cover' })
		.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer({ resolveWithObject: true });
	const left = Math.floor((rotated.info.width - WORK_SIZE) / 2);
	const top = Math.floor((rotated.info.height - WORK_SIZE) / 2);

	// Sharp runs composite after resize, so the overlays are made at output size
	const radius = OUTPUT_SIZE / 2;
	const circle = Buffer.from(
		`<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#fff"/></svg>`,
	);

	// Faint grey noise, different every time
	const noise = randomBytes(OUTPUT_SIZE * OUTPUT_SIZE * 4);
	for (let i = 3; i < noise.length; i += 4) noise[i] = (noise[i] ?? 0) % 14;

	return sharp(rotated.data)
		.extract({ left, top, width: WORK_SIZE, height: WORK_SIZE })
		.modulate({ hue: randomInt(-8, 9), brightness: 0.95 + Math.random() * 0.1 })
		.composite([
			{ input: noise, raw: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4 }, blend: 'over' },
			{ input: circle, blend: 'dest-in' },
		])
		.resize(OUTPUT_SIZE, OUTPUT_SIZE)
		.webp({ quality: 80 })
		.toBuffer();
}
