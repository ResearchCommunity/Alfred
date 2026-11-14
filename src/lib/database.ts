import { type Db, MongoClient } from 'mongodb'
import type { Env } from './env.ts'

export interface Database {
    client: MongoClient
    db: Db
}

/**
 * Connects to DocumentDB over the MongoDB wire protocol. The driver doesn't care
 * whether the other end is DocumentDB or MongoDB — the backend is a deployment detail.
 */
export async function connectDatabase(env: Pick<Env, 'DATABASE_URL' | 'DATABASE_NAME'>): Promise<Database> {
    const client = new MongoClient(env.DATABASE_URL, {
        appName: 'alfred',
        serverSelectionTimeoutMS: 10_000,
    })

    await client.connect()
    const db = client.db(env.DATABASE_NAME)
    // connect() can succeed lazily; a ping proves auth and the server actually work
    await db.command({ ping: 1 })

    return { client, db }
}
