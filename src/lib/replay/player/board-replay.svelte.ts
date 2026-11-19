/**
 * The whiteboard of a recording, at any moment of it. The recorder logged
 * every change as it reached the room (rtcd/crates/recorder/src/board.rs): snapshots,
 * element writes, clears, the lock and people's pointers. Playing forward
 * applies the records since the last position; seeking back rebuilds from
 * the start (a few thousand merges, well under a frame). The log also carries
 * the lesson's quiz game (`quiz` records): the board skips them, `QuizReplay`
 * plays them.
 */

import { SvelteMap } from 'svelte/reactivity';
import { BoardScene, type Envelope } from '../board/scene.svelte.js';
import {
	applyPresence,
	PRESENCE_TTL_MS,
	type PresencePayload,
	type RemotePresence
} from '../board/presence';

export type BoardRecord = {
	/** Offset into the recording (ms). */
	t: number;
	k: 'snapshot' | 'elements' | 'clear' | 'lock' | 'presence' | 'quiz';
	u?: string;
	/** A `quiz` record: the quiz service's frame as it was received (see `quiz-replay.svelte.ts`). */
	q?: unknown[];
	elements?: Envelope[];
	locked?: boolean;
	p?: PresencePayload;
};

const KINDS = new Set(['snapshot', 'elements', 'clear', 'lock', 'presence', 'quiz']);

/** Reads the log's lines; a malformed line is skipped, not fatal. */
export function parseBoardLog(text: string): BoardRecord[] {
	const records: BoardRecord[] = [];
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		try {
			const r = JSON.parse(line) as BoardRecord;
			if (typeof r.t === 'number' && KINDS.has(r.k)) records.push(r);
		} catch {
			// a truncated last line (the recorder stopped mid-write)
		}
	}
	// Written in arrival order; a stable sort only guards against a clock step.
	return records.sort((a, b) => a.t - b.t);
}

/** Unzips the board log (gzip, as served). */
export async function readBoardLog(data: Blob): Promise<BoardRecord[]> {
	const text = await new Response(
		data.stream().pipeThrough(new DecompressionStream('gzip'))
	).text();
	return parseBoardLog(text);
}

export class BoardReplay {
	readonly scene = new BoardScene();
	/** Pointers and strokes being drawn, by person (offsets as `at`). */
	readonly remote = new SvelteMap<string, RemotePresence>();
	locked = $state(false);

	#records: BoardRecord[];
	/** Records before this index are applied. */
	#next = 0;
	#time = -1;

	constructor(records: BoardRecord[]) {
		this.#records = records;
	}

	/** Shows the board as it was at `t` (ms into the recording). */
	seek(t: number): void {
		if (t < this.#time) {
			this.scene.clear();
			this.remote.clear();
			this.locked = false;
			this.#next = 0;
		}
		this.#time = t;
		const pending: Envelope[] = [];
		const flush = () => {
			if (pending.length) this.scene.merge(pending.splice(0));
		};
		while (this.#next < this.#records.length && this.#records[this.#next].t <= t) {
			const r = this.#records[this.#next++];
			switch (r.k) {
				case 'snapshot':
				case 'elements':
					// Consecutive writes merge in one pass (one redraw).
					if (Array.isArray(r.elements)) pending.push(...r.elements);
					if (r.k === 'snapshot') this.locked = r.locked === true;
					if (r.k === 'elements' && r.u) this.#clearPreview(r.u);
					break;
				case 'clear':
					pending.length = 0;
					this.scene.clear();
					break;
				case 'lock':
					this.locked = r.locked === true;
					break;
				case 'presence':
					if (r.u) {
						const presence = applyPresence(this.remote.get(r.u), r.p ?? {}, r.t, (id) =>
							this.scene.element(id)
						);
						if (presence) this.remote.set(r.u, presence);
						else this.remote.delete(r.u);
					}
					break;
			}
		}
		flush();
		// A pointer that went quiet left the room's screens too.
		for (const [id, p] of this.remote) {
			if (p.at < t - PRESENCE_TTL_MS) this.remote.delete(id);
		}
	}

	#clearPreview(userId: string) {
		const current = this.remote.get(userId);
		if (current?.preview) this.remote.set(userId, { ...current, preview: null });
	}
}
