import { type Challenge, solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { GrantResult } from '../../src/features/onboarding/grant.ts';
import { findToken, issueToken } from '../../src/features/onboarding/repository.ts';
import { onboardingRoutes } from '../../src/features/onboarding/web/routes.tsx';
import { useTestDatabase } from './helpers.ts';

const USER = '600000000000000006';
const SENTENCE = 'This server is not affiliated with any vendor';

describe('verification website', () => {
	const db = useTestDatabase();

	function setup(grant: (userId: string) => Promise<GrantResult> = async () => 'granted') {
		let clock = Date.now();
		const grantSpy = vi.fn<(userId: string) => Promise<GrantResult>>(grant);
		const app = new Hono();
		onboardingRoutes({
			db: db(),
			config: {
				verifiedRoleId: '1'.repeat(18),
				welcomeChannelId: '1'.repeat(18),
				publicUrl: 'http://localhost:3050',
				rulesContent: 'rules',
				disclaimerSentence: SENTENCE,
				welcomeMessages: ['%user%'],
			},
			altchaKey: 'test-key-that-is-long-enough-for-the-schema',
			secureCookies: false,
			grant: grantSpy,
			now: () => clock,
			altchaDifficulty: { cost: 1, maxCounter: 4 },
		})(app);

		let cookie = '';
		const request = async (path: string, form?: Record<string, string>) =>
			app.request(path, {
				method: form ? 'POST' : 'GET',
				headers: { Cookie: cookie, ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
				...(form && { body: new URLSearchParams(form).toString() }),
			});

		return {
			grant: grantSpy,
			request,
			tick: (ms: number) => {
				clock += ms;
			},
			/** Opens a fresh link, as if the member just clicked Accept */
			async open(): Promise<string> {
				const raw = await issueToken(db(), USER);
				const response = await request(`/v/${raw}`);
				expect(response.status).toBe(303);
				cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
				return raw;
			},
			async passDisclaimer(): Promise<void> {
				expect((await request('/verify/disclaimer', { sentence: `  ${SENTENCE.toUpperCase()} ` })).status).toBe(
					303,
				);
			},
			/** Loads the puzzle page and returns a solved ALTCHA payload for it */
			async loadPuzzle(): Promise<string> {
				const html = await (await request('/verify')).text();
				const attribute = /challenge="([^"]+)"/.exec(html)?.[1] ?? '';
				const challenge: Challenge = JSON.parse(attribute.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
				const solution = await solveChallenge({ challenge, deriveKey });
				return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
			},
			async angle(raw: string): Promise<number> {
				return (await findToken(db(), raw))?.puzzle?.angle ?? Number.NaN;
			},
		};
	}

	it('walks the whole flow and grants access exactly once', async () => {
		const flow = setup();
		const raw = await flow.open();
		expect(await (await flow.request('/verify')).text()).toContain('not vendor/shop support');

		await flow.passDisclaimer();
		const altcha = await flow.loadPuzzle();
		expect((await flow.request('/verify/puzzle.webp')).headers.get('content-type')).toBe('image/webp');

		flow.tick(2000);
		const response = await flow.request('/verify/puzzle', { rotation: String(-(await flow.angle(raw))), altcha });
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Welcome to the Research Community');
		expect(flow.grant).toHaveBeenCalledExactlyOnceWith(USER);

		// The link is single-use
		expect((await flow.request(`/v/${raw}`)).status).toBe(410);
	});

	it('keeps visitors on the disclaimer until they type the sentence', async () => {
		const flow = setup();
		await flow.open();
		const response = await flow.request('/verify/disclaimer', { sentence: 'whatever' });
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Please type the text exactly');
	});

	it('shows the expired page without a cookie', async () => {
		const flow = setup();
		expect((await flow.request('/verify')).status).toBe(410);
	});

	it('counts answers faster than 1.5 s as wrong', async () => {
		const flow = setup();
		const raw = await flow.open();
		await flow.passDisclaimer();
		const altcha = await flow.loadPuzzle();
		const response = await flow.request('/verify/puzzle', { rotation: String(-(await flow.angle(raw))), altcha });
		expect(response.status).toBe(303);
		expect((await findToken(db(), raw))?.attempts).toBe(1);
		expect(flow.grant).not.toHaveBeenCalled();
	});

	it('rejects a missing or foreign ALTCHA solution without counting an attempt', async () => {
		const flow = setup();
		const raw = await flow.open();
		await flow.passDisclaimer();
		await flow.loadPuzzle();
		flow.tick(2000);
		const response = await flow.request('/verify/puzzle', {
			rotation: String(-(await flow.angle(raw))),
			altcha: 'bogus',
		});
		expect(response.status).toBe(400);
		expect((await findToken(db(), raw))?.attempts).toBe(0);
	});

	it('burns the link after five wrong answers', async () => {
		const flow = setup();
		const raw = await flow.open();
		await flow.passDisclaimer();
		let last: Response | undefined;
		for (let attempt = 0; attempt < 5; attempt++) {
			// oxlint-disable-next-line no-await-in-loop -- each attempt depends on the previous one
			const altcha = await flow.loadPuzzle();
			flow.tick(2000);
			// oxlint-disable-next-line no-await-in-loop
			const upright = -(await flow.angle(raw));
			// oxlint-disable-next-line no-await-in-loop
			last = await flow.request('/verify/puzzle', { rotation: String(upright + 90), altcha });
		}
		expect(last?.status).toBe(410);
		expect(await last?.text()).toContain('Out of tries');
		expect(await findToken(db(), raw)).toBeNull();
	});

	it('tells members who left the server, and burns the link', async () => {
		const flow = setup(async () => 'not-member');
		const raw = await flow.open();
		await flow.passDisclaimer();
		const altcha = await flow.loadPuzzle();
		flow.tick(2000);
		const response = await flow.request('/verify/puzzle', { rotation: String(-(await flow.angle(raw))), altcha });
		expect(await response.text()).toContain('no longer on the server');
		expect(await findToken(db(), raw)).toBeNull();
	});

	it('grants only once when a correct answer is submitted twice at the same time', async () => {
		const flow = setup();
		const raw = await flow.open();
		await flow.passDisclaimer();
		const altcha = await flow.loadPuzzle();
		flow.tick(2000);
		const form = { rotation: String(-(await flow.angle(raw))), altcha };
		const responses = await Promise.all([
			flow.request('/verify/puzzle', form),
			flow.request('/verify/puzzle', form),
		]);
		expect(responses.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 410]);
		expect(flow.grant).toHaveBeenCalledOnce();
	});

	it('lets the visitor retry when granting fails', async () => {
		const flow = setup(async () => {
			throw new Error('Discord is down');
		});
		const raw = await flow.open();
		await flow.passDisclaimer();
		const altcha = await flow.loadPuzzle();
		flow.tick(2000);
		const response = await flow.request('/verify/puzzle', { rotation: String(-(await flow.angle(raw))), altcha });
		expect(response.status).toBe(500);
		expect((await findToken(db(), raw))?.state).toBe('disclaimer_ok');
	});

	it('explains that old captcha links are outdated', async () => {
		const flow = setup();
		const response = await flow.request('/captcha?user=123');
		expect(response.status).toBe(410);
		expect(await response.text()).toContain('outdated');
	});

	it('lists image credits', async () => {
		const flow = setup();
		expect(await (await flow.request('/verify/credits')).text()).toContain('Wikimedia Commons');
	});
});
