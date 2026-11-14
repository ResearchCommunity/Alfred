import { format } from 'node:util'
import { type ILogger, LogLevel } from '@sapphire/framework'
import { type Level, type Logger, pino } from 'pino'
import type { Env } from './env.ts'

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
    return pino({
        level: env.LOG_LEVEL,
        // Pretty, human-readable output locally; raw JSON lines in production (docker logs)
        ...(env.NODE_ENV === 'development' && {
            transport: {
                target: 'pino-pretty',
                options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
            },
        }),
    })
}

// Sapphire's LogLevel values (10..60) are numerically identical to Pino's levels,
// so the mapping is 1:1.
const LEVELS: Partial<Record<LogLevel, Level>> = {
    [LogLevel.Trace]: 'trace',
    [LogLevel.Debug]: 'debug',
    [LogLevel.Info]: 'info',
    [LogLevel.Warn]: 'warn',
    [LogLevel.Error]: 'error',
    [LogLevel.Fatal]: 'fatal',
}

/**
 * Routes Sapphire's internal logging (piece loading, command registration,
 * listener errors) through our Pino instance, so the framework and app code
 * share a single structured log stream.
 */
export class SapphirePinoLogger implements ILogger {
    readonly #logger: Logger

    constructor(logger: Logger) {
        this.#logger = logger.child({ source: 'sapphire' })
    }

    has(level: LogLevel): boolean {
        const method = LEVELS[level]
        return method !== undefined && this.#logger.isLevelEnabled(method)
    }

    trace(...values: readonly unknown[]): void {
        this.write(LogLevel.Trace, ...values)
    }

    debug(...values: readonly unknown[]): void {
        this.write(LogLevel.Debug, ...values)
    }

    info(...values: readonly unknown[]): void {
        this.write(LogLevel.Info, ...values)
    }

    warn(...values: readonly unknown[]): void {
        this.write(LogLevel.Warn, ...values)
    }

    error(...values: readonly unknown[]): void {
        this.write(LogLevel.Error, ...values)
    }

    fatal(...values: readonly unknown[]): void {
        this.write(LogLevel.Fatal, ...values)
    }

    write(level: LogLevel, ...values: readonly unknown[]): void {
        const method = LEVELS[level]
        if (!method) return

        // Pull Errors out into Pino's `err` field so stack traces get serialized properly
        const err = values.find((value) => value instanceof Error)
        const message = format(...values.filter((value) => value !== err))

        if (err) this.#logger[method]({ err }, message)
        else this.#logger[method](message)
    }
}
