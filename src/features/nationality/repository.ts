import type { Db } from 'mongodb';
import { z } from 'zod';
import { Snowflake } from '../../lib/config.ts';

/**
 * Which guild role represents which country. No member counts are stored: who
 * has a role is Discord's knowledge (`role.members`), so it can't drift.
 */
export const NationalityRoleSchema = z.object({
	_id: z
		.string()
		.regex(/^[A-Z]{2}$/)
		.describe('ISO 3166-1 alpha-2 country code'),
	roleId: Snowflake,
});

export type NationalityRole = z.infer<typeof NationalityRoleSchema>;

const collection = (db: Db) => db.collection<NationalityRole>('nationality_roles');

export async function findRoleId(db: Db, code: string): Promise<string | undefined> {
	return (await collection(db).findOne({ _id: code }))?.roleId;
}

export async function setRoleId(db: Db, code: string, roleId: string): Promise<void> {
	const doc = NationalityRoleSchema.parse({ _id: code, roleId });
	await collection(db).replaceOne({ _id: doc._id }, doc, { upsert: true });
}

export async function forgetRoleId(db: Db, roleId: string): Promise<void> {
	await collection(db).deleteOne({ roleId });
}

export async function listAll(db: Db): Promise<NationalityRole[]> {
	return collection(db).find().toArray();
}
