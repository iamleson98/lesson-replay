/**
 * The CSS and the SVG shell of a game stage painted from the page's own
 * styles. The screens are serialised into an SVG `foreignObject` and drawn as
 * a still image, which re-reads its CSS every time: so the style sheets are
 * cut down once to the rules the screens use, the two things a still image
 * reads differently are fixed in the text, and the fonts go in as data URLs
 * (an image loads nothing from the network).
 */

import type { Box } from './layout';

/** A CSS rule as far as this file reads it (the browser's `CSSRule`, or a stand-in in tests). */
export type RuleLike = {
	cssText: string;
	selectorText?: string;
	cssRules?: ArrayLike<RuleLike>;
};

/** Rules that only hold other rules (their head is kept, their content pruned). */
const GROUPS = /^@(media|supports|layer|container|scope)\b/i;

/** Selectors that always stay: the variables and the theme class. */
const ALWAYS = /(^|,)\s*(:root|html|body|:host|\.dark)(?![\w\\-])/;

/** The top-level rules of every readable style sheet (a cross-origin one cannot be read and has none of ours). */
export function sheetRules(sheets: Iterable<{ cssRules: ArrayLike<RuleLike> }>): RuleLike[] {
	const out: RuleLike[] = [];
	for (const sheet of sheets) {
		try {
			out.push(...Array.from(sheet.cssRules));
		} catch {
			/* cross-origin */
		}
	}
	return out;
}

/**
 * A selector as it is tested against the mounted tree: pseudo-elements say
 * nothing about which element matches, so they go. A colon escaped in a class
 * name (`.sm\:p-5`) stays.
 */
export function forTree(selector: string): string {
	return selector.replace(/(?<!\\)::[\w-]+(\([^)]*\))?|(?<!\\):(before|after)\b/g, '');
}

/** Whether `selector` matches the tree under `root`; a selector the browser cannot parse is kept. */
export function treeMatcher(root: Element): (selector: string) => boolean {
	return (selector) => {
		try {
			return root.matches(selector) || root.querySelector(selector) !== null;
		} catch {
			return true;
		}
	};
}

/**
 * The rules some screen uses. `scan` marks the rules that match what is
 * mounted now (call it for every screen the render can show; a rule stays
 * marked), `text` writes the marked ones.
 */
export class CssPruner {
	readonly #rules: RuleLike[];
	readonly #used = new Set<RuleLike>();

	constructor(rules: RuleLike[]) {
		this.#rules = rules;
	}

	/** How many rules are marked (it grows only when a scan finds a new one). */
	get size(): number {
		return this.#used.size;
	}

	scan(matches: (selector: string) => boolean): void {
		for (const rule of this.#rules) this.#mark(rule, matches);
	}

	#mark(rule: RuleLike, matches: (selector: string) => boolean): boolean {
		if (this.#used.has(rule)) {
			// A used group may still hold rules no screen has matched yet.
			if (rule.selectorText === undefined && GROUPS.test(rule.cssText))
				this.#scanGroup(rule, matches);
			return true;
		}
		if (rule.selectorText !== undefined) {
			const keep = ALWAYS.test(rule.selectorText) || matches(forTree(rule.selectorText));
			if (keep) this.#used.add(rule);
			return keep;
		}
		if (rule.cssRules && GROUPS.test(rule.cssText)) {
			const any = this.#scanGroup(rule, matches);
			if (any) this.#used.add(rule);
			return any;
		}
		// @font-face, @property, @keyframes, @layer statements, @import: always kept.
		this.#used.add(rule);
		return true;
	}

	#scanGroup(rule: RuleLike, matches: (selector: string) => boolean): boolean {
		let any = false;
		for (const inner of Array.from(rule.cssRules ?? []))
			any = this.#mark(inner, matches) || any;
		return any;
	}

	text(): string {
		return this.#rules.map((rule) => this.#write(rule)).join('\n');
	}

	#write(rule: RuleLike): string {
		if (!this.#used.has(rule)) return '';
		if (rule.selectorText !== undefined || !rule.cssRules || !GROUPS.test(rule.cssText))
			return rule.cssText;
		const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
		return `${head}{${Array.from(rule.cssRules)
			.map((inner) => this.#write(inner))
			.join('')}}`;
	}
}

const FONT_URL = /url\(\s*(["']?)([^"')]+\.woff2)\1\s*\)/g;

/** The font files the CSS names. */
export function fontUrls(css: string): string[] {
	return [...new Set([...css.matchAll(FONT_URL)].map((m) => m[2]))];
}

/** A file's bytes as a `data:` URL of the given type. */
export function toDataUrl(bytes: Uint8Array, type: string): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return `data:${type};base64,${btoa(binary)}`;
}

/** Reads every font the CSS names into data URLs (by the name as the CSS writes it). */
export async function loadFonts(
	css: string,
	read: (url: string) => Promise<Uint8Array>
): Promise<Map<string, string>> {
	const fonts = new Map<string, string>();
	for (const url of fontUrls(css)) fonts.set(url, toDataUrl(await read(url), 'font/woff2'));
	return fonts;
}

/**
 * The CSS as a still image reads it. A still SVG image never matches
 * `prefers-reduced-motion`, so the queries are pinned to the reduced state the
 * render runs in; scrollbars are hidden (a list that overflows would show
 * one); the fonts are inlined.
 */
export function stillCss(css: string, fonts: ReadonlyMap<string, string>): string {
	return (
		css
			.replace(FONT_URL, (all, _quote, url: string) => {
				const data = fonts.get(url);
				return data ? `url("${data}")` : all;
			})
			.replace(/\(prefers-reduced-motion:\s*reduce\)/g, 'all')
			.replace(/\(prefers-reduced-motion:\s*no-preference\)/g, 'not all') +
		'\n*{scrollbar-width:none}'
	);
}

/** The style of the explicit-size wrapper of a mounted stage: what the page's html and body rules would give it. */
export const wrapperStyle = (size: Pick<Box, 'w' | 'h'>): string =>
	`position:relative;width:${size.w}px;height:${size.h}px;overflow:hidden;` +
	'font-family:var(--font-sans);background:var(--background);color:var(--foreground);';

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export type SvgShell = {
	/** What comes before the serialised stage, and after it (plain text). */
	head: string;
	tail: string;
	/** `head` and `tail` percent-encoded once, for a `data:` URL. */
	headEncoded: string;
	tailEncoded: string;
};

/** The SVG that holds a serialised stage in a `foreignObject` of the stage's size, with the stage's CSS. */
export function svgShell(size: Pick<Box, 'w' | 'h'>, css: string): SvgShell {
	const { w, h } = size;
	const head =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
		`<foreignObject width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml">` +
		`<style>${escapeXml(css)}</style>`;
	const tail = '</div></foreignObject></svg>';
	return {
		head,
		tail,
		headEncoded: encodeURIComponent(head),
		tailEncoded: encodeURIComponent(tail)
	};
}

/** The whole SVG text for a serialised stage. */
export const svgText = (shell: SvgShell, markup: string): string =>
	shell.head + markup + shell.tail;

/** The `data:` URL of the same image (the shell is encoded once; only the stage is encoded per paint). */
export const svgDataUrl = (shell: SvgShell, markup: string): string =>
	`data:image/svg+xml;charset=utf-8,${shell.headEncoded}${encodeURIComponent(markup)}${shell.tailEncoded}`;
