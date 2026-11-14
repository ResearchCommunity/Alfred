// The rules panel's text, as markdown pieces. Kept free of imports from lib/config.ts: the
// config schema uses rulesLength() to check that the rules fit into one Discord message.

/** Discord's limit for all text in one Components V2 message */
export const MAX_RULES_LENGTH = 4000;

export interface RulesText {
	author?: string | undefined;
	title: string;
	intro: string;
	headline: { name: string; text: string };
	list: Array<{ name: string; text: string; note?: string | undefined }>;
	closing?: string | undefined;
}

export interface RulesMarkdown {
	/** Author line (if any), title and intro: shown next to the thumbnail */
	header: string[];
	headline: string;
	list: string;
	closing: string | null;
}

/** Discord's small print applies per line, so every line needs its own prefix */
const smallPrint = (text: string) =>
	text
		.split('\n')
		.map((line) => `-# ${line}`)
		.join('\n');

export function rulesMarkdown(rules: RulesText): RulesMarkdown {
	return {
		header: [...(rules.author ? [smallPrint(rules.author)] : []), `## ${rules.title}`, rules.intro],
		headline: `### ${rules.headline.name}\n${rules.headline.text}`,
		list: rules.list
			.map(({ name, text, note }) => `**${name}**\n${text}${note ? `\n${smallPrint(note)}` : ''}`)
			.join('\n\n'),
		closing: rules.closing ? smallPrint(rules.closing) : null,
	};
}

/** Characters the panel's text displays add up to */
export function rulesLength(rules: RulesText): number {
	const { header, headline, list, closing } = rulesMarkdown(rules);
	return [...header, headline, list, closing ?? ''].reduce((total, text) => total + text.length, 0);
}
