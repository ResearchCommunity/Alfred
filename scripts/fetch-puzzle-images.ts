// Downloads candidate lab photos for the verification puzzle from Wikimedia Commons,
// keeping only freely licensed files and recording attribution.
//
//   node scripts/fetch-puzzle-images.ts <output-dir> [perCategory]
//
// Candidates land in <output-dir> (with candidates.json) for manual review. The chosen
// ones are then copied into assets/verification/images/ along with their attribution.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

const CATEGORIES = [
	'Erlenmeyer_flasks',
	'Beakers',
	'Volumetric_flasks',
	'Round-bottom_flasks',
	'Test_tube_racks',
	'Test_tubes',
	'Bunsen_burners',
	'Burettes',
	'Separatory_funnels',
	'Retort_stands',
	'Optical_microscopes',
	'Laboratory_glassware',
	'Chemists_at_work',
	'Laboratory_technicians',
	'Distillation_apparatus',
];

const ALLOWED_LICENSE = /^(CC0|Public domain|CC BY(-SA)? \d\.\d)/i;
const USER_AGENT = 'AlfredBot/2.0 (https://github.com/ResearchCommunity/Alfred)';
const SIZE = 512;

const ApiResponse = z.object({
	query: z
		.object({
			pages: z.record(
				z.string(),
				z.object({
					title: z.string(),
					imageinfo: z
						.array(
							z.object({
								width: z.number(),
								height: z.number(),
								mime: z.string(),
								thumburl: z.string().optional(),
								descriptionurl: z.string(),
								extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).optional(),
							}),
						)
						.optional(),
				}),
			),
		})
		.optional(),
});

const text = (value: unknown) =>
	typeof value === 'string'
		? value
				.replace(/<[^>]*>/g, '')
				.replace(/\s+/g, ' ')
				.trim()
		: '';

const [outputDir, perCategoryArg] = process.argv.slice(2);
if (!outputDir) throw new Error('Usage: node scripts/fetch-puzzle-images.ts <output-dir> [perCategory]');
const perCategory = Number(perCategoryArg ?? 15);
await mkdir(outputDir, { recursive: true });

const candidates: Array<{ file: string; source: string; author: string; license: string; title: string }> = [];

for (const category of CATEGORIES) {
	const params = new URLSearchParams({
		action: 'query',
		format: 'json',
		generator: 'categorymembers',
		gcmtitle: `Category:${category}`,
		gcmtype: 'file',
		gcmlimit: '200',
		prop: 'imageinfo',
		iiprop: 'url|size|mime|extmetadata',
		iiurlwidth: '800',
		iiextmetadatafilter: 'LicenseShortName|Artist',
	});
	// oxlint-disable-next-line no-await-in-loop -- be gentle with the Commons API
	const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
		headers: { 'User-Agent': USER_AGENT },
	});
	// oxlint-disable-next-line no-await-in-loop
	const pages = Object.values(ApiResponse.parse(await response.json()).query?.pages ?? {});

	let taken = 0;
	for (const page of pages) {
		if (taken >= perCategory) break;
		const info = page.imageinfo?.[0];
		const license = text(info?.extmetadata?.LicenseShortName?.value);
		if (!info?.thumburl || !/^image\/(jpeg|png)$/.test(info.mime)) continue;
		if (Math.min(info.width, info.height) < SIZE || !ALLOWED_LICENSE.test(license)) continue;

		const file = `${category.toLowerCase()}-${String(taken + 1).padStart(2, '0')}.jpg`;
		try {
			// oxlint-disable-next-line no-await-in-loop
			const image = await fetch(info.thumburl, { headers: { 'User-Agent': USER_AGENT } });
			// oxlint-disable-next-line no-await-in-loop
			await sharp(Buffer.from(await image.arrayBuffer()))
				.resize(SIZE, SIZE, { fit: 'cover' })
				.jpeg({ quality: 85 })
				.toFile(join(outputDir, file));
		} catch (error) {
			console.warn(`Skipping ${page.title}:`, error);
			continue;
		}

		candidates.push({
			file,
			source: info.descriptionurl,
			author: text(info.extmetadata?.Artist?.value) || 'Unknown',
			license,
			title: page.title,
		});
		taken++;
	}
	console.log(`${category}: ${taken}`);
}

await writeFile(join(outputDir, 'candidates.json'), `${JSON.stringify(candidates, null, '\t')}\n`);
console.log(`${candidates.length} candidates written to ${outputDir}`);
