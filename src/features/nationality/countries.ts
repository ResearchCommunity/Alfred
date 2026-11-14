/**
 * Country data without a dependency: ISO 3166-1 alpha-2 codes, English names from
 * Node's built-in ICU data (Intl.DisplayNames), and flag emoji computed from the code.
 */

// prettier-ignore
const CODES = [
	'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ',
	'BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR',
	'CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
	'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU',
	'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
	'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ',
	'MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF',
	'PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI',
	'SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR',
	'TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW',
] as const;

export type CountryCode = (typeof CODES)[number];

/** Where ICU's English name is clunky or not what people would search for */
const NAME_OVERRIDES: Partial<Record<CountryCode, string>> = {
	CD: 'DR Congo',
	CG: 'Republic of the Congo',
	HK: 'Hong Kong',
	MO: 'Macao',
	PS: 'Palestine',
	CI: "Côte d'Ivoire",
	MM: 'Myanmar',
};

/** Common things people type that aren't the alpha-2 code */
const ALIASES: Record<string, CountryCode> = {
	USA: 'US',
	AMERICA: 'US',
	UK: 'GB',
	BRITAIN: 'GB',
	ENGLAND: 'GB',
	SCOTLAND: 'GB',
	WALES: 'GB',
	UAE: 'AE',
	HOLLAND: 'NL',
	DEUTSCHLAND: 'DE',
	GER: 'DE',
	SUI: 'CH',
	RUS: 'RU',
	KOREA: 'KR',
	CZECHIA: 'CZ',
	TURKIYE: 'TR',
};

export interface Country {
	code: CountryCode;
	name: string;
	flag: string;
}

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function flagEmoji(code: string): string {
	// Flags are pairs of "regional indicator" symbols: A = U+1F1E6, B = U+1F1E7, …
	return String.fromCodePoint(
		...code
			.toUpperCase()
			.split('')
			.map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
	);
}

export const COUNTRIES: readonly Country[] = CODES.map((code) => ({
	code,
	name: NAME_OVERRIDES[code] ?? displayNames.of(code) ?? code,
	flag: flagEmoji(code),
})).toSorted((a, b) => a.name.localeCompare(b.name, 'en'));

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code as string, country]));

const normalize = (text: string) =>
	text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toUpperCase()
		// "cote divoire" should find "Côte d'Ivoire": compare letters and digits only
		.replace(/[^A-Z0-9]/g, '');

/** Exact lookup: alpha-2 code, alias, or full name ("de", "UK", "germany") */
export function resolveCountry(query: string): Country | undefined {
	const normalized = normalize(query);
	return (
		BY_CODE.get(normalized) ??
		BY_CODE.get(ALIASES[normalized] ?? '') ??
		COUNTRIES.find((country) => normalize(country.name) === normalized)
	);
}

/** Ranked suggestions for autocomplete: exact matches, then name prefix, then substring */
export function searchCountries(query: string, limit = 25): Country[] {
	const normalized = normalize(query);
	if (!normalized) return COUNTRIES.slice(0, limit);

	const exact = resolveCountry(query);
	const prefix = COUNTRIES.filter((country) => normalize(country.name).startsWith(normalized));
	const substring = COUNTRIES.filter((country) => normalize(country.name).includes(normalized));

	return [...new Set([...(exact ? [exact] : []), ...prefix, ...substring])].slice(0, limit);
}

export function roleName(country: Country): string {
	return `${country.flag} ${country.name}`;
}

/** Stable color per country, so a recreated role looks the same as before */
export function roleColor(code: string): number {
	const hue = (code.split('').reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7) * 47) % 360;
	// HSL(hue, 55%, 60%) → RGB
	const s = 0.55;
	const l = 0.6;
	const k = (n: number) => (n + hue / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
	return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}
