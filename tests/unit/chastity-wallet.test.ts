import { describe, expect, it } from 'vitest';
import { newWallet, walletBalance } from '../../src/features/chastity/wallet.ts';

const H = 3600;
const T0 = new Date('2026-11-14T12:00:00Z');
const rules = { allowancePerDayHours: 8, walletCapHours: 24 };
const later = (hours: number) => new Date(T0.getTime() + hours * H * 1000);

describe('walletBalance', () => {
	it('starts full and stays at the cap', () => {
		expect(walletBalance(newWallet(T0, 24), later(48), rules)).toBe(24 * H);
	});

	it('trickles 8h per 24h', () => {
		expect(walletBalance({ balanceSeconds: 0, anchoredAt: T0 }, later(10), rules)).toBe(10 * H * (8 / 24));
	});

	it('stops at the cap, but leaves a balance above it alone', () => {
		expect(walletBalance({ balanceSeconds: 20 * H, anchoredAt: T0 }, later(100), rules)).toBe(24 * H);
		expect(walletBalance({ balanceSeconds: 30 * H, anchoredAt: T0 }, later(100), rules)).toBe(30 * H);
	});
});
