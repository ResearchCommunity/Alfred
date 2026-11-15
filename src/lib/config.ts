import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { DEFAULT_WHEEL, WheelSchema } from '../features/chastity/wheel.ts';
import { MAX_RULES_LENGTH, rulesLength } from '../features/onboarding/rules-text.ts';

// NOTE: this module is also imported by scripts/generate-config-schema.ts, which runs
// through Node's native type stripping — keep it free of non-erasable TS syntax
// (enums, parameter properties, decorators).

export const Snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)');

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
	.describe("The bot's online status and activity");

const LinkCleanerSchema = z
	.strictObject({
		enabled: z.boolean().default(true),
		ignoredChannelIds: z
			.array(Snowflake)
			.default([])
			.describe('Channels (and their threads) where links are left untouched'),
	})
	.describe('Strips tracking parameters from posted links and reposts the message as its author');

const NationalitySchema = z
	.strictObject({
		anchorRoleId: Snowflake.optional().describe(
			'New country roles are created directly below this role. Without it they land at the bottom.',
		),
		panelText: z.string().min(1).max(4000).optional().describe('Text of the /panel nationality info message'),
	})
	.describe('Self-assignable country roles (/nationality)');

const TicketsSchema = z
	.strictObject({
		categoryId: Snowflake.describe('Category the private tripsit channels are created in'),
		tripsitterRoleId: Snowflake.describe('Role that can see and gets pinged for every ticket'),
		panelText: z
			.string()
			.min(1)
			.max(4000)
			.default(
				'Is your trip going south? Need some assistance or just someone to talk to? Our volunteer tripsitters are here for you!',
			)
			.describe('Text of the panel with the "Tripsit me!" button (markdown supported)'),
	})
	.describe('Private tripsitting channels. Leave this section out to disable tickets.');

// The welcome lines of the old bot. `%user%` becomes a mention of the new member.
const DEFAULT_WELCOME_MESSAGES = [
	'A warm welcome to %user% ❤️',
	'%user% is now a fellow researcher 🧑‍🔬',
	'Welcome %user%! May the force be with you 💫',
	'%user%: \\*enter stage left\\*',
	"Does anyone know %user%? If not, now's the time to change that!",
	'%user% is now ONE OF US! ONE OF US!',
	'%user% has descended onto the server!',
	'May I introduce everyone to %user%?',
	"It's getting hot in here 🔥 %user% just arrived!",
	"Roses are red, violets are blue, %user% just joined, and I can't rhyme",
	'This server has been sponsored by Raid Shadow Legends. Oh, and by %user%',
	'%user% just left. If it was opposite day, that is.',
	'🤖 Beep Boop EVENT_USER_JOIN %user% ; DESTROY_ALL_HUMANS_INIT Boop Beep 🤖',
	'EVERYONE QUIET! %user% is here!',
	'Finally, after all these years, %user% has joined!',
];

const Line = z.string().trim().min(1);

const RulesSchema = z
	.strictObject({
		author: Line.optional().describe('Small print above the title, e.g. the server name'),
		title: Line.describe('Heading of the rules panel'),
		intro: Line.describe('Paragraph under the title (markdown)'),
		thumbnail: Line.optional().describe(
			'Picture in the top right corner: an http(s) URL, or a file path (relative to the working directory) that is uploaded with the panel',
		),
		headline: z
			.strictObject({ name: Line, text: Line })
			.describe('The one rule that must not be missed, set apart from the rest'),
		list: z
			.array(
				z.strictObject({
					name: Line,
					text: Line.describe('markdown'),
					note: Line.optional().describe('Small print under the rule, e.g. an example'),
				}),
			)
			.min(1)
			.describe('The other rules, in order'),
		closing: Line.optional().describe('Small print at the end, before the buttons'),
	})
	.superRefine((rules, context) => {
		const length = rulesLength(rules);
		if (length > MAX_RULES_LENGTH) {
			context.addIssue({
				code: 'custom',
				message: `Rules are ${length} characters; a Discord message holds at most ${MAX_RULES_LENGTH}`,
			});
		}
	})
	.describe('The rules panel members accept before verifying');

const OnboardingSchema = z
	.strictObject({
		verifiedRoleId: Snowflake.describe('Role members get after passing verification'),
		welcomeChannelId: Snowflake.describe('Channel the welcome message is posted in'),
		publicUrl: z
			.url({ protocol: /^https?$/ })
			.transform((url) => url.replace(/\/+$/, ''))
			.describe('Public base URL of the verification site, e.g. https://verify.research-community.org'),
		rules: RulesSchema,
		disclaimerSentence: z
			.string()
			.min(1)
			.default('This server is not affiliated with any vendor')
			.describe('Sentence visitors must retype to confirm this is not vendor support'),
		welcomeMessages: z
			.array(z.string().min(1).includes('%user%'))
			.min(1)
			.default(DEFAULT_WELCOME_MESSAGES)
			.describe('Welcome lines, one is picked at random. %user% becomes a mention.'),
	})
	.describe('Rules panel and verification website. Leave this section out to disable onboarding.');

const Hours = z.number().positive();

const ChastitySchema = z
	.strictObject({
		ownerId: Snowflake.describe('The one person who is locked. Also the only one allowed to use /chastity-admin.'),
		channelId: Snowflake.describe('The game channel: /chastity only works here, and game posts go here'),
		currencyName: z
			.string()
			.trim()
			.min(1)
			.default('dubloons')
			.describe('What the currency is called (unit: hours)'),
		allowancePerDayHours: Hours.default(8).describe(
			'Currency every member gains per 24h, trickling in continuously',
		),
		walletCapHours: Hours.default(24).describe('The trickle stops at this balance'),
		startingBalanceHours: z.number().min(0).default(24).describe("A member's balance before their first action"),
		multiplierFlatHours: z
			.number()
			.min(0)
			.default(24)
			.describe('Adding costs 1× while the timer has at most this many hours left'),
		multiplierTargetDays: z
			.number()
			.positive()
			.default(14)
			.describe('Where the add multiplier reaches multiplierTarget; past the flat part it grows quadratically'),
		multiplierTarget: z
			.number()
			.min(1)
			.default(24)
			.describe('The add multiplier with multiplierTargetDays left on the timer'),
		bankCapHours: Hours.default(24).describe("The owner's unlock bank stops growing at this many hours"),
		removeCostRatio: z.number().positive().default(3).describe('Currency hours per hour removed'),
		bankShortfallFactor: z
			.number()
			.min(0)
			.default(4)
			.describe(
				"Drain and Heist: every hour they can't take from the unlock bank goes on the timer this many times over",
			),
		spinCostHours: z.number().min(0.1).default(4).describe('Price of a wheel spin, times the multiplier'),
		wheel: WheelSchema.default(DEFAULT_WHEEL).describe('Wheel tiers with weights and outcomes'),
	})
	.refine((game) => game.multiplierTargetDays * 24 > game.multiplierFlatHours, {
		message: 'multiplierTargetDays must lie past multiplierFlatHours',
		path: ['multiplierTargetDays'],
	})
	.describe("The chastity game: members control the owner's timer. Leave this section out to disable it.");

export type ChastityConfig = z.infer<typeof ChastitySchema>;

/**
 * Guild-specific settings. Lives in `config.yaml` (see `config.example.yaml`),
 * validated at boot. Feature sections get added here as features are built.
 */
export const ConfigSchema = z.strictObject({
	guildId: Snowflake.describe('ID of the guild Alfred serves. Slash commands are registered here.'),
	presence: PresenceSchema.prefault({}),
	linkCleaner: LinkCleanerSchema.prefault({}),
	nationality: NationalitySchema.prefault({}),
	tickets: TicketsSchema.optional(),
	onboarding: OnboardingSchema.optional(),
	chastity: ChastitySchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/** JSON Schema for config.yaml, for editor autocomplete. `io: 'input'` keeps defaulted keys optional. */
export function buildConfigJsonSchema(): Record<string, unknown> {
	return { title: 'Alfred config', ...z.toJSONSchema(ConfigSchema, { io: 'input', target: 'draft-07' }) };
}

export function parseConfig(raw: unknown): Config {
	const result = ConfigSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(`Invalid config:\n${z.prettifyError(result.error)}`);
	}
	return result.data;
}

export async function loadConfig(path: string): Promise<Config> {
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch (error) {
		throw new Error(`Could not read config file "${path}". Copy config.example.yaml to get started.`, {
			cause: error,
		});
	}
	return parseConfig(parseYaml(text));
}
