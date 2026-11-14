import type { Child, FC } from 'hono/jsx';

const STEPS = ['Not a shop', 'Puzzle', 'Done'] as const;
type Step = (typeof STEPS)[number];

export const Layout: FC<{ title: string; step?: Step; compact?: boolean; children: Child }> = ({
	title,
	step,
	compact = false,
	children,
}) => (
	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="referrer" content="no-referrer" />
			<meta name="robots" content="noindex" />
			<title>{`${title} · Research Community`}</title>
			<link rel="icon" href="/assets/favicon.png" />
			<link rel="stylesheet" href="/assets/verify.css" />
		</head>
		<body>
			<main class={compact ? 'panel compact' : 'panel'}>
				<header class="panel-head">
					<img class="logo" src="/assets/logo.webp" alt="Research Community" width="72" height="72" />
					{step && (
						<ol class="steps" aria-label="Progress">
							{STEPS.map((name) => (
								<li
									class={name === step ? 'active' : ''}
									aria-current={name === step ? 'step' : undefined}
								>
									{name}
								</li>
							))}
						</ol>
					)}
				</header>
				{children}
			</main>
			<footer>
				<a href="https://github.com/ResearchCommunity/Alfred" rel="noreferrer">
					Source code
				</a>
			</footer>
		</body>
	</html>
);

export const DisclaimerPage: FC<{ sentence: string; error?: string }> = ({ sentence, error }) => (
	<Layout title="This is not vendor support" step="Not a shop">
		<h1>This is not vendor/shop support!</h1>
		<p>This server is not affiliated with any vendor or shop, no matter where you found a link to it.</p>
		<p>We cannot and will not answer any vendor- or shop-specific questions you may have.</p>
		<p>Our rules also forbid mentioning any vendors or shops, as per Discord's terms of service.</p>
		<form method="post" action="/verify/disclaimer" class="disclaimer">
			<label for="sentence">To show that you understand this, type the following text:</label>
			<p class="sentence" aria-hidden="true">
				{sentence}
			</p>
			<input id="sentence" name="sentence" type="text" autocomplete="off" spellcheck={false} required />
			{error && <p class="error">{error}</p>}
			<button type="submit">Continue</button>
		</form>
	</Layout>
);

/** What a puzzle picture showed. Only ever shown after it was answered: it would be a hint before. */
export const PuzzlePage: FC<{
	/** The turned picture, inline (data: URL), so it arrives with the page */
	image: string;
	altchaChallenge: string;
	attemptsLeft: number;
	/** What the picture shows, read while turning it */
	caption?: string | undefined;
	/** After a wrong answer, the page says so above the new picture */
	missed: boolean;
	error?: string;
}> = ({ image, altchaChallenge, attemptsLeft, caption, missed, error }) => (
	<Layout title="Set history straight" step="Puzzle" compact>
		<h1>Set history straight</h1>
		{missed ? (
			<p class="intro error">Not quite upright. Here's a new picture.</p>
		) : (
			<p class="intro">Turn the picture until it stands the right way up.</p>
		)}
		<form method="post" action="/verify/puzzle" class="puzzle" id="puzzle">
			<div class="puzzle-turn">
				<div class="puzzle-image">
					<img
						src={image}
						alt="A picture, turned at a random angle"
						width="320"
						height="320"
						draggable={false}
					/>
				</div>
				<label for="rotation" class="visually-hidden">
					Rotation in degrees (arrow keys turn by 5°, with Shift by 15°)
				</label>
				<input id="rotation" name="rotation" type="range" min="-180" max="180" step="1" value="0" />
			</div>
			<div class="puzzle-side">
				{caption && (
					<aside class="about-picture" aria-label="What the picture shows">
						<p>{caption}</p>
					</aside>
				)}
				<altcha-widget challenge={altchaChallenge} display="invisible" auto="onload" name="altcha" />
				{error && <p class="error">{error}</p>}
				<button type="submit" disabled>
					That's upright
				</button>
				<p class="hint">
					{attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'} left · Stuck? Message a moderator.
				</p>
				<noscript>
					<p class="error">
						This step needs JavaScript. Only this site needs to be allowed, nothing else is loaded.
					</p>
				</noscript>
			</div>
		</form>
		<script type="module" src="/assets/verify.js" />
	</Layout>
);

export const SuccessPage: FC = () => (
	<Layout title="You're in!" step="Done">
		<h1>You're in! 🎉</h1>
		<p>Welcome to the Research Community. You can close this page and head back to Discord.</p>
	</Layout>
);

export const MessagePage: FC<{ title: string; body: string }> = ({ title, body }) => (
	<Layout title={title}>
		<h1>{title}</h1>
		<p>{body}</p>
	</Layout>
);

// Lets `<altcha-widget>` typecheck in JSX
declare module 'hono/jsx' {
	namespace JSX {
		interface IntrinsicElements {
			'altcha-widget': { challenge: string; display: string; auto: string; name: string };
		}
	}
}
