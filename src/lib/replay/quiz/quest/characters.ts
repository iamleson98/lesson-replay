/**
 * The twelve characters of Quest, original animals drawn by us (see
 * `components/character-art.svelte`). A character is a small number on the wire;
 * its name is shown beside the picture wherever it can be chosen, so the
 * drawing is never the only cue.
 */
import { CHARACTERS } from './quest-protocol';

/** Their i18n keys, in the order of the numbers `0` to `11`. */
export const CHARACTER_KEYS = [
	'quest.character.fox',
	'quest.character.owl',
	'quest.character.turtle',
	'quest.character.frog',
	'quest.character.cat',
	'quest.character.penguin',
	'quest.character.hedgehog',
	'quest.character.whale',
	'quest.character.bunny',
	'quest.character.bee',
	'quest.character.crab',
	'quest.character.elephant'
] as const;

/** The ring each character's disc wears, a hue of its own (never the only cue). */
export const CHARACTER_RINGS = [
	'ring-orange-500',
	'ring-amber-600',
	'ring-green-600',
	'ring-lime-500',
	'ring-violet-500',
	'ring-blue-700',
	'ring-yellow-800',
	'ring-sky-500',
	'ring-pink-500',
	'ring-yellow-400',
	'ring-red-500',
	'ring-slate-500'
] as const;

export const characterIds = Array.from({ length: CHARACTERS }, (_, i) => i);

/** A stable character for a name nobody has told us about (a podium row of a game we joined late). */
export function fallbackCharacter(name: string): number {
	let h = 0x811c9dc5;
	for (const ch of name.trim().toLowerCase()) {
		h ^= ch.codePointAt(0)!;
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % CHARACTERS;
}
