/**
 * Type sizes that step down with the length of the text, so a long question or
 * six long options fit their place by wrapping at a smaller size, never by
 * being cut: question and option text is never truncated. The floor is 14 px
 * (`text-sm`); what still does not fit makes the stage's one scrolling region
 * scroll. Class names are written out for Tailwind.
 */
export function questionSize(length: number): string {
	if (length > 260) return 'text-sm sm:text-xl';
	if (length > 140) return 'text-base sm:text-2xl';
	if (length > 70) return 'text-lg sm:text-3xl';
	return 'text-xl sm:text-4xl';
}

export function optionSize(length: number): string {
	if (length > 120) return 'text-sm';
	if (length > 60) return 'text-sm sm:text-base';
	if (length > 30) return 'text-base sm:text-lg';
	return 'text-base sm:text-xl';
}

/** The most lines an option may take before the tiles go one to a row. */
const MAX_OPTION_LINES = 3;
/** What a tile spends beside its text (shape and number, check slot, padding, gaps), in px. */
const TILE_CHROME = 92;
/** About how wide a character of a bold 14 to 16 px option is, in px. */
const CHAR_PX = 8.5;

/**
 * How many columns the option tiles take in a grid `width` px wide: two, unless
 * the longest option would need more than three lines in a half-width tile
 * (a 320 px phone with a 60-character option), then one, so every word stays
 * readable without making a tile huge.
 */
export function tileColumns(width: number, longest: number): 1 | 2 {
	if (width <= 0) return 2;
	const text = (width - 8) / 2 - TILE_CHROME;
	const perLine = Math.max(1, Math.floor(text / CHAR_PX));
	return Math.ceil(longest / perLine) > MAX_OPTION_LINES ? 1 : 2;
}
