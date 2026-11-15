import sharp from 'sharp';
import { formatDuration } from './format.ts';
import type { Roll, Tier, Wheel } from './wheel.ts';

// The wheel spin as a case opening: a strip of outcome cards scrolls past a marker, slows down
// and stops on the outcome that was already rolled. The strip is drawn once (SVG through sharp);
// every frame is a crop of it, so rendering a spin takes about a second.

type Outcome = Wheel[number]['outcomes'][number];
interface Card {
	tier: Tier;
	outcome: Outcome;
}

const WIDTH = 640;
const HEIGHT = 190;
const CARD_W = 128;
const CARD_H = 140;
const STEP = CARD_W + 10;
const CARD_TOP = (HEIGHT - CARD_H) / 2;
const CARDS = 48;
const WINNER = 41;
const FPS = 25;
/** How long the animation runs; the reveal waits a little longer than this */
export const SPIN_SECONDS = 5;

const BACKGROUND = '#111214';
const MARKER_COLOR = '#8b5cf6';
const FONT = 'DejaVu Sans, sans-serif';

const TIER_STYLE: Record<Tier, { label: string; color: string }> = {
	common: { label: 'COMMON', color: '#8b98ad' },
	uncommon: { label: 'UNCOMMON', color: '#4f8cff' },
	rare: { label: 'RARE', color: '#b45cff' },
	legendary: { label: '✦ LEGENDARY', color: '#f7d04a' },
};

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const span = (min: number, max: number) =>
	min === max ? formatDuration(min * 60) : `${formatDuration(min * 60)}–${formatDuration(max * 60)}`;

/** The short line under an outcome's name */
function cardAmount({ effect }: Outcome): string {
	if (effect.kind === 'windfall') return `${effect.times.toLocaleString('en-US')}× spin price`;
	const { minMinutes: min, maxMinutes: max } = effect;
	if (effect.kind === 'timer') return max < 0 ? `−${span(-max, -min)}` : `+${span(min, max)}`;
	if (effect.kind === 'refund') return `+${span(min, max)}, free`;
	if (effect.kind === 'happyHour') return `${span(min, max)} half price`;
	if (effect.kind === 'bankDrain') return `−${span(min, max)} bank`;
	if (effect.kind === 'heist') return `${span(min, max)} bank → timer`;
	return `+${span(min, max)} bank`;
}

function cardSvg(card: Card, x: number, landed: boolean): string {
	const { label, color } = TIER_STYLE[card.tier];
	const nameSize = card.outcome.name.length > 10 ? 14 : 16;
	return `<g transform="translate(${x},${CARD_TOP})">
		<rect width="${CARD_W}" height="${CARD_H}" rx="10" fill="#1d1f25"/>
		<rect width="${CARD_W}" height="${CARD_H}" rx="10" fill="url(#glow-${card.tier}${landed ? '-landed' : ''})"/>
		<rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="10" fill="none" stroke="${color}" stroke-opacity="${landed ? 1 : 0.35}" stroke-width="${landed ? 3 : 1}"/>
		<text x="${CARD_W / 2}" y="30" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="10" letter-spacing="1.5" fill="${color}">${escapeXml(label)}</text>
		<text x="${CARD_W / 2}" y="${CARD_H / 2 + 8}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${nameSize}" fill="#f2f3f5">${escapeXml(card.outcome.name)}</text>
		<text x="${CARD_W / 2}" y="${CARD_H / 2 + 30}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="#b5bac1">${escapeXml(cardAmount(card.outcome))}</text>
		<rect x="14" y="${CARD_H - 9}" width="${CARD_W - 28}" height="4" rx="2" fill="${color}"/>
	</g>`;
}

const GLOWS = Object.entries(TIER_STYLE)
	.flatMap(([tier, { color }]) =>
		[false, true].map(
			(
				landed,
			) => `<radialGradient id="glow-${tier}${landed ? '-landed' : ''}" cx="50%" cy="100%" r="${landed ? 110 : 85}%">
				<stop offset="0" stop-color="${color}" stop-opacity="${landed ? 0.55 : 0.28}"/>
				<stop offset="1" stop-color="${color}" stop-opacity="0"/>
			</radialGradient>`,
		),
	)
	.join('');

/** The whole strip, with the winning card lit up or not */
function drawStrip(cards: Card[], landed: boolean): Promise<Buffer> {
	const width = CARDS * STEP + WIDTH;
	const body = cards.map((card, i) => cardSvg(card, WIDTH / 2 + i * STEP, landed && i === WINNER)).join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}"><defs>${GLOWS}</defs><rect width="100%" height="100%" fill="${BACKGROUND}"/>${body}</svg>`;
	return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Marker and fading edges, laid over every frame */
let overlay: Promise<Buffer> | undefined;
function drawOverlay(): Promise<Buffer> {
	const c = WIDTH / 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
		<defs>
			<linearGradient id="fade" x1="0" x2="1">
				<stop offset="0" stop-color="${BACKGROUND}" stop-opacity="1"/>
				<stop offset="0.22" stop-color="${BACKGROUND}" stop-opacity="0"/>
				<stop offset="0.78" stop-color="${BACKGROUND}" stop-opacity="0"/>
				<stop offset="1" stop-color="${BACKGROUND}" stop-opacity="1"/>
			</linearGradient>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
		<rect x="${c - 1}" y="8" width="2" height="${HEIGHT - 16}" rx="1" fill="${MARKER_COLOR}" fill-opacity="0.85"/>
		<path d="M${c - 9} 4 L${c + 9} 4 L${c} 16 Z" fill="${MARKER_COLOR}"/>
		<path d="M${c - 9} ${HEIGHT - 4} L${c + 9} ${HEIGHT - 4} L${c} ${HEIGHT - 16} Z" fill="${MARKER_COLOR}"/>
	</svg>`;
	overlay ??= sharp(Buffer.from(svg)).png().toBuffer();
	return overlay;
}

/** A card picked with the wheel's real weights */
function pick<T extends { weight: number }>(items: readonly T[], random: () => number): T {
	let point = random() * items.reduce((sum, item) => sum + item.weight, 0);
	for (const item of items) {
		point -= item.weight;
		if (point < 0) return item;
	}
	const last = items.at(-1);
	if (!last) throw new Error('Cannot pick from an empty list');
	return last;
}

function randomCard(wheel: Wheel, random: () => number): Card {
	const tier = pick(wheel, random);
	return { tier: tier.tier, outcome: pick(tier.outcomes, random) };
}

/** The strip's cards: random filler at the real odds, the rolled outcome at WINNER */
function layOut(wheel: Wheel, roll: Roll, random: () => number): Card[] {
	const tier = wheel.find((t) => t.tier === roll.tier);
	const outcome = tier?.outcomes.find((o) => o.name === roll.name);
	if (!outcome) throw new Error(`The wheel has no ${roll.tier} outcome named ${roll.name}`);
	const cards = Array.from({ length: CARDS }, () => randomCard(wheel, random));
	cards[WINNER] = { tier: roll.tier, outcome };
	// A near miss is part of the fun: often a legendary right next to the winner. Purely visual,
	// the outcome was rolled before any of this.
	const legendary = wheel.find((t) => t.tier === 'legendary');
	if (legendary && roll.tier !== 'legendary' && random() < 0.6) {
		cards[WINNER + (random() < 0.5 ? 1 : -1)] = { tier: 'legendary', outcome: pick(legendary.outcomes, random) };
	}
	return cards;
}

/** Fast at first, a long slow crawl at the end */
const easeOut = (t: number) => 1 - (1 - t) ** 4;

/**
 * Renders a spin that lands on `roll`: an animated WebP that plays once and holds its last
 * frame, and that last frame as a PNG (for the reveal, so nobody is left with a looping image).
 */
export async function renderSpin(
	wheel: Wheel,
	roll: Roll,
	random: () => number = Math.random,
): Promise<{ animation: Buffer; still: Buffer }> {
	const cards = layOut(wheel, roll, random);
	// Stops somewhere inside the winning card, not always dead center
	const end = WINNER * STEP + CARD_W / 2 + (random() - 0.5) * CARD_W * 0.7;
	const [moving, landed, marker] = await Promise.all([
		drawStrip(cards, false),
		drawStrip(cards, true),
		drawOverlay(),
	]);

	const frame = (strip: Buffer, offset: number) =>
		sharp(strip)
			.extract({ left: Math.round(offset), top: 0, width: WIDTH, height: HEIGHT })
			.composite([{ input: marker }])
			.png()
			.toBuffer();
	const count = SPIN_SECONDS * FPS;
	const frames = await Promise.all([
		...Array.from({ length: count }, (_, i) => frame(moving, easeOut(i / count) * end)),
		frame(landed, end),
	]);
	const still = frames.at(-1);
	if (!still) throw new Error('No frames rendered');

	// The last frame stays up for a minute, in case a client loops the animation anyway
	const delay = frames.map((_, i) => (i < count ? 1000 / FPS : 60_000));
	const animation = await sharp(frames, { join: { animated: true } })
		.webp({ delay, loop: 1, quality: 82, effort: 4 })
		.toBuffer();
	return { animation, still };
}
