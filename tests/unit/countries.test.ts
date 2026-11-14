import { describe, expect, it } from 'vitest';
import {
	COUNTRIES,
	flagEmoji,
	resolveCountry,
	roleColor,
	searchCountries,
} from '../../src/features/nationality/countries.ts';

describe('countries', () => {
	it('has a name for every code', () => {
		expect(COUNTRIES).toHaveLength(250);
		for (const country of COUNTRIES) expect(country.name).not.toMatch(/^[A-Z]{2}$|Unknown/);
	});

	it('builds flag emoji from codes', () => {
		expect(flagEmoji('DE')).toBe('🇩🇪');
		expect(flagEmoji('gb')).toBe('🇬🇧');
	});

	it.each([
		['de', 'DE'],
		['Germany', 'DE'],
		['UK', 'GB'],
		['usa', 'US'],
		['cote divoire', 'CI'],
		['Kosovo', 'XK'],
	])('resolves %s', (query, code) => {
		expect(resolveCountry(query)?.code).toBe(code);
	});

	it('does not resolve partial names', () => {
		expect(resolveCountry('germ')).toBeUndefined();
	});

	it('ranks exact matches, then prefixes, then substrings', () => {
		// "in" is India's code (exact), Indonesia starts with it, Argentina merely contains it
		expect(
			searchCountries('in')
				.map((c) => c.code)
				.slice(0, 3),
		).toEqual(['IN', 'ID', 'AR']);
	});

	it('caps suggestions at Discord’s limit of 25', () => {
		expect(searchCountries('')).toHaveLength(25);
		expect(searchCountries('a').length).toBeLessThanOrEqual(25);
	});

	it('gives each country a stable, valid color', () => {
		expect(roleColor('DE')).toBe(roleColor('DE'));
		expect(roleColor('DE')).toBeGreaterThanOrEqual(0);
		expect(roleColor('DE')).toBeLessThanOrEqual(0xffffff);
	});
});
