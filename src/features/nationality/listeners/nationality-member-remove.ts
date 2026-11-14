import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { pruneEmptyRoles } from '../roles.ts';

/** Someone left: their country role might now be empty */
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class NationalityMemberRemoveListener extends Listener<typeof Events.GuildMemberRemove> {
	public override async run(member: GuildMember | PartialGuildMember): Promise<void> {
		await pruneEmptyRoles(member.guild, member.roles.cache.keys());
	}
}
