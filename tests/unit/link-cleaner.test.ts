import { describe, expect, it } from 'vitest';
import { cleanMessageContent } from '../../src/features/link-cleaner/content.ts';
import { cleanUrl } from '../../src/features/link-cleaner/rules.ts';

describe('cleanUrl', () => {
	it.each([
		['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'https://youtu.be/dQw4w9WgXcQ'],
		['https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&pp=xyz', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
		// the `is` param from the old bot isn't in ClearURLs; covered by our extra rule
		['https://youtu.be/dQw4w9WgXcQ?is=abc&t=42', 'https://youtu.be/dQw4w9WgXcQ?t=42'],
		['https://example.com/article?utm_source=twitter&id=7&fbclid=x', 'https://example.com/article?id=7'],
		['https://www.amazon.de/dp/B000000000/ref=sr_1_1?tag=affiliate-21&th=1', 'https://www.amazon.de/dp/B000000000'],
	])('cleans %s', (input, expected) => {
		expect(cleanUrl(input)).toBe(expected);
	});

	it('unwraps redirect wrappers', () => {
		const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fpage%3Futm_source%3Dx&sa=D';
		expect(cleanUrl(wrapped)).toBe('https://example.com/page');
	});

	it('keeps clean URLs byte-for-byte, including odd encoding and anchors', () => {
		const url = 'https://example.com/a%20b?q=caf%C3%A9+au+lait&x=1#section-2';
		expect(cleanUrl(url)).toBe(url);
	});

	it('cleans parameters in fragments', () => {
		expect(cleanUrl('https://example.com/#/page?id=1&utm_medium=social')).toBe('https://example.com/#/page?id=1');
	});
});

describe('cleanMessageContent', () => {
	it('cleans links in prose and counts them', () => {
		expect(cleanMessageContent('look https://youtu.be/abc?si=x and https://example.com/?utm_source=y.')).toEqual({
			content: 'look https://youtu.be/abc and https://example.com/.',
			cleaned: 2,
		});
	});

	it('handles markdown links, suppressed embeds and spoilers', () => {
		expect(
			cleanMessageContent(
				'[vid](https://youtu.be/abc?si=x) <https://youtu.be/def?si=y> ||https://youtu.be/g?si=z||',
			).content,
		).toBe('[vid](https://youtu.be/abc) <https://youtu.be/def> ||https://youtu.be/g||');
	});

	it('keeps parentheses that belong to the URL', () => {
		const url = 'https://en.wikipedia.org/wiki/Bad_trip_(drug)';
		expect(cleanMessageContent(`see ${url}`).content).toBe(`see ${url}`);
	});

	it('leaves code alone', () => {
		const content = 'inline `https://youtu.be/a?si=x` and\n```\nhttps://youtu.be/b?si=y\n```';
		expect(cleanMessageContent(content)).toEqual({ content, cleaned: 0 });
	});

	it('reports nothing for messages without trackers', () => {
		expect(cleanMessageContent('hello https://example.com/page')).toEqual({
			content: 'hello https://example.com/page',
			cleaned: 0,
		});
	});
});
