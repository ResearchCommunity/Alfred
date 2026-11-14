import type { Db } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';

/**
 * Remembers who a webhook repost belongs to, so the author can still delete
 * "their" message. Expires automatically; we don't keep this forever.
 */
export const CleanedMessageSchema = z.object({
	_id: Snowflake.describe('ID of the webhook repost'),
	authorId: Snowflake,
	createdAt: z.date(),
});

export type CleanedMessage = z.infer<typeof CleanedMessageSchema>;

const RETENTION_SECONDS = 30 * 24 * 60 * 60;

const collection = (db: Db) => db.collection<CleanedMessage>('cleaned_messages');

export async function ensureIndexes(db: Db): Promise<void> {
	await collection(db).createIndex({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
}

export async function recordRepost(db: Db, repostId: string, authorId: string): Promise<void> {
	await collection(db).insertOne(CleanedMessageSchema.parse({ _id: repostId, authorId, createdAt: new Date() }));
}

export async function findRepost(db: Db, repostId: string): Promise<CleanedMessage | null> {
	return collection(db).findOne({ _id: repostId });
}

export async function forgetRepost(db: Db, repostId: string): Promise<void> {
	await collection(db).deleteOne({ _id: repostId });
}
