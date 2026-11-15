// Display formatting. Durations and currency are integer seconds internally.

/** `3d 4h 12m`, `45m`; anything under a minute shows as `0m` */
export function formatDuration(seconds: number): string {
	const minutes = Math.floor(Math.max(0, seconds) / 60);
	const parts = [
		[Math.floor(minutes / 1440), 'd'],
		[Math.floor((minutes % 1440) / 60), 'h'],
		[minutes % 60, 'm'],
	] as const;
	const shown = parts.filter(([value]) => value > 0).map(([value, unit]) => `${value}${unit}`);
	return shown.length > 0 ? shown.join(' ') : '0m';
}

/** Hours of currency, at most one decimal, rounded down so a balance is never overstated */
export function formatCurrency(seconds: number, name: string): string {
	const hours = Math.floor((seconds / 3600) * 10) / 10;
	return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${name}`;
}

export function formatMultiplier(factor: number): string {
	return `${factor.toFixed(1)}x`;
}

/** Discord renders this in every viewer's own time zone, as "15 November 2026 04:21" */
export function absoluteTime(date: Date): string {
	return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

/** Discord renders this in every viewer's own time zone, as "in 3 hours" */
export function relativeTime(date: Date): string {
	return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}
