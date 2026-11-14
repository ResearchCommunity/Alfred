import { ActivityType, type PresenceData } from 'discord.js';
import type { Config } from './config.ts';

type ActivityKind = NonNullable<Config['presence']['activity']>['type'];

const ACTIVITY_TYPES = {
	playing: ActivityType.Playing,
	listening: ActivityType.Listening,
	watching: ActivityType.Watching,
	competing: ActivityType.Competing,
	custom: ActivityType.Custom,
} satisfies Record<ActivityKind, ActivityType>;

export function toPresenceData(presence: Config['presence']): PresenceData {
	const { status, activity } = presence;
	if (!activity) return { status, activities: [] };

	// Custom statuses render `state`, not `name`
	return activity.type === 'custom'
		? { status, activities: [{ type: ActivityType.Custom, name: 'Custom Status', state: activity.name }] }
		: { status, activities: [{ type: ACTIVITY_TYPES[activity.type], name: activity.name }] };
}
