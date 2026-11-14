import {
    ApplicationCommandRegistries,
    container,
    LogLevel,
    RegisterBehavior,
    SapphireClient,
} from '@sapphire/framework'
import { GatewayIntentBits } from 'discord.js'
import { loadConfig } from './lib/config.ts'
import { connectDatabase } from './lib/database.ts'
import { type Env, parseEnv } from './lib/env.ts'
import { createHttpApp, describeAddress, startHttpServer, stopHttpServer } from './lib/http.ts'
import { createLogger, SapphirePinoLogger } from './lib/logger.ts'
import { toPresenceData } from './lib/presence.ts'

let env: Env
try {
    env = parseEnv()
} catch (error) {
    // No logger yet (its config comes from env) — print just the readable message
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
}

const logger = createLogger(env)
container.env = env
container.pino = logger

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'))

const shutdownTasks: Array<{ name: string; run: () => Promise<unknown> }> = []
let shuttingDown = false

async function shutdown(exitCode: number): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Shutting down')

    // Tear down in reverse start order: Discord → HTTP → database
    for (const task of shutdownTasks.toReversed()) {
        try {
            // oxlint-disable-next-line no-await-in-loop -- teardown order matters
            await task.run()
        } catch (error) {
            logger.error({ err: error }, `Failed to stop ${task.name}`)
        }
    }

    logger.flush()
    process.exit(exitCode)
}

process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))

try {
    const config = await loadConfig(env.CONFIG_PATH)
    container.config = config

    const database = await connectDatabase(env)
    container.mongo = database.client
    container.db = database.db
    shutdownTasks.push({ name: 'database', run: () => database.client.close() })
    logger.info({ database: env.DATABASE_NAME }, 'Connected to database')

    // Single-guild bot: register slash commands to the guild (instant) rather than globally,
    // and overwrite Discord's copy whenever our definitions differ.
    ApplicationCommandRegistries.setDefaultGuildIds([config.guildId])
    ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite)

    const client = new SapphireClient({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
        presence: toPresenceData(config.presence),
        // Safe default: never ping @everyone/@here/roles unless a message explicitly opts in
        allowedMentions: { parse: ['users'], repliedUser: false },
        logger: { instance: new SapphirePinoLogger(logger), level: LogLevel.Trace },
    })

    const http = await startHttpServer(createHttpApp({ isReady: () => client.isReady() }), {
        host: env.HTTP_HOST,
        port: env.HTTP_PORT,
    })
    container.http = http
    shutdownTasks.push({ name: 'http server', run: () => stopHttpServer(http) })
    logger.info(`HTTP server listening on ${describeAddress(http)}`)

    shutdownTasks.push({ name: 'discord client', run: () => client.destroy() })
    await client.login(env.DISCORD_TOKEN)
} catch (error) {
    logger.fatal({ err: error }, 'Startup failed')
    await shutdown(1)
}
