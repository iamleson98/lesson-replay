/**
 * The pictures on the board's sheets: decoded once, kept for the sheets that
 * are shown and the ones next to them, let go of the rest, so a phone never
 * holds a hundred-page deck. The renderer asks for a page's picture while it
 * draws; a picture that arrives asks for a redraw. The way a picture is
 * named (`url`) is given by whoever mounts the board, so the live board and
 * the recording player share all of this.
 */

import type { Sheet } from './pages';

/** A decoded picture. */
export type Picture = CanvasImageSource & { width: number; height: number };

export type PictureState =
	{ status: 'loading' } | { status: 'failed' } | { status: 'ready'; image: Picture };

/** Where a page of a deck is read from, through the class it is shown in (under the API base `base`). */
export const deckPageUrl = (base: string, classId: string, deck: string, n: number): string =>
	`${base}/lms/classes/${classId}/decks/${deck}/pages/${n}`;

export async function loadImage(url: string): Promise<Picture> {
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	await image.decode();
	return image;
}

export class PictureCache {
	/** Bumps whenever a picture arrives or fails: part of what the board's bitmap is drawn from. */
	revision = 0;

	#entries = new Map<string, PictureState>();
	/** The pictures of the sheets shown at the last `track`. */
	#visible = new Set<string>();
	readonly #url: (deck: string, n: number) => string;
	readonly #load: (url: string) => Promise<Picture>;
	readonly #onChange: () => void;
	/** Woken whenever a picture arrives or fails (see `settled`). */
	#waiters = new Set<() => void>();

	constructor(options: {
		url: (deck: string, n: number) => string;
		/** Called when a picture has arrived (or failed): the board draws again. */
		onChange: () => void;
		load?: (url: string) => Promise<Picture>;
	}) {
		this.#url = options.url;
		this.#onChange = options.onChange;
		this.#load = options.load ?? loadImage;
	}

	/** The picture of a page of a deck, which starts loading when it is first asked for. */
	get(deck: string, n: number): PictureState {
		const key = `${deck}/${n}`;
		let state = this.#entries.get(key);
		if (!state) {
			state = { status: 'loading' };
			this.#entries.set(key, state);
			void this.#fetch(key, deck, n);
		}
		return state;
	}

	/**
	 * Keeps the pictures of the sheets shown and their neighbours (loading the
	 * neighbours, so turning a page finds it ready) and lets the others go. A
	 * picture that failed is asked for again when its sheet comes into view.
	 */
	track(sheets: Sheet[], shown: Sheet[]): void {
		const keyOf = (sheet: Sheet) => (sheet.el.deck ? `${sheet.el.deck}/${sheet.el.n}` : null);
		const visible = new Set<string>();
		const keep = new Set<string>();
		for (const sheet of shown) {
			const mine = keyOf(sheet);
			if (mine) visible.add(mine);
			const i = sheets.indexOf(sheet);
			for (const near of sheets.slice(Math.max(0, i - 1), i + 2)) {
				const key = keyOf(near);
				if (key) keep.add(key);
			}
		}
		for (const [key, state] of this.#entries) {
			const retry = state.status === 'failed' && visible.has(key) && !this.#visible.has(key);
			if (!keep.has(key) || retry) this.#entries.delete(key);
		}
		this.#visible = visible;
		for (const key of keep) {
			const [deck, n] = key.split('/');
			this.get(deck, Number(n));
		}
	}

	/**
	 * For a board that is drawn once and not watched (the video render): resolves
	 * when every picture of the sheets shown at the last `track` has arrived or
	 * failed, and says whether any did arrive while it waited (the board must then
	 * be drawn again). A picture still on its way after `timeoutMs` is given up on
	 * (it counts as failed, so the sheet shows its crossed frame, and the next
	 * frames do not wait for it again).
	 */
	async settled(timeoutMs: number): Promise<boolean> {
		const pending = () =>
			[...this.#visible].filter((key) => this.#entries.get(key)?.status === 'loading');
		const deadline = Date.now() + timeoutMs;
		let waited = false;
		for (let keys = pending(); keys.length > 0; keys = pending()) {
			const left = deadline - Date.now();
			if (left <= 0) {
				for (const key of keys) this.#entries.set(key, { status: 'failed' });
				this.revision++;
				return true;
			}
			waited = true;
			await new Promise<void>((resolve) => {
				const wake = () => {
					clearTimeout(timer);
					this.#waiters.delete(wake);
					resolve();
				};
				const timer = setTimeout(wake, left);
				this.#waiters.add(wake);
			});
		}
		return waited;
	}

	async #fetch(key: string, deck: string, n: number): Promise<void> {
		const pending = this.#entries.get(key);
		let next: PictureState;
		try {
			next = { status: 'ready', image: await this.#load(this.#url(deck, n)) };
		} catch {
			next = { status: 'failed' };
		}
		// Let go of meanwhile (or asked for again): this answer is stale.
		if (this.#entries.get(key) !== pending) return;
		this.#entries.set(key, next);
		this.revision++;
		this.#onChange();
		for (const wake of [...this.#waiters]) wake();
	}
}
