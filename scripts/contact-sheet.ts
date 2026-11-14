// Renders a numbered grid of all images in a directory, for reviewing the puzzle pool.
//
//   node scripts/contact-sheet.ts <image-dir> <output.png> [columns] [tile]
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const [dir, output, columnsArg, tileArg] = process.argv.slice(2);
if (!dir || !output) throw new Error('Usage: node scripts/contact-sheet.ts <image-dir> <output.png> [columns] [tile]');

const columns = Number(columnsArg ?? 10);
const tile = Number(tileArg ?? 160);
const label = 22;
const files = (await readdir(dir)).filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).toSorted();
const rows = Math.ceil(files.length / columns);

const escape = (value: string) => value.replace(/[<>&]/g, '');

const tiles = await Promise.all(
	files.map(async (file, index) => {
		const image = await sharp(join(dir, file)).resize(tile, tile, { fit: 'cover' }).toBuffer();
		const caption = Buffer.from(
			`<svg width="${tile}" height="${label}"><rect width="100%" height="100%" fill="#111"/>` +
				`<text x="4" y="16" font-family="monospace" font-size="13" fill="#fff">${index + 1} ${escape(file).slice(0, 18)}</text></svg>`,
		);
		const left = (index % columns) * tile;
		const top = Math.floor(index / columns) * (tile + label);
		return [
			{ input: image, left, top },
			{ input: caption, left, top: top + tile },
		];
	}),
);

await sharp({ create: { width: columns * tile, height: rows * (tile + label), channels: 3, background: '#222' } })
	.composite(tiles.flat())
	.png()
	.toFile(output);
console.log(`${files.length} images → ${output}`);
