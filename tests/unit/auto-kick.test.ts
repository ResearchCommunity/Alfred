import { describe, expect, it } from 'vitest';
import { isOverdue, nextMidnight, TIME_ZONE } from '../../src/features/auto-kick/kick.ts';

const NOW = new Date('2026-11-16T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600 * 1000);
const member = (overrides = {}) => ({ id: '1', bot: false, joinedAt: daysAgo(8), roleIds: [], ...overrides });

describe('auto-kick', () => {
	it('kicks only humans with no roles at all who joined long enough ago', () => {
		expect(isOverdue(member(), NOW, 7)).toBe(true);
		expect(isOverdue(member({ joinedAt: daysAgo(7) }), NOW, 7)).toBe(true);
		expect(isOverdue(member({ joinedAt: daysAgo(6.9) }), NOW, 7)).toBe(false);
		// Any role counts, verified or not, however they got it
		expect(isOverdue(member({ roleIds: ['2'] }), NOW, 7)).toBe(false);
		expect(isOverdue(member({ bot: true }), NOW, 7)).toBe(false);
		expect(isOverdue(member({ joinedAt: null }), NOW, 7)).toBe(false);
	});

	it.each([
		// Winter (UTC+1)
		['2026-11-16T12:00:00Z', '2026-11-16T23:00:00Z'],
		['2026-11-16T22:59:59Z', '2026-11-16T23:00:00Z'],
		['2026-11-16T23:00:00Z', '2026-11-17T23:00:00Z'],
		// Summer (UTC+2)
		['2026-07-01T10:00:00Z', '2026-07-01T22:00:00Z'],
		// The night clocks go forward, and the one they go back
		['2026-03-28T12:00:00Z', '2026-03-28T23:00:00Z'],
		['2026-03-29T12:00:00Z', '2026-03-29T22:00:00Z'],
		['2026-10-24T12:00:00Z', '2026-10-24T22:00:00Z'],
		['2026-10-25T12:00:00Z', '2026-10-25T23:00:00Z'],
		// New year
		['2026-12-31T12:00:00Z', '2026-12-31T23:00:00Z'],
	])('the next German midnight after %s is %s', (now, expected) => {
		expect(nextMidnight(new Date(now), TIME_ZONE).toISOString()).toBe(new Date(expected).toISOString());
	});
});
