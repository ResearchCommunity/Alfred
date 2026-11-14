import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import type { Client } from 'discord.js'

@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
    public override run(client: Client<true>): void {
        const { guildId } = this.container.config
        this.container.logger.info(`Logged in as ${client.user.tag}`)

        // Catch the classic misconfiguration early instead of failing on the first command
        if (!client.guilds.cache.has(guildId)) {
            this.container.logger.warn(`Configured guild ${guildId} not found — is the bot invited to it?`)
        }
    }
}
