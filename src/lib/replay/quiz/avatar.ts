/**
 * A player's avatar, worked out from their name alone (it costs nothing on
 * the wire and is the same on every screen): an animal on a coloured disc.
 * Tone classes are written out for Tailwind; each is a tinted disc with a
 * 700/300 step for the glyph's ring, never text.
 */
const ANIMALS = [
	'🦊',
	'🐼',
	'🐨',
	'🦁',
	'🐯',
	'🐸',
	'🐙',
	'🦉',
	'🐧',
	'🦄',
	'🐢',
	'🐬',
	'🦋',
	'🐝',
	'🦖',
	'🐳',
	'🦔',
	'🐰'
];

const DISCS = [
	'bg-red-500/20 ring-red-600/40 dark:bg-red-400/20 dark:ring-red-300/40',
	'bg-blue-500/20 ring-blue-600/40 dark:bg-blue-400/20 dark:ring-blue-300/40',
	'bg-amber-500/25 ring-amber-600/40 dark:bg-amber-400/20 dark:ring-amber-300/40',
	'bg-green-500/20 ring-green-600/40 dark:bg-green-400/20 dark:ring-green-300/40',
	'bg-violet-500/20 ring-violet-600/40 dark:bg-violet-400/20 dark:ring-violet-300/40',
	'bg-cyan-500/20 ring-cyan-600/40 dark:bg-cyan-400/20 dark:ring-cyan-300/40',
	'bg-pink-500/20 ring-pink-600/40 dark:bg-pink-400/20 dark:ring-pink-300/40'
];

/** A small stable hash (FNV-1a) of the name. */
function hash(name: string): number {
	let h = 0x811c9dc5;
	for (const ch of name.trim().toLowerCase()) {
		h ^= ch.codePointAt(0)!;
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

type Avatar = { emoji: string; disc: string; initial: string };

export function avatarOf(name: string): Avatar {
	const h = hash(name);
	return {
		emoji: ANIMALS[h % ANIMALS.length],
		disc: DISCS[(h >>> 8) % DISCS.length],
		initial: ([...name.trim()][0] ?? '?').toUpperCase()
	};
}
