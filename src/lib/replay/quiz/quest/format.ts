/** Minutes and seconds of a time left, as a clock reads: `4:07`. */
export function clock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const s = total % 60;
	return `${Math.floor(total / 60)}:${s < 10 ? '0' : ''}${s}`;
}

/** The share of right answers as a whole percentage, or null before any answer. */
export function accuracy(correct: number, answers: number): number | null {
	return answers > 0 ? Math.round((100 * correct) / answers) : null;
}
