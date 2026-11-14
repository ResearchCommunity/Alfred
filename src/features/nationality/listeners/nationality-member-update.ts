import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { pruneEmptyRoles } from '../roles.ts';

/** A moderator (or anyone) removed roles by hand: a country role might now be empty */
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class NationalityMemberUpdateListener extends Listener<typeof Events.GuildMemberUpdate> {
	public override async run(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
		const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
		if (removed.size > 0) await pruneEmptyRoles(newMember.guild, removed.keys());
	}
}
