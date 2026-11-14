import { randomBytes, randomInt } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Same relative depth from src/ and dist/, so this resolves in tests and in production */
export const IMAGES_DIR = new URL('../../../assets/verification/images/', import.meta.url);

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

export async function listPuzzleImages(dir: URL = IMAGES_DIR): Promise<string[]> {
	return (await readdir(dir)).filter((file) => IMAGE_EXTENSIONS.test(file));
}

/**
 * Renders the puzzle image as the visitor will see it: turned by `angle` degrees,
 * cropped to a circle (square corners would give the angle away), slightly
 * jittered so the same source never yields byte-identical output, WebP, no metadata.
 */
export async function renderPuzzle(imageId: string, angle: number, dir: URL = IMAGES_DIR): Promise<Buffer> {
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
