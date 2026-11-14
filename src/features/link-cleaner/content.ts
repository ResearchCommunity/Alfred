import { cleanUrl } from './rules.ts';

export interface CleanResult {
	content: string;
	/** Number of links that were changed */
	cleaned: number;
}

// Code blocks and inline code are left alone; people paste URLs there on purpose
const CODE = /(```[\s\S]*?```|`[^`\n]+`)/;
const URL_CANDIDATE = /https?:\/\/[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"*_~|]+$/;

/**
 * Trims characters that are almost certainly not part of the URL: sentence punctuation,
 * markdown/spoiler markers, and a closing parenthesis without an opening one in the URL
 * (as in `[text](url)` or "(see https://…)").
 */
function trimUrl(candidate: string): string {
	let url = candidate;
	for (;;) {
		const before = url;
		url = url.replace(TRAILING_PUNCTUATION, '');
		if (url.endsWith(')') && url.split('(').length < url.split(')').length) url = url.slice(0, -1);
		if (url === before) return url;
	}
}

function cleanProse(text: string, counter: { cleaned: number }): string {
	return text.replace(URL_CANDIDATE, (candidate) => {
		const url = trimUrl(candidate);
		const cleaned = cleanUrl(url);
		if (cleaned === url) return candidate;
		counter.cleaned++;
		return cleaned + candidate.slice(url.length);
	});
}

export function cleanMessageContent(content: string): CleanResult {
	const counter = { cleaned: 0 };
	const result = content
		.split(CODE)
		// split() with a capture group alternates [prose, code, prose, code, …]
		.map((segment, index) => (index % 2 === 0 ? cleanProse(segment, counter) : segment))
		.join('');

	return { content: result, cleaned: counter.cleaned };
}
