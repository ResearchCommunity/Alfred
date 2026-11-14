import { type Db, MongoServerError } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';

/**
 * A thread that Alfred keeps from being auto-archived. Only watched threads are
 * stored. Unwatching deletes the document, so there are no `watched: false` leftovers.
 */
export const WatchedThreadSchema = z.object({
	_id: Snowflake.describe('Thread ID'),
	watchedBy: Snowflake,
	watchedAt: z.date(),
});

export type WatchedThread = z.infer<typeof WatchedThreadSchema>;

const collection = (db: Db) => db.collection<WatchedThread>('watched_threads');

export async function isWatched(db: Db, threadId: string): Promise<boolean> {
	return (await collection(db).countDocuments({ _id: threadId }, { limit: 1 })) > 0;
}

export async function listWatched(db: Db): Promise<string[]> {
	const docs = await collection(db)
		.find({}, { projection: { _id: 1 } })
		.toArray();
	return docs.map((doc) => doc._id);
}

export async function unwatch(db: Db, threadId: string): Promise<boolean> {
	return (await collection(db).deleteOne({ _id: threadId })).deletedCount > 0;
}

export async function toggleWatch(db: Db, threadId: string, userId: string): Promise<'watched' | 'unwatched'> {
	if (await unwatch(db, threadId)) return 'unwatched';

	const doc = WatchedThreadSchema.parse({ _id: threadId, watchedBy: userId, watchedAt: new Date() });
	try {
		await collection(db).insertOne(doc);
	} catch (error) {
		// Two simultaneous toggles both found nothing to delete; the other one already watched it
		if (!(error instanceof MongoServerError && error.code === 11_000)) throw error;
	}
	return 'watched';
}
