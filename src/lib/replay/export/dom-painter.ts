/**
 * Paints mounted page content (the quiz and Quest stages, the player's own
 * components) into a frame: the tree is serialised into an SVG `foreignObject`,
 * loaded as an image and drawn on the canvas. Loading the image costs tens of
 * milliseconds (the engine reads the CSS again each time), and a game changes
 * about once a second, so the image is made only when the serialised tree
 * differs from the last one and the frames in between draw the bitmap they
 * already have.
 *
 * The frame loop calls `begin()` as soon as it knows the stage is on screen
 * (that starts the load of a changed tree), does its other work (the camera's
 * decode), then `await draw(ctx)`: the frame that needs a new bitmap waits for
 * exactly that bitmap, so the output never depends on timing, and a load in
 * flight never holds a frame that has the bitmap it needs. Chrome only (other
 * engines taint a canvas a foreignObject was drawn on).
 */

import {
	CssPruner,
	loadFonts,
	sheetRules,
	stillCss,
	svgDataUrl,
	svgShell,
	treeMatcher,
	wrapperStyle,
	type RuleLike,
	type SvgShell
} from './dom-css';
import type { Box } from './layout';
import type { Ctx } from './painters';
import { RenderError, within } from './render-error';

/** The countdown ring (`quiz/components/ring.svelte`, radius 44) moves in steps of 1/60 of its circle: a still second of a 20 s question is three steps, never a repaint per frame. */
const RING_STEP = (2 * Math.PI * 44) / 60;

/** The ring's stroke offsets rounded to a step. */
export function quantiseRings(markup: string): string {
	return markup.replace(
		/stroke-dashoffset="(-?[\d.]+(?:e[+-]?\d+)?)"/gi,
		(_all, offset: string) =>
			`stroke-dashoffset="${(Math.round(Number(offset) / RING_STEP) * RING_STEP).toFixed(2)}"`
	);
}

/** The class names a serialised tree uses. */
function classNames(markup: string): string[] {
	return [...markup.matchAll(/\sclass="([^"]*)"/g)]
		.flatMap((m) => m[1].split(/\s+/))
		.filter(Boolean);
}

/** Loads the SVG at `url` as a decoded image. */
export type LoadImage = (url: string) => Promise<CanvasImageSource>;

const decodeImage: LoadImage = async (url) => {
	const image = new Image();
	image.src = url;
	await image.decode();
	return image;
};

const fetchFont = async (url: string): Promise<Uint8Array> => {
	const response = await fetch(new URL(url, document.baseURI));
	if (!response.ok) throw new RenderError('render_failed');
	return new Uint8Array(await response.arrayBuffer());
};

/** One screen of the content: shows it (and applies it to the DOM) so its styles can be collected. */
export type DomScreen = () => void | Promise<void>;

export type DomPainterOptions = {
	/** The element the content is mounted in; its class (the theme) and its children are what is painted. */
	host: HTMLElement;
	/** Where the content is drawn in the frame; its size is the stage's. */
	box: Box;
	/** Every screen the render can show, in any order; the style sheets are cut to what they use. */
	screens: readonly DomScreen[];
	/** For tests. */
	rules?: RuleLike[];
	readFont?: (url: string) => Promise<Uint8Array>;
	loadImage?: LoadImage;
};

export class DomPainter {
	readonly #host: HTMLElement;
	readonly #box: Box;
	readonly #pruner: CssPruner;
	readonly #fonts: ReadonlyMap<string, string>;
	readonly #load: LoadImage;
	readonly #seen = new Set<string>();
	#shell: SvgShell;
	/** The tree the latest image was (or is being) made from. */
	#markup = '';
	#image: Promise<CanvasImageSource> | null = null;

	private constructor(
		host: HTMLElement,
		box: Box,
		pruner: CssPruner,
		fonts: ReadonlyMap<string, string>,
		load: LoadImage
	) {
		this.#host = host;
		this.#box = box;
		this.#pruner = pruner;
		this.#fonts = fonts;
		this.#load = load;
		this.#shell = this.#makeShell();
	}

	/** Collects the CSS of every screen, reads the fonts, and is ready to paint. */
	static async create(options: DomPainterOptions): Promise<DomPainter> {
		const { host, box, screens } = options;
		const pruner = new CssPruner(options.rules ?? sheetRules(Array.from(document.styleSheets)));
		const matches = treeMatcher(host);
		const painter = new DomPainter(
			host,
			box,
			pruner,
			await within('render_failed', async () => {
				// Font files are named by rules that are always kept.
				pruner.scan(() => false);
				return loadFonts(pruner.text(), options.readFont ?? fetchFont);
			}),
			options.loadImage ?? decodeImage
		);
		for (const show of screens) {
			await show();
			pruner.scan(matches);
			painter.#note(painter.#serialise());
		}
		painter.#shell = painter.#makeShell();
		return painter;
	}

	#makeShell(): SvgShell {
		return svgShell(this.#box, stillCss(this.#pruner.text(), this.#fonts));
	}

	/** The mounted content as XHTML: a copy of the host in an explicit-size wrapper, the rings in steps. */
	#serialise(): string {
		const wrapper = this.#host.cloneNode(true) as HTMLElement;
		wrapper.removeAttribute('id');
		wrapper.setAttribute('style', wrapperStyle(this.#box));
		return quantiseRings(new XMLSerializer().serializeToString(wrapper));
	}

	/** Notes the class names of a tree; whether any was new. */
	#note(markup: string): boolean {
		let fresh = false;
		for (const name of classNames(markup)) {
			if (!this.#seen.has(name)) {
				this.#seen.add(name);
				fresh = true;
			}
		}
		return fresh;
	}

	/**
	 * Starts the image of what is mounted now if it differs from the last one;
	 * does nothing when it is the same. Cheap enough to call on every frame.
	 */
	begin(): void {
		const markup = this.#serialise();
		// A class no screen of the scan used: the screens may need a rule the scan never matched.
		if (this.#note(markup)) {
			const before = this.#pruner.size;
			this.#pruner.scan(treeMatcher(this.#host));
			if (this.#pruner.size !== before) {
				this.#shell = this.#makeShell();
				this.#markup = '';
			}
		}
		if (markup === this.#markup) return;
		this.#markup = markup;
		const image = this.#load(svgDataUrl(this.#shell, markup));
		// `draw` reports a failure; one nobody draws (the frame failed first) is not unhandled.
		image.catch(() => undefined);
		this.#image = image;
	}

	/** Draws the image `begin()` started, waiting for it if it is still loading. */
	async draw(ctx: Ctx): Promise<void> {
		const pending = this.#image;
		if (!pending) throw new RenderError('render_failed');
		const image = await within('render_failed', () => pending);
		ctx.drawImage(image, this.#box.x, this.#box.y, this.#box.w, this.#box.h);
	}
}
