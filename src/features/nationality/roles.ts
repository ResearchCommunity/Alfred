import { container } from '@sapphire/framework';
import type { Guild, GuildMember, Role } from 'discord.js';
import { Mutex } from '../../lib/mutex.ts';
import { type Country, roleColor, roleName } from './countries.ts';
import { findRoleId, forgetRoleId, listAll, setRoleId } from './repository.ts';

/**
 * All nationality role changes go through this lock. Two members picking the same
 * new country at once would otherwise create two roles, and a prune could delete a
 * role in the instant between someone getting it and the member cache updating.
 */
const lock = new Mutex();

const REASON = 'Nationality roles';

async function nationalityRoleIds(): Promise<Set<string>> {
	return new Set((await listAll(container.db)).map((mapping) => mapping.roleId));
}

async function getOrCreateRole(guild: Guild, country: Country): Promise<Role> {
	const existingId = await findRoleId(container.db, country.code);
	const existing = existingId ? guild.roles.cache.get(existingId) : undefined;
	if (existing) return existing;

	// Create new roles directly below the anchor role, if one is configured
	const { anchorRoleId } = container.config.nationality;
	const anchor = anchorRoleId ? guild.roles.cache.get(anchorRoleId) : undefined;

	const role = await guild.roles.create({
		name: roleName(country),
		colors: { primaryColor: roleColor(country.code) },
		...(anchor && { position: anchor.position }),
		reason: REASON,
	});
	await setRoleId(container.db, country.code, role.id);
	return role;
}

/** Deletes nationality roles nobody has anymore. Caller must hold the lock. */
async function pruneUnlocked(guild: Guild, roleIds: Iterable<string>): Promise<number> {
	let pruned = 0;
	for (const roleId of roleIds) {
		const role = guild.roles.cache.get(roleId);
		if (role && role.members.size > 0) continue;

		// oxlint-disable-next-line no-await-in-loop -- few roles, and order keeps DB and Discord in step
		await role?.delete(REASON);
		// oxlint-disable-next-line no-await-in-loop
		await forgetRoleId(container.db, roleId);
		pruned++;
	}
	return pruned;
}

/** Gives the member this country's role, replacing any previous nationality role. */
export function setNationality(member: GuildMember, country: Country): Promise<Role> {
	return lock.run(async () => {
		const ids = await nationalityRoleIds();
		const role = await getOrCreateRole(member.guild, country);
		const previous = member.roles.cache.filter((r) => ids.has(r.id) && r.id !== role.id);

		// One request: swap old nationality for new, keeping every other role as is
		const roles = member.roles.cache.filter((r) => r.id !== member.guild.id && !previous.has(r.id));
		await member.roles.set([...roles.keys(), role.id], REASON);

		await pruneUnlocked(member.guild, previous.keys());
		return role;
	});
}

/** Removes the member's nationality role(s). Returns whether they had one. */
export function clearNationality(member: GuildMember): Promise<boolean> {
	return lock.run(async () => {
		const ids = await nationalityRoleIds();
		const current = member.roles.cache.filter((r) => ids.has(r.id));
		if (current.size === 0) return false;

		await member.roles.remove([...current.keys()], REASON);
		await pruneUnlocked(member.guild, current.keys());
		return true;
	});
}

/**
 * Deletes empty nationality roles. Pass role IDs to check just those (e.g. the
 * roles a departing member had), or nothing to sweep all of them.
 */
export function pruneEmptyRoles(guild: Guild, roleIds?: Iterable<string>): Promise<number> {
	return lock.run(async () => {
		const ids = await nationalityRoleIds();
		const candidates = roleIds ? [...roleIds].filter((id) => ids.has(id)) : ids;
		return pruneUnlocked(guild, candidates);
	});
}
