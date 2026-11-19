/**
 * The board's state on this client: every element's latest envelope,
 * merged with the server's last-writer-wins rule (modelhelper
 * WhiteboardElement.Wins — higher version, then lower nonce), so all
 * clients converge on what the database holds whatever order writes
 * arrive in. Deleted elements stay as tombstones: an older write that
 * arrives late must not bring them back.
 *
 * Reactivity is one `revision` counter rather than deep state — the
 * canvas redraws from `ordered()` when it changes, and thousands of
 * points never pass through Svelte's proxies.
 */

import type { Envelope } from '../types';
import { loadPack, packLoaded } from './packs';
import {
	compareZ,
	decodeElement,
	elementBounds,
	hitTest,
	PACK_OF,
	VIEW_ID,
	type BoardElement,
	type MeasureText,
	type Point,
	type Rect,
	type ViewElement
} from './elements';

export type { Envelope };

type Entry = { env: Envelope; el: BoardElement | null };

export type OrderedElement = { id: string; el: BoardElement };

/** Whether `next` replaces `current` (the server's rule, exactly). */
export function wins(next: Envelope, current: Envelope): boolean {
	if (next.version !== current.version) return next.version > current.version;
	return next.version_nonce < current.version_nonce;
}

const randomNonce = () => Math.floor(Math.random() * 2 ** 31);

export function newElementId(): string {
	return crypto.randomUUID().replaceAll('-', '').slice(0, 24);
}

export class BoardScene {
	/** Bumps on every visible change. */
	revision = $state(0);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- deliberately not reactive: `revision` signals changes
	#entries = new Map<string, Entry>();
	#ordered: OrderedElement[] | null = null;

	/** The live element (null when deleted, unknown or malformed). */
	element(id: string): BoardElement | null {
		return this.#entries.get(id)?.el ?? null;
	}

	/** Which sheet the teacher is on, once they have moved. */
	view(): ViewElement | null {
		const el = this.element(VIEW_ID);
		return el?.type === 'view' ? el : null;
	}

	/** Merges writes from the server or other clients; true if anything changed. */
	merge(envelopes: Envelope[]): boolean {
		let changed = false;
		for (const env of envelopes) {
			const current = this.#entries.get(env.id);
			if (current && !wins(env, current.env)) continue;
			const el = env.is_deleted ? null : decodeElement(env.data);
			this.#entries.set(env.id, { env, el });
			if (!el && !env.is_deleted) this.#wantPack(env.data);
			changed = true;
		}
		if (changed) this.#touch();
		return changed;
	}

	/**
	 * A local edit: the element's next version (null deletes it). Returns
	 * the envelope to send to the server.
	 */
	write(id: string, el: BoardElement | null): Envelope {
		const current = this.#entries.get(id);
		const env: Envelope = {
			id,
			version: (current?.env.version ?? 0) + 1,
			version_nonce: randomNonce(),
			is_deleted: el === null,
			// An erased element travels and is stored without its shape.
			data: el === null ? {} : (el as unknown as Envelope['data'])
		};
		this.#entries.set(id, { env, el });
		this.#touch();
		return env;
	}

	/**
	 * Takes back local writes the server refused: an element whose latest
	 * version is the refused one is forgotten (a load puts the server's back),
	 * one written again since is left as it is.
	 */
	revert(envelopes: Envelope[]): void {
		let changed = false;
		for (const env of envelopes) {
			const current = this.#entries.get(env.id)?.env;
			if (current?.version === env.version && current.version_nonce === env.version_nonce) {
				this.#entries.delete(env.id);
				changed = true;
			}
		}
		if (changed) this.#touch();
	}

	/** Forgets everything (the teacher cleared the board). */
	clear(): void {
		this.#entries.clear();
		this.#touch();
	}

	/** The box around every live element (null on an empty board). */
	contentBounds(measure: MeasureText): Rect | null {
		const list = this.ordered();
		if (list.length === 0) return null;
		return list.reduce<Rect>(
			(acc, { el }) => {
				const b = elementBounds(el, measure);
				return {
					minX: Math.min(acc.minX, b.minX),
					minY: Math.min(acc.minY, b.minY),
					maxX: Math.max(acc.maxX, b.maxX),
					maxY: Math.max(acc.maxY, b.maxY)
				};
			},
			{ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
		);
	}

	/** Live elements, bottom to top (the view is a control, not an element of the board). */
	ordered(): OrderedElement[] {
		if (!this.#ordered) {
			const list: OrderedElement[] = [];
			for (const [id, entry] of this.#entries) {
				if (entry.el && entry.el.type !== 'view') list.push({ id, el: entry.el });
			}
			this.#ordered = list.sort(compareZ);
		}
		return this.#ordered;
	}

	/** The topmost element under a point, if any. */
	topmostAt(p: Point, tolerance: number, measure: MeasureText): OrderedElement | null {
		const list = this.ordered();
		for (let i = list.length - 1; i >= 0; i--) {
			if (hitTest(list[i].el, p, tolerance, measure)) return list[i];
		}
		return null;
	}

	/** Next stacking value: above everything on the board. */
	nextZ(): number {
		const list = this.ordered();
		return Math.max(Date.now(), (list.at(-1)?.el.z ?? 0) + 1);
	}

	/**
	 * An element of a type from a pack that is not loaded reads as nothing:
	 * load the pack, then read those again (a student sees what the teacher
	 * drew without having turned anything on).
	 */
	#wantPack(data: unknown) {
		const type = (data as { type?: unknown } | null)?.type;
		const pack = typeof type === 'string' ? PACK_OF[type] : undefined;
		if (!pack || packLoaded(pack)) return;
		loadPack(pack).then(
			() => this.#decodePending(),
			() => {} // offline or a bad deploy: the element stays unread, nothing else is affected
		);
	}

	#decodePending() {
		let changed = false;
		for (const [id, entry] of this.#entries) {
			if (entry.el || entry.env.is_deleted) continue;
			const el = decodeElement(entry.env.data);
			if (el) {
				this.#entries.set(id, { env: entry.env, el });
				changed = true;
			}
		}
		if (changed) this.#touch();
	}

	#touch() {
		this.#ordered = null;
		this.revision++;
	}
}

/** One undoable action: each element's state before and after it. */
export type HistoryStep = { id: string; before: BoardElement | null; after: BoardElement | null }[];

const HISTORY_LIMIT = 100;

/**
 * Undo/redo of this user's own edits. Undoing writes the "before" state
 * as a new version, so it syncs like any other edit.
 */
export class BoardHistory {
	#undo = $state.raw<HistoryStep[]>([]);
	#redo = $state.raw<HistoryStep[]>([]);

	get canUndo(): boolean {
		return this.#undo.length > 0;
	}

	get canRedo(): boolean {
		return this.#redo.length > 0;
	}

	record(step: HistoryStep): void {
		if (step.length === 0) return;
		this.#undo = [...this.#undo.slice(-(HISTORY_LIMIT - 1)), step];
		this.#redo = [];
	}

	/** The step to revert (its `before` states are to be written). */
	undo(): HistoryStep | null {
		const step = this.#undo.at(-1);
		if (!step) return null;
		this.#undo = this.#undo.slice(0, -1);
		this.#redo = [...this.#redo, step];
		return step;
	}

	/** The step to re-apply (its `after` states are to be written). */
	redo(): HistoryStep | null {
		const step = this.#redo.at(-1);
		if (!step) return null;
		this.#redo = this.#redo.slice(0, -1);
		this.#undo = [...this.#undo, step];
		return step;
	}

	reset(): void {
		this.#undo = [];
		this.#redo = [];
	}
}
