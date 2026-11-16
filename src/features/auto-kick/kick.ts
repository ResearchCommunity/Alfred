import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';

/** The nightly run happens at midnight here */
export const TIME_ZONE = 'Europe/Berlin';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MemberFacts {
	id: string;
	bot: boolean;
	joinedAt: Date | null;
	/** Role IDs, not counting @everyone */
	roleIds: readonly string[];
}

/**
 * Who goes: people without a single role who joined at least `afterDays` ago. Having no
 * roles is the whole definition of unverified here, so members verified by hand are safe
 * however they got their role.
 */
export function isOverdue(member: MemberFacts, now: Date, afterDays: number): boolean {
	if (member.bot || member.roleIds.length > 0 || !member.joinedAt) return false;
	return now.getTime() - member.joinedAt.getTime() >= afterDays * DAY_MS;
}

export interface KickRun {
	/** Who was kicked, or in a preview, who would be */
	memberIds: string[];
	failed: number;
}

let running: Promise<KickRun> | null = null;

/** Kicks every overdue member, one at a time. Runs never overlap: a second caller shares the first run. */
export function kickUnverified(guild: Guild, afterDays: number, preview = false): Promise<KickRun> {
	if (running && !preview) return running;
	const run = sweep(guild, afterDays, preview);
	if (preview) return run;
	running = run.finally(() => {
		running = null;
	});
	return running;
}

async function sweep(guild: Guild, afterDays: number, preview: boolean): Promise<KickRun> {
	// Straight from Discord, not the cache: a stale cache could make a member look roleless
	const members = await guild.members.fetch();
	const now = new Date();
	const overdue = members.filter(
		(member) =>
			member.kickable &&
			isOverdue(
				{
					id: member.id,
					bot: member.user.bot,
					joinedAt: member.joinedAt,
					roleIds: member.roles.cache.filter((role) => role.id !== guild.id).map((role) => role.id),
				},
				now,
				afterDays,
			),
	);
	if (preview) return { memberIds: [...overdue.keys()], failed: 0 };

	const kicked: string[] = [];
	let failed = 0;
	for (const member of overdue.values()) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- one at a time; discord.js waits out rate limits
			await member.kick(`No roles ${afterDays} days after joining (never verified)`);
			kicked.push(member.id);
		} catch (error) {
			failed++;
			container.logger.warn(`Auto-kick: could not kick ${member.id}`, error);
		}
	}
	if (kicked.length > 0 || failed > 0) {
		container.logger.info(`Auto-kick: kicked ${kicked.length} unverified member(s), ${failed} failed`);
	}
	return { memberIds: kicked, failed };
}

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();

/** The date and time `date` shows on a wall clock in `timeZone`, as if that were UTC */
function wallClock(date: Date, timeZone: string): number {
	let format = wallClockFormats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
		});
		wallClockFormats.set(timeZone, format);
	}
	const parts = format.formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

/** The next midnight in `timeZone` after `now`, daylight saving time included */
export function nextMidnight(now: Date, timeZone: string): Date {
	const local = new Date(wallClock(now, timeZone));
	const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
	// The offset can differ between now and then (DST), so measure it again at the guess
	const guess = target - (wallClock(now, timeZone) - now.getTime());
	return new Date(target - (wallClock(new Date(guess), timeZone) - guess));
}
