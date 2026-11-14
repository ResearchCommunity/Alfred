import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'

export interface HttpDependencies {
    /** Whether the bot is fully up (Discord gateway connected). Drives the health check. */
    isReady: () => boolean
}

/**
 * The web side of Alfred (verification pages etc.). Feature routes get mounted here.
 */
export function createHttpApp({ isReady }: HttpDependencies): Hono {
    const app = new Hono()

    // Used by Docker's HEALTHCHECK — 503 until the Discord client is ready
    app.get('/healthz', (c) => (isReady() ? c.json({ status: 'ok' }) : c.json({ status: 'starting' }, 503)))

    return app
}

export function startHttpServer(app: Hono, options: { host: string; port: number }): Promise<ServerType> {
    return new Promise((resolve, reject) => {
        const server = serve({ fetch: app.fetch, hostname: options.host, port: options.port }, () => resolve(server))
        server.once('error', reject)
    })
}

export function stopHttpServer(server: ServerType): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
    })
}

export function describeAddress(server: ServerType): string {
    const address = server.address()
    if (address === null) return 'unknown'
    return typeof address === 'string' ? address : `http://${address.address}:${address.port}`
}
