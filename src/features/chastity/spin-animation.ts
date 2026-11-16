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
	if (effect.kind === 'refund')
		return `+${span(min, max)}, ${effect.share >= 1 ? 'free' : effect.share === 0.5 ? 'half back' : `${Math.round(effect.share * 100)}% back`}`;
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

// --- Celebration: rare and legendary pulls, played right after the strip lands --------------

interface Celebration {
	seconds: number;
	/** How much the card grows at its peak */
	pop: number;
	sparks: number;
	stars: number;
	rays: boolean;
	flash: boolean;
}

const CELEBRATION: Partial<Record<Tier, Celebration>> = {
	rare: { seconds: 1, pop: 0.08, sparks: 16, stars: 0, rays: false, flash: false },
	legendary: { seconds: 1.5, pop: 0.12, sparks: 30, stars: 7, rays: true, flash: true },
};

interface Particle {
	angle: number;
	speed: number;
	size: number;
	life: number;
	star: boolean;
}

function particles(celebration: Celebration, random: () => number): Particle[] {
	return Array.from({ length: celebration.sparks + celebration.stars }, (_, i) => ({
		angle: random() * Math.PI * 2,
		speed: 140 + random() * 220,
		size: 1.5 + random() * 2.5,
		life: celebration.seconds * (0.55 + random() * 0.4),
		star: i >= celebration.sparks,
	}));
}

/** Where the winning card sits in a frame cropped at `left` */
function winnerBox(left: number) {
	const x = WIDTH / 2 + WINNER * STEP - left;
	return { x, cx: x + CARD_W / 2, cy: HEIGHT / 2 };
}

/** One celebration frame, laid over the landed frame: rays, the popping card, ring, particles, flash */
function celebrationSvg(card: Card, left: number, celebration: Celebration, parts: Particle[], t: number): string {
	const { color } = TIER_STYLE[card.tier];
	const { x, cx, cy } = winnerBox(left);
	const progress = t / celebration.seconds;
	const layers: string[] = [];

	if (celebration.rays) {
		// Fade in quickly, turn slowly, gone by the end
		const opacity = Math.sin(Math.PI * Math.min(1, progress)) ** 0.7;
		const turn = t * 30;
		const rays = Array.from({ length: 12 }, (_, i) => {
			const a = ((i * 30 + turn) * Math.PI) / 180;
			const w = (4 * Math.PI) / 180;
			const point = (angle: number) => `${cx + Math.cos(angle) * 420},${cy + Math.sin(angle) * 420}`;
			return `<polygon points="${cx},${cy} ${point(a - w)} ${point(a + w)}"/>`;
		}).join('');
		layers.push(`<g fill="url(#rays)" opacity="${opacity.toFixed(3)}">${rays}</g>`);
	}

	// The card pops up and settles back by the halfway point
	const scale = 1 + celebration.pop * Math.sin(Math.PI * Math.min(1, progress / 0.5));
	layers.push(
		`<g transform="translate(${cx} ${cy}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})">${cardSvg(card, x, true)}</g>`,
	);

	// A ring spreading out from the card
	const ring = Math.min(1, progress / 0.7);
	if (ring < 1) {
		layers.push(
			`<circle cx="${cx}" cy="${cy}" r="${(60 + ring * 220).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(6 - ring * 5).toFixed(2)}" opacity="${(0.9 * (1 - ring)).toFixed(3)}"/>`,
		);
	}

	for (const p of parts) {
		if (t >= p.life) continue;
		const px = cx + Math.cos(p.angle) * p.speed * t;
		const py = cy + Math.sin(p.angle) * p.speed * t + 160 * t * t;
		const opacity = (1 - t / p.life).toFixed(3);
		layers.push(
			p.star
				? `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${(p.size * 5).toFixed(1)}" fill="${color}" opacity="${opacity}">✦</text>`
				: `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${p.size.toFixed(2)}" fill="${color}" opacity="${opacity}"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(p.size * 0.45).toFixed(2)}" fill="#fff" opacity="${opacity}"/>`,
		);
	}

	if (celebration.flash && t < 0.3) {
		layers.push(
			`<rect width="${WIDTH}" height="${HEIGHT}" fill="${color}" opacity="${(0.45 * (1 - t / 0.3)).toFixed(3)}"/>`,
		);
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs>${GLOWS}
		<radialGradient id="rays" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="300">
			<stop offset="0" stop-color="${color}" stop-opacity="0.26"/>
			<stop offset="1" stop-color="${color}" stop-opacity="0"/>
		</radialGradient></defs>${layers.join('')}</svg>`;
}

// --- Glint: the result image of a rare or legendary pull, looping forever ---------------------

const GLINT_SWEEP_FRAMES = 15;
const GLINT_CYCLE_MS = 3000;
const SPARKLE_FRAMES = 12;
/** Where a legendary card's sparkles twinkle, relative to the card */
const SPARKLES = [
	{ x: 22, y: 46, phase: 0 },
	{ x: 104, y: 38, phase: 0.33 },
	{ x: 92, y: 112, phase: 0.66 },
];

function glintSvg(card: Card, left: number, sweep: number | null, twinkle: number | null): string {
	const { x } = winnerBox(left);
	const layers: string[] = [];
	if (sweep !== null) {
		// A soft diagonal streak crossing the card face
		const bandX = x - 90 + sweep * (CARD_W + 150);
		layers.push(
			`<g clip-path="url(#card)"><rect x="${bandX.toFixed(1)}" y="${CARD_TOP - 40}" width="56" height="${CARD_H + 80}" fill="url(#streak)" transform="skewX(-22)" transform-origin="${(bandX + 28).toFixed(1)} ${HEIGHT / 2}"/></g>`,
		);
	}
	if (twinkle !== null && card.tier === 'legendary') {
		for (const s of SPARKLES) {
			const opacity = Math.max(0, Math.sin(Math.PI * 2 * (twinkle + s.phase))) * 0.95;
			if (opacity <= 0.01) continue;
			layers.push(
				`<text x="${x + s.x}" y="${CARD_TOP + s.y}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="13" fill="#fff6d1" opacity="${opacity.toFixed(3)}">✦</text>`,
			);
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs>
		<clipPath id="card"><rect x="${x}" y="${CARD_TOP}" width="${CARD_W}" height="${CARD_H}" rx="10"/></clipPath>
		<linearGradient id="streak" x1="0" x2="1">
			<stop offset="0" stop-color="#fff" stop-opacity="0"/>
			<stop offset="0.5" stop-color="#fff" stop-opacity="0.42"/>
			<stop offset="1" stop-color="#fff" stop-opacity="0"/>
		</linearGradient></defs>${layers.join('')}</svg>`;
}

async function renderGlint(base: Buffer, card: Card, left: number, marker: Buffer): Promise<Buffer> {
	const frame = (sweep: number | null, twinkle: number | null) =>
		sharp(base)
			.composite([{ input: Buffer.from(glintSvg(card, left, sweep, twinkle)) }, { input: marker }])
			.png()
			.toBuffer();
	const sweepMs = 1000 / FPS;
	const restMs = GLINT_CYCLE_MS - GLINT_SWEEP_FRAMES * sweepMs;
	// Legendary sparkles twinkle between sweeps; a rare card just rests
	const rest = card.tier === 'legendary' ? SPARKLE_FRAMES : 1;
	const frames = await Promise.all([
		...Array.from({ length: GLINT_SWEEP_FRAMES }, (_, i) => frame(i / (GLINT_SWEEP_FRAMES - 1), null)),
		...Array.from({ length: rest }, (_, i) => frame(null, rest === 1 ? null : i / rest)),
	]);
	const delay = frames.map((_, i) => (i < GLINT_SWEEP_FRAMES ? sweepMs : restMs / rest));
	return sharp(frames, { join: { animated: true } })
		.webp({ delay, loop: 0, quality: 85, effort: 4 })
		.toBuffer();
}

// --- The spin --------------------------------------------------------------------------------

export interface RenderedSpin {
	/** The spin, plus the celebration on a rare or legendary pull; plays once */
	animation: Buffer;
	/** How long `animation` takes to play out, for timing the reveal */
	durationMs: number;
	/** What the result shows: the final frame, glinting forever on a rare or legendary pull */
	result: { name: string; data: Buffer };
}

/** Renders a spin that lands on `roll` */
export async function renderSpin(wheel: Wheel, roll: Roll, random: () => number = Math.random): Promise<RenderedSpin> {
	const cards = layOut(wheel, roll, random);
	const winner = cards[WINNER];
	if (!winner) throw new Error('No winning card');
	// Stops somewhere inside the winning card, not always dead center
	const end = WINNER * STEP + CARD_W / 2 + (random() - 0.5) * CARD_W * 0.7;
	const left = Math.round(end);
	const [moving, landed, marker] = await Promise.all([
		drawStrip(cards, false),
		drawStrip(cards, true),
		drawOverlay(),
	]);

	const crop = (strip: Buffer, offset: number, layers: Buffer[] = []) =>
		sharp(strip)
			.extract({ left: Math.round(offset), top: 0, width: WIDTH, height: HEIGHT })
			.composite([...layers.map((input) => ({ input })), { input: marker }])
			.png()
			.toBuffer();

	const spinCount = SPIN_SECONDS * FPS;
	const celebration = CELEBRATION[roll.tier];
	const parts = celebration ? particles(celebration, random) : [];
	const celebrationCount = celebration ? Math.round(celebration.seconds * FPS) : 0;
	const frames = await Promise.all([
		...Array.from({ length: spinCount }, (_, i) => crop(moving, easeOut(i / spinCount) * end)),
		...Array.from({ length: celebrationCount }, (_, i) =>
			crop(landed, left, [Buffer.from(celebrationSvg(winner, left, celebration!, parts, i / FPS))]),
		),
		crop(landed, left),
	]);
	const still = frames.at(-1);
	if (!still) throw new Error('No frames rendered');

	// The last frame stays up for a minute, in case a client loops the animation anyway
	const playing = spinCount + celebrationCount;
	const delay = frames.map((_, i) => (i < playing ? 1000 / FPS : 60_000));
	const animation = await sharp(frames, { join: { animated: true } })
		.webp({ delay, loop: 1, quality: 82, effort: 4 })
		.toBuffer();

	const result = celebration
		? {
				name: 'spin.webp',
				data: await renderGlint(
					await sharp(landed).extract({ left, top: 0, width: WIDTH, height: HEIGHT }).png().toBuffer(),
					winner,
					left,
					marker,
				),
			}
		: { name: 'spin.png', data: still };
	return { animation, durationMs: (playing * 1000) / FPS, result };
}
