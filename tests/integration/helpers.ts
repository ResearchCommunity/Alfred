import { randomUUID } from 'node:crypto';
import { type Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, inject } from 'vitest';

/**
 * A fresh, uniquely named database per test file, dropped afterwards, so test
 * files never see each other's data even when running in parallel.
 */
export function useTestDatabase(): () => Db {
	let client: MongoClient;
	let db: Db;

	beforeAll(async () => {
		client = new MongoClient(inject('databaseUrl'));
		await client.connect();
		db = client.db(`test_${randomUUID().replaceAll('-', '')}`);
	});

	afterAll(async () => {
		await db.dropDatabase();
		await client.close();
	});

	return () => db;
}
