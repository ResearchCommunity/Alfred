import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { OnboardingButton, type OnboardingConfig, rulesPanel } from '../../src/features/onboarding/panels.ts';

const config: OnboardingConfig = {
	verifiedRoleId: '1'.repeat(18),
	welcomeChannelId: '1'.repeat(18),
	publicUrl: 'https://verify.example.org',
	disclaimerSentence: 'Not a shop',
	welcomeMessages: ['%user%'],
	rules: {
		author: 'Research Community',
		title: 'Server rules',
		intro: 'These keep everyone safe.',
		headline: { name: '🚫 No sourcing or selling', text: "Don't ask where to buy." },
		list: [
			{ name: 'Be nice', text: 'Be respectful.' },
			{ name: 'Substance pictures', text: 'Substances yes, use no.', note: 'Fine: a harvest.' },
		],
		closing: 'Use common sense!',
	},
};

/** The panel as Discord receives it */
const json = (panel: ReturnType<typeof rulesPanel>) => JSON.stringify(panel.components);

describe('rulesPanel', () => {
	it('renders the headline, every rule and the buttons', () => {
		const panel = rulesPanel(config);
		const sent = json(panel);
		expect(panel.flags).toBe(MessageFlags.IsComponentsV2);
		expect(sent).toContain('### 🚫 No sourcing or selling');
		expect(sent).toContain('**Be nice**');
		expect(sent).toContain('**Substance pictures**');
		expect(sent).toContain('-# Fine: a harvest.');
		expect(sent).toContain('-# Research Community');
		expect(sent).toContain(OnboardingButton.Accept);
		expect(sent).toContain(OnboardingButton.Decline);
	});

	it('puts small print on every line of a multi-line note', () => {
		const sent = json(rulesPanel({ ...config, rules: { ...config.rules, closing: 'a\nb' } }));
		expect(sent).toContain(JSON.stringify('-# a\n-# b'));
	});

	it('uploads a local thumbnail and shows it next to the header', () => {
		const panel = rulesPanel({ ...config, rules: { ...config.rules, thumbnail: 'assets/rules-thumbnail.png' } });
		expect(json(panel)).toContain('attachment://rules-thumbnail.png');
		expect(panel.files).toHaveLength(1);
	});

	it('works without a thumbnail: no section, nothing uploaded', () => {
		const panel = rulesPanel(config);
		expect(json(panel)).not.toContain('"type":9');
		expect(panel.files).toHaveLength(0);
	});
});
