import { randomInt } from 'node:crypto';
import { container } from '@sapphire/framework';
import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from 'mongodb';
import type { GrantResult } from '../grant.ts';
import type { OnboardingConfig } from '../panels.ts';
import { type ImagePool, isUpright, randomStartAngle, renderPuzzle } from '../puzzle.ts';
import {
	advance,
	claimAltcha,
	deleteToken,
	findToken,
	recordFailedAttempt,
	setAltchaSignature,
	setPuzzle,
	setPuzzleIfMissing,
	startPuzzleClock,
	TOKEN_TTL_MS,
	type PuzzleState,
	type VerificationToken,
} from '../repository.ts';
import {
	type AltchaDifficulty,
	altchaSignatureOf,
	createAltchaChallenge,
	DEFAULT_DIFFICULTY,
	verifyAltcha,
} from './altcha.ts';
import { DisclaimerPage, MessagePage, PuzzlePage, SuccessPage } from './pages.tsx';

export interface OnboardingWebDeps {
	db: Db;
	config: OnboardingConfig;
	altchaKey: string;
	secureCookies: boolean;
	grant: (userId: string) => Promise<GrantResult>;
	images: ImagePool;
	now?: () => number;
	altchaDifficulty?: AltchaDifficulty;
}

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
	const { db, config, images } = deps;
	const now = deps.now ?? Date.now;

	async function currentToken(c: Context): Promise<VerificationToken | null> {
		const raw = getCookie(c, COOKIE);
		return raw ? findToken(db, raw) : null;
	}

	/**
	 * Turned puzzle pictures rendered ahead of time, by token hash: while the visitor is still
	 * typing the disclaimer sentence, and right after a wrong answer. The puzzle page then
	 * arrives with its picture inline instead of waiting on a render and a second request.
	 */
	const prepared = new Map<string, { imageId: string; angle: number; image: Promise<Buffer> }>();

	function prepare(hash: string, puzzle: PuzzleState): void {
		const entry = { ...puzzle, image: renderPuzzle(puzzle.imageId, puzzle.angle, images.dir) };
		// A failed render surfaces when the page awaits it (or the page renders again)
		entry.image.catch(() => {});
		prepared.set(hash, entry);
		// Abandoned links: forget the picture once the token would have expired anyway
		setTimeout(() => {
			if (prepared.get(hash) === entry) prepared.delete(hash);
		}, TOKEN_TTL_MS).unref();
	}

	/** The prepared picture for this puzzle if there is one, else a fresh render */
	function takePuzzleImage(hash: string, puzzle: PuzzleState): Promise<Buffer> {
		const entry = prepared.get(hash);
		prepared.delete(hash);
		return entry?.imageId === puzzle.imageId && entry.angle === puzzle.angle
			? entry.image
			: renderPuzzle(puzzle.imageId, puzzle.angle, images.dir);
	}

	function randomPuzzle(): PuzzleState {
		const imageId = images.files[randomInt(images.files.length)];
		if (!imageId) throw new Error('The puzzle image pool is empty');
		return { imageId, angle: randomStartAngle(), issuedAt: new Date(now()) };
	}

	async function newPuzzle(hash: string): Promise<PuzzleState> {
		const puzzle = randomPuzzle();
		await setPuzzle(db, hash, puzzle);
		prepare(hash, puzzle);
		return puzzle;
	}

	/** Picks and renders the first puzzle in the background, so it's ready when the disclaimer is done */
	function preparePuzzleEarly(hash: string): void {
		const puzzle = randomPuzzle();
		setPuzzleIfMissing(db, hash, puzzle).then(
			(set) => set && prepare(hash, puzzle),
			(error: unknown) => container.logger.warn('Could not prepare a puzzle early', error),
		);
	}

	async function renderPuzzlePage(c: Context, token: VerificationToken & { puzzle: PuzzleState }, error?: string) {
		const [{ challenge, signature }, image] = await Promise.all([
			createAltchaChallenge(deps.altchaKey, deps.altchaDifficulty ?? DEFAULT_DIFFICULTY),
			takePuzzleImage(token._id, token.puzzle),
		]);
		await Promise.all([
			setAltchaSignature(db, token._id, signature),
			startPuzzleClock(db, token._id, new Date(now())),
		]);
		return c.html(
			<PuzzlePage
				image={`data:image/webp;base64,${image.toString('base64')}`}
				altchaChallenge={JSON.stringify(challenge)}
				attemptsLeft={MAX_ATTEMPTS - token.attempts}
				caption={images.info.get(token.puzzle.imageId)?.caption}
				missed={token.attempts > 0}
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
				// Lax, not Strict: a link clicked in Discord's web client is a cross-site navigation, and
				// browsers withhold Strict cookies for its whole redirect chain. Lax still keeps the
				// cookie off cross-site POSTs, which is what protects the forms.
				sameSite: 'Lax',
				maxAge: Math.max(1, Math.floor((token.expiresAt.getTime() - now()) / 1000)),
			});
			return c.redirect('/verify', 303);
		});

		verify.get('/verify', async (c) => {
			const token = await currentToken(c);
			if (!token) return expired(c);

			if (token.state === 'issued') {
				if (!token.puzzle) preparePuzzleEarly(token._id);
				return c.html(<DisclaimerPage sentence={config.disclaimerSentence} />);
			}
			if (token.state === 'granting') {
				return message(
					c,
					409,
					'Almost there',
					'Your verification is being processed. Refresh in a few seconds.',
				);
			}
			// Render from the fresh puzzle, so the first picture's caption shows too
			return renderPuzzlePage(c, { ...token, puzzle: token.puzzle ?? (await newPuzzle(token._id)) });
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

		verify.post('/verify/puzzle', async (c) => {
			const token = await currentToken(c);
			if (!token?.puzzle || token.state !== 'disclaimer_ok') return expired(c);

			const body = await c.req.parseBody();
			const rotation = Number(body.rotation);
			const altcha = typeof body.altcha === 'string' ? body.altcha : '';

			// Spend the proof-of-work first: one solved challenge buys one answer, so a script
			// can't fire a burst of answers covering every angle with a single solution
			const signature = altchaSignatureOf(altcha);
			const claimed = signature ? await claimAltcha(db, token._id, signature) : null;
			if (!claimed?.puzzle || !signature || !(await verifyAltcha(altcha, deps.altchaKey, signature))) {
				return renderPuzzlePage(
					c,
					{ ...token, puzzle: token.puzzle },
					'Your browser did not finish its background check. Please try again.',
				);
			}
			const { puzzle } = claimed;

			const tooFast = now() - puzzle.issuedAt.getTime() < MIN_SOLVE_MS;
			if (tooFast || !Number.isFinite(rotation) || !isUpright(puzzle.angle, rotation)) {
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
