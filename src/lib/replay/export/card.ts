/**
 * The countdown card that can open a video: what it says and how the text is
 * fitted, apart from the painting (`card-painter.ts`), so it can be tested without a
 * canvas. The card is `prerollMs` of frames before the lesson's first one; its
 * inputs come from the page's address like the others, and are bounded here again
 * (the worker bounds them too).
 */

import { FPS } from './frame-clock';

/** The lengths of card the site offers (ms); any other value draws no card. */
export const PREROLLS_MS: readonly number[] = [0, 60_000, 120_000, 300_000, 600_000];
export const CARD_TITLE_CHARS = 80;
export const CARD_TEACHER_CHARS = 60;

export type CardInputs = { prerollMs: number; title: string; teacher: string };

/** `text` without control characters, trimmed, at most `max` characters (not UTF-16 units). */
export function cleanText(text: string, max: number): string {
	const plain = text.replace(/[\p{Cc}\u2028\u2029]/gu, '');
	return Array.from(plain.trim()).slice(0, max).join('').trimEnd();
}

/** The card's inputs from the page's fragment: no card (0) unless the length is one offered. */
export function cardInputs(q: URLSearchParams): CardInputs {
	const raw = q.get('preroll') ?? '';
	const preroll = /^\d{1,7}$/.test(raw) ? Number(raw) : 0;
	const prerollMs = PREROLLS_MS.includes(preroll) ? preroll : 0;
	return {
		prerollMs,
		title: cleanText(q.get('card_title') ?? '', CARD_TITLE_CHARS),
		teacher: cleanText(q.get('card_teacher') ?? '', CARD_TEACHER_CHARS)
	};
}

/**
 * The seconds the countdown shows on card frame `i` of `cardFrames`: the time left, rounded up,
 * so the card opens on the whole length ("5:00") and its last frame still reads "0:01".
 * Whole frames, so a second never lands a frame early or late.
 */
export const countdownSeconds = (i: number, cardFrames: number): number =>
	Math.ceil((cardFrames - i) / FPS);

/** `M:SS`. */
export function formatCountdown(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type Measure = (text: string, px: number) => number;
export type FittedTitle = { px: number; lines: string[] };

/** Greedy word wrap of `text` into lines no wider than `width` at `px`; a word wider than a line is cut. */
export function wrapLines(text: string, width: number, px: number, measure: Measure): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const joined = line ? `${line} ${word}` : word;
		if (measure(joined, px) <= width) {
			line = joined;
			continue;
		}
		if (line) lines.push(line);
		const chars = Array.from(word);
		let from = 0;
		// A word wider than a line is cut where it stops fitting; what is left starts the next line.
		while (measure(chars.slice(from).join(''), px) > width) {
			let cut = chars.length - 1;
			while (cut > from + 1 && measure(chars.slice(from, cut).join(''), px) > width) cut--;
			lines.push(chars.slice(from, cut).join(''));
			from = cut;
		}
		line = chars.slice(from).join('');
	}
	if (line) lines.push(line);
	return lines;
}

/** `text` cut to fit `width` at `px`, ending in an ellipsis. */
function ellipsize(text: string, width: number, px: number, measure: Measure): string {
	const chars = Array.from(text);
	for (let n = chars.length; n > 0; n--) {
		const shown = `${chars.slice(0, n).join('').trimEnd()}…`;
		if (measure(shown, px) <= width) return shown;
	}
	return '…';
}

/**
 * The title in at most `maxLines` lines: the largest size from `maxPx` down to `minPx`
 * (steps of 2) at which it fits; at `minPx` what still does not fit is cut with an ellipsis.
 */
export function fitTitle(
	title: string,
	width: number,
	measure: Measure,
	{ maxPx, minPx, maxLines }: { maxPx: number; minPx: number; maxLines: number }
): FittedTitle {
	for (let px = maxPx; px >= minPx; px -= 2) {
		const lines = wrapLines(title, width, px, measure);
		if (lines.length <= maxLines) return { px, lines };
	}
	const lines = wrapLines(title, width, minPx, measure);
	const kept = lines.slice(0, maxLines);
	const rest = lines.slice(maxLines - 1).join(' ');
	kept[maxLines - 1] = ellipsize(rest, width, minPx, measure);
	return { px: minPx, lines: kept };
}
