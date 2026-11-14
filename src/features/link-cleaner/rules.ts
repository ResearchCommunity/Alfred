import { z } from 'zod';
import clearUrlsData from './data/clearurls.json' with { type: 'json' };

/**
 * Re-implementation of the ClearURLs algorithm for the bundled ruleset.
 * Pure and synchronous, so it can be tested without Discord.
 */

const ProviderSchema = z.object({
	urlPattern: z.string(),
	completeProvider: z.boolean().default(false),
	rules: z.array(z.string()).default([]),
	referralMarketing: z.array(z.string()).default([]),
	rawRules: z.array(z.string()).default([]),
	exceptions: z.array(z.string()).default([]),
	redirections: z.array(z.string()).default([]),
});

type RawProvider = z.input<typeof ProviderSchema>;

interface Provider {
	name: string;
	urlPattern: RegExp;
	exceptions: RegExp[];
	redirections: RegExp[];
	rawRules: RegExp[];
	/** All removable query/fragment keys combined into one anchored pattern, or null */
	params: RegExp | null;
}

/**
 * Additions that ClearURLs doesn't (yet) cover. Carried over from the old bot.
 */
const EXTRA_PROVIDERS: Record<string, RawProvider> = {
	'alfred:youtube': {
		urlPattern: String.raw`^https?:\/\/(?:[a-z0-9-]+\.)*?(youtube\.com|youtu\.be)`,
		rules: ['is'],
	},
};

function compile(name: string, raw: RawProvider): Provider | null {
	const provider = ProviderSchema.parse(raw);
	// "Complete providers" are ad/tracking domains ClearURLs blocks outright.
	// Blocking isn't our job: leave those links alone.
	if (provider.completeProvider) return null;

	const keys = [...provider.rules, ...provider.referralMarketing];
	return {
		name,
		urlPattern: new RegExp(provider.urlPattern, 'i'),
		exceptions: provider.exceptions.map((pattern) => new RegExp(pattern, 'i')),
		redirections: provider.redirections.map((pattern) => new RegExp(pattern, 'i')),
		rawRules: provider.rawRules.map((pattern) => new RegExp(pattern, 'gi')),
		params: keys.length > 0 ? new RegExp(`^(?:${keys.join('|')})$`, 'i') : null,
	};
}

export function compileProviders(providers: Record<string, RawProvider>): Provider[] {
	return Object.entries(providers)
		.map(([name, raw]) => compile(name, raw))
		.filter((provider) => provider !== null);
}

const PROVIDERS = compileProviders({ ...clearUrlsData.providers, ...EXTRA_PROVIDERS });

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Removes `key=value` pairs whose key matches. Works on the raw string rather than
 * URLSearchParams, so everything we keep stays byte-for-byte as the user wrote it.
 */
function filterPairs(pairs: string, params: RegExp): string {
	return pairs
		.split('&')
		.filter((pair) => {
			if (pair === '') return false;
			const key = pair.split('=', 1)[0] ?? '';
			return !params.test(key) && !params.test(safeDecode(key));
		})
		.join('&');
}

function removeParams(url: string, params: RegExp): string {
	const hashIndex = url.indexOf('#');
	const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
	let fragment = hashIndex === -1 ? null : url.slice(hashIndex + 1);

	const queryIndex = beforeHash.indexOf('?');
	const base = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : filterPairs(beforeHash.slice(queryIndex + 1), params);

	// Only treat the fragment as parameters if it looks like `a=b&c=d`. Plain anchors stay untouched.
	if (fragment?.includes('=')) fragment = filterPairs(fragment, params);

	return `${base}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`;
}

const MAX_REDIRECT_DEPTH = 5;

export function cleanUrl(url: string, providers: Provider[] = PROVIDERS, depth = 0): string {
	let result = url;

	for (const provider of providers) {
		if (!provider.urlPattern.test(result)) continue;
		if (provider.exceptions.some((exception) => exception.test(result))) continue;

		// Redirect wrappers (google.com/url?q=…, youtube.com/redirect?q=…): unwrap to the real target
		for (const redirection of provider.redirections) {
			const target = redirection.exec(result)?.[1];
			if (target === undefined) continue;
			const decoded = safeDecode(target);
			if (/^https?:\/\//i.test(decoded) && depth < MAX_REDIRECT_DEPTH) {
				return cleanUrl(decoded, providers, depth + 1);
			}
		}

		for (const rawRule of provider.rawRules) result = result.replace(rawRule, '');
		if (provider.params) result = removeParams(result, provider.params);
	}

	return result;
}
