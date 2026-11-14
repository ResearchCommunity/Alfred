import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { container } from '@sapphire/framework';
import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from 'mongodb';
import { z } from 'zod';
import type { GrantResult } from '../grant.ts';
import type { OnboardingConfig } from '../panels.ts';
import { IMAGES_DIR, isUpright, listPuzzleImages, randomStartAngle, renderPuzzle } from '../puzzle.ts';
import {
	advance,
	deleteToken,
	findToken,
	recordFailedAttempt,
	setAltchaSignature,
	setPuzzle,
	type VerificationToken,
} from '../repository.ts';
import { type AltchaDifficulty, createAltchaChallenge, DEFAULT_DIFFICULTY, verifyAltcha } from './altcha.ts';
import { CreditsPage, DisclaimerPage, MessagePage, PuzzlePage, SuccessPage } from './pages.tsx';

export interface OnboardingWebDeps {
	db: Db;
	config: OnboardingConfig;
	altchaKey: string;
	secureCookies: boolean;
	grant: (userId: string) => Promise<GrantResult>;
	now?: () => number;
	altchaDifficulty?: AltchaDifficulty;
}

const CreditsSchema = z.array(
	z.object({ file: z.string(), source: z.string(), author: z.string(), license: z.string() }),
);

const COOKIE = 'alfred_verify';
const MAX_ATTEMPTS = 5;
const MIN_SOLVE_MS = 1500;

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const message = (c: Context, status: 400 | 404 | 409 | 410 | 500, title: string, body: string) =>
	c.html(<MessagePage title={title} body={body} />, status);
const expired = (c: Context) =>
	message(
		c,
		410,
		'This link has expired',
		'Verification links work once and only for 15 minutes. Click Accept on the rules in Discord again to get a new one.',
	);

export function onboardingRoutes(deps: OnboardingWebDeps): (app: Hono) => void {
	const { db, config } = deps;
	const now = deps.now ?? Date.now;
	let images: Promise<string[]> | undefined;
	let credits: Promise<z.infer<typeof CreditsSchema>> | undefined;

	async function currentToken(c: Context): Promise<VerificationToken | null> {
		const raw = getCookie(c, COOKIE);
		return raw ? findToken(db, raw) : null;
	}

	async function newPuzzle(hash: string): Promise<void> {
		images ??= listPuzzleImages();
		const pool = await images;
		const imageId = pool[randomInt(pool.length)];
		if (!imageId) throw new Error('The puzzle image pool is empty');
		await setPuzzle(db, hash, { imageId, angle: randomStartAngle(), issuedAt: new Date(now()) });
	}

	async function renderPuzzlePage(c: Context, token: VerificationToken, error?: string) {
		const { challenge, signature } = await createAltchaChallenge(
			deps.altchaKey,
			deps.altchaDifficulty ?? DEFAULT_DIFFICULTY,
		);
		await setAltchaSignature(db, token._id, signature);
		return c.html(
			<PuzzlePage
				altchaChallenge={JSON.stringify(challenge)}
				attemptsLeft={MAX_ATTEMPTS - token.attempts}
				{...(error && { error })}
			/>,
			error ? 400 : 200,
		);
	}

	return (app) => {
		const verify = new Hono();

		verify.onError((error, c) => {
			container.logger.error('Verification request failed', error);
			return message(
				c,
				500,
				'Something went wrong',
				'Please try again in a moment. If it keeps happening, message a moderator.',
			);
		});

		// The link from Discord: swap the token from the URL into a cookie, then show a clean URL
		verify.get('/v/:token', async (c) => {
			const raw = c.req.param('token');
			const token = await findToken(db, raw);
			if (!token) return expired(c);

			setCookie(c, COOKIE, raw, {
				path: '/verify',
				httpOnly: true,
				secure: deps.secureCookies,
				sameSite: 'Strict',
				maxAge: Math.max(1, Math.floor((token.expiresAt.getTime() - now()) / 1000)),
			});
			return c.redirect('/verify', 303);
		});

		verify.get('/verify', async (c) => {
			const token = await currentToken(c);
			if (!token) return expired(c);

			if (token.state === 'issued') return c.html(<DisclaimerPage sentence={config.disclaimerSentence} />);
			if (token.state === 'granting') {
				return message(
					c,
					409,
					'Almost there',
					'Your verification is being processed. Refresh in a few seconds.',
				);
			}
			if (!token.puzzle) await newPuzzle(token._id);
			return renderPuzzlePage(c, token);
		});

		verify.post('/verify/disclaimer', async (c) => {
			const token = await currentToken(c);
			if (!token || token.state !== 'issued') return expired(c);

			const body = await c.req.parseBody();
			const typed = typeof body.sentence === 'string' ? body.sentence : '';
			if (normalize(typed) !== normalize(config.disclaimerSentence)) {
				return c.html(
					<DisclaimerPage
						sentence={config.disclaimerSentence}
						error="That doesn't match. Please type the text exactly."
					/>,
					400,
				);
			}

			await advance(db, token._id, 'issued', 'disclaimer_ok');
			return c.redirect('/verify', 303);
		});

		verify.get('/verify/puzzle.webp', async (c) => {
			const token = await currentToken(c);
			if (!token?.puzzle || token.state !== 'disclaimer_ok') return c.notFound();

			const image = await renderPuzzle(token.puzzle.imageId, token.puzzle.angle);
			return c.body(new Uint8Array(image), 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
		});

		verify.post('/verify/puzzle', async (c) => {
			const token = await currentToken(c);
			if (!token?.puzzle || token.state !== 'disclaimer_ok') return expired(c);

			const body = await c.req.parseBody();
			const rotation = Number(body.rotation);
			const altcha = typeof body.altcha === 'string' ? body.altcha : '';

			if (!token.altchaSignature || !(await verifyAltcha(altcha, deps.altchaKey, token.altchaSignature))) {
				return renderPuzzlePage(
					c,
					token,
					'Your browser did not finish its background check. Please try again.',
				);
			}

			const tooFast = now() - token.puzzle.issuedAt.getTime() < MIN_SOLVE_MS;
			if (tooFast || !Number.isFinite(rotation) || !isUpright(token.puzzle.angle, rotation)) {
				const attempts = await recordFailedAttempt(db, token._id);
				if (attempts >= MAX_ATTEMPTS) {
					await deleteToken(db, token._id);
					deleteCookie(c, COOKIE, { path: '/verify' });
					return message(c, 410, 'Out of tries', 'Click Accept on the rules in Discord again to start over.');
				}
				await newPuzzle(token._id);
				return c.redirect('/verify', 303);
			}

			// Only one request can move the token into `granting`; a double submit loses here
			if (!(await advance(db, token._id, 'disclaimer_ok', 'granting'))) return expired(c);

			let result: GrantResult;
			try {
				result = await deps.grant(token.userId);
			} catch (error) {
				// Hand the token back so the visitor can simply try again
				await advance(db, token._id, 'granting', 'disclaimer_ok');
				throw error;
			}

			await deleteToken(db, token._id);
			deleteCookie(c, COOKIE, { path: '/verify' });
			if (result === 'not-member') {
				return message(
					c,
					410,
					"You're no longer on the server",
					'Rejoin the server and click Accept on the rules again.',
				);
			}
			return c.html(<SuccessPage />);
		});

		verify.get('/verify/credits', async (c) => {
			credits ??= readFile(new URL('../attributions.json', IMAGES_DIR), 'utf8').then((text) =>
				CreditsSchema.parse(JSON.parse(text)),
			);
			return c.html(<CreditsPage credits={await credits} />);
		});

		// Links from the old bot
		verify.get('/captcha', (c) =>
			message(
				c,
				410,
				'This link is outdated',
				'Click Accept on the rules in Discord again to get a new verification link.',
			),
		);

		app.route('/', verify);
	};
}
