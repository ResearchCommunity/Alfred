import { describe, expect, it } from 'vitest';
import { TicketDialog, ticketDialog, ticketIntro } from '../../src/features/tickets/tickets.ts';

const config = { categoryId: '1'.repeat(18), tripsitterRoleId: '2'.repeat(18), panelText: 'Tripsit' };
const MEMBER = '3'.repeat(18);

const introText = (details?: string) => JSON.stringify(ticketIntro(MEMBER, config, details).components);

describe('tripsit dialog', () => {
	it('asks optionally what is going on, up to 1000 characters', () => {
		const dialog = JSON.stringify(ticketDialog().toJSON());
		expect(dialog).toContain('Open a tripsit channel?');
		expect(dialog).toContain(`"custom_id":"${TicketDialog.Details}"`);
		expect(dialog).toContain('"required":false');
		expect(dialog).toContain('"max_length":1000');
	});
});

describe('ticketIntro', () => {
	it("has no What's going on part without an answer, or with only whitespace", () => {
		expect(introText()).not.toContain("What's going on");
		expect(introText('  \n ')).not.toContain("What's going on");
	});

	it('quotes every line of the answer', () => {
		expect(introText('took 2 tabs\nfeeling weird')).toContain(
			JSON.stringify("### What's going on\n> took 2 tabs\n> feeling weird\n").slice(1, -1),
		);
	});

	it('never pings anyone mentioned in the answer', () => {
		const { allowedMentions } = ticketIntro(MEMBER, config, '@everyone <@&999999999999999999>');
		expect(allowedMentions).toEqual({ users: [MEMBER], roles: [config.tripsitterRoleId] });
	});
});
