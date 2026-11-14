import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

// NOTE: this module is also imported by scripts/generate-config-schema.ts, which runs
// through Node's native type stripping — keep it free of non-erasable TS syntax
// (enums, parameter properties, decorators).

export const Snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)')

const PresenceSchema = z
    .strictObject({
        status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
        activity: z
            .strictObject({
                type: z.enum(['playing', 'listening', 'watching', 'competing', 'custom']),
                name: z.string().min(1).max(128),
            })
            .optional()
            .describe('Activity shown under the bot name. "custom" shows the name as a plain status text.'),
    })
    .describe("The bot's online status and activity")

/**
 * Guild-specific settings. Lives in `config.yaml` (see `config.example.yaml`),
 * validated at boot. Feature sections get added here as features are built.
 */
export const ConfigSchema = z.strictObject({
    guildId: Snowflake.describe('ID of the guild Alfred serves. Slash commands are registered here.'),
    presence: PresenceSchema.prefault({}),
})

export type Config = z.infer<typeof ConfigSchema>

/** JSON Schema for config.yaml, for editor autocomplete. `io: 'input'` keeps defaulted keys optional. */
export function buildConfigJsonSchema(): Record<string, unknown> {
    return { title: 'Alfred config', ...z.toJSONSchema(ConfigSchema, { io: 'input', target: 'draft-07' }) }
}

export function parseConfig(raw: unknown): Config {
    const result = ConfigSchema.safeParse(raw)
    if (!result.success) {
        throw new Error(`Invalid config:\n${z.prettifyError(result.error)}`)
    }
    return result.data
}

export async function loadConfig(path: string): Promise<Config> {
    let text: string
    try {
        text = await readFile(path, 'utf8')
    } catch (error) {
        throw new Error(`Could not read config file "${path}". Copy config.example.yaml to get started.`, {
            cause: error,
        })
    }
    return parseConfig(parseYaml(text))
}
