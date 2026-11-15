import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDuration, formatMultiplier } from '../../src/features/chastity/format.ts';

describe('chastity formatting', () => {
	it.each([
		[0, '0m'],
		[59, '0m'],
		[45 * 60, '45m'],
		[3 * 86_400 + 4 * 3600 + 12 * 60, '3d 4h 12m'],
		[86_400, '1d'],
	])('formatDuration(%i) is %s', (seconds, expected) => {
		expect(formatDuration(seconds)).toBe(expected);
	});

	it('shows currency in hours with at most one decimal, never rounding up', () => {
		expect(formatCurrency(12 * 3600, 'dubloons')).toBe('12 dubloons');
		expect(formatCurrency(5400, 'dubloons')).toBe('1.5 dubloons');
		expect(formatCurrency(3599, 'dubloons')).toBe('0.9 dubloons');
	});

	it('shows the multiplier with one decimal', () => {
		expect(formatMultiplier(2)).toBe('2.0x');
	});
});
