// A member's currency, as an anchor like the game state: the balance at `anchoredAt`, plus
// a continuous trickle up to the cap. A balance already above the cap stays as it is.
// Units: seconds of "hours of power".

export interface Wallet {
	balanceSeconds: number;
	anchoredAt: Date;
}

export interface WalletRules {
	allowancePerDayHours: number;
	walletCapHours: number;
}

export function walletBalance(wallet: Wallet, now: Date, rules: WalletRules): number {
	const cap = rules.walletCapHours * 3600;
	if (wallet.balanceSeconds >= cap) return wallet.balanceSeconds;

	const seconds = Math.max(0, (now.getTime() - wallet.anchoredAt.getTime()) / 1000);
	const accrued = Math.floor((seconds * rules.allowancePerDayHours) / 24);
	return Math.min(cap, wallet.balanceSeconds + accrued);
}

export function newWallet(now: Date, startingBalanceHours: number): Wallet {
	return { balanceSeconds: Math.round(startingBalanceHours * 3600), anchoredAt: now };
}
