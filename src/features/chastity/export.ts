import { gzipSync } from 'node:zlib';
import type { Db } from 'mongodb';
import { z } from 'zod';
import type { ChastityConfig } from '../../lib/config.ts';
import { allEvents, allWallets, appendEvent, lastRules, loadState } from './repository.ts';
import { activeHappyHour, multiplier, project, SECONDS } from './time.ts';
import { walletBalance } from './wallet.ts';

// The game's history as one file, for working out what needs rebalancing. JSON Lines: a header,
// then every event oldest first. Members are pseudonyms (m1, m2, … by first appearance; the
// locked person is "owner"), and what members wrote as reasons is left out.

export const EXPORT_FORMAT = 'alfred-chastity-export';
/** Discord takes up to 10 MiB per file; past this, the export is gzipped */
const GZIP_ABOVE = 8 * 1024 * 1024;

const PlainObject = z.record(z.string(), z.unknown());

/** The config's game rules: everything but who and where */
export function gameRules(config: ChastityConfig): Record<string, unknown> {
	const { ownerId: _owner, channelId: _channel, ...rules } = config;
	// Plain JSON, so it compares equal to what comes back from the database
	return PlainObject.parse(JSON.parse(JSON.stringify(rules)));
}

/** Logs the rules as a `config` event when they changed since the last one (and the first time) */
export async function recordRules(db: Db, config: ChastityConfig, now = new Date()): Promise<boolean> {
	const rules = gameRules(config);
	if (JSON.stringify(await lastRules(db)) === JSON.stringify(rules)) return false;
	await appendEvent(db, {
		at: now,
		actorId: null,
		targetId: null,
		type: 'config',
		source: 'system',
		costSeconds: 0,
		creditSeconds: 0,
		timerDeltaSeconds: 0,
		bankDeltaSeconds: 0,
		multiplier: null,
		reason: null,
		tier: null,
		effect: null,
		outcome: null,
		timerAfterSeconds: null,
		bankAfterSeconds: null,
		balanceAfterSeconds: null,
		rolledMinutes: null,
		rules,
	});
	return true;
}

function pseudonyms(ownerId: string): (id: string | null) => string | null {
	const names = new Map([[ownerId, 'owner']]);
	return (id) => {
		if (id === null) return null;
		let name = names.get(id);
		if (!name) {
			// The owner holds the first slot, so members start at m1
			name = `m${names.size}`;
			names.set(id, name);
		}
		return name;
	};
}

export async function exportGame(
	db: Db,
	config: ChastityConfig,
	now = new Date(),
): Promise<{ name: string; data: Buffer }> {
	const alias = pseudonyms(config.ownerId);

	const lines: string[] = [];
	for await (const event of allEvents(db)) {
		const { at, type, source, actorId, targetId, reason: _reason, ...rest } = event;
		lines.push(JSON.stringify({ at, type, source, actor: alias(actorId), target: alias(targetId), ...rest }));
	}

	const stored = await loadState(db);
	let state = null;
	if (stored) {
		const rules = { ...stored, bankCapSeconds: config.bankCapHours * SECONDS.HOUR };
		const projection = project(rules, now);
		const happyHourUntil = activeHappyHour(rules, now);
		state = {
			mode: stored.mode,
			timerSeconds: projection.timerSeconds,
			bankSeconds: projection.bankSeconds,
			multiplier: multiplier(projection.timerSeconds, config.multiplierDoublingDays, happyHourUntil !== null),
			happyHourUntil,
		};
	}
	const members = (await allWallets(db))
		.map((wallet) => ({ member: alias(wallet.userId), balanceSeconds: walletBalance(wallet, now, config) }))
		.toSorted((a, b) => Number(a.member?.slice(1)) - Number(b.member?.slice(1)));

	const header = {
		format: EXPORT_FORMAT,
		version: 1,
		exportedAt: now,
		notes: [
			'Line 1 is this header; every line after it is one event, oldest first.',
			'Durations and currency are in seconds (currency is "hours of power": 3600 = 1 dubloon).',
			'actor/target are pseudonyms: m1, m2, … by first appearance; "owner" is the locked person. Reasons are left out.',
			'timerAfterSeconds/bankAfterSeconds/balanceAfterSeconds/rolledMinutes are null on events older than the fields.',
			'"config" events record the rules from then on; "rules" below are the ones in effect now.',
		],
		rules: gameRules(config),
		state,
		members,
	};

	const text = `${[JSON.stringify(header), ...lines].join('\n')}\n`;
	const date = now.toISOString().slice(0, 10);
	const data = Buffer.from(text);
	return data.length > GZIP_ABOVE
		? { name: `chastity-export-${date}.jsonl.gz`, data: gzipSync(data) }
		: { name: `chastity-export-${date}.jsonl`, data };
}
