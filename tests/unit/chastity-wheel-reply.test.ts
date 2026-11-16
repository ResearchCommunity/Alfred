import { describe, expect, it } from 'vitest';
import { wheelReply } from '../../src/features/chastity/messages.ts';
import { DEFAULT_WHEEL } from '../../src/features/chastity/wheel.ts';
import type { ChastityConfig } from '../../src/lib/config.ts';

const config: ChastityConfig = {
	ownerId: '100000000000000001',
	channelId: '200000000000000002',
	currencyName: 'dubloons',
	allowancePerDayHours: 8,
	walletCapHours: 24,
	startingBalanceHours: 24,
	bankCapHours: 24,
	multiplierFlatHours: 24,
	multiplierTargetDays: 14,
	multiplierTarget: 24,
	removeCostRatio: 3,
	bankShortfallFactor: 4,
	spinCostHours: 4,
	wheel: DEFAULT_WHEEL,
};

describe('wheelReply', () => {
	const text = JSON.stringify(wheelReply(config, 2).components);

	it('lists every outcome with its overall chance and effect', () => {
		for (const tier of DEFAULT_WHEEL)
			for (const outcome of tier.outcomes) expect(text).toContain(`**${outcome.name}**`);
		expect(text).toContain('**Nudge** · 33%');
		expect(text).toContain('**Big push** · 9%');
		expect(text).toContain('**Drain** · 0.6%');
		expect(text).toContain("and **half** the spin's price back");
		expect(text).toContain('**Mercy** · 0.5%');
		expect(text).toContain('**−3h to 6h** off the timer');
		expect(text).toContain("**2× the spin's price** for the spinner, right now 16 dubloons");
	});

	it('shows the tier chances and the spin price', () => {
		expect(text).toContain('### Common · 60%');
		expect(text).toContain('### ✨ Legendary · 1.5%');
		expect(text).toContain('A spin costs **4 dubloons × the multiplier**, right now **8 dubloons** at 2.0x');
	});
});
