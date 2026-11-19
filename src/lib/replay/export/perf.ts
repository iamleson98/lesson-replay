/**
 * Where a render's wall time goes, for the driver's log. Buckets add the
 * milliseconds a stretch of the frame loop took, counters add events; every
 * few seconds the page copies the totals into its status (`status.perf`) and
 * starts again, so a slow stretch shows up on its own. Plain numbers only, and
 * nothing is allocated per frame.
 */

import type { RenderStatus } from './render-token';

/** Copy the totals out after this many frames or this much wall time, whichever comes first. */
const FLUSH_FRAMES = 150;
const FLUSH_MS = 5000;

export type PerfBucket =
	| 'audio'
	| 'board'
	| 'screen_decode'
	| 'screen_paint'
	| 'camera'
	| 'quiz'
	| 'card'
	| 'encode_wait'
	| 'encode';

export type PerfCounter = 'reopens' | 'decoded' | 'reads' | 'bytes' | 'frames';

export class RenderPerf {
	#totals: Record<string, number> = {};
	#last = 0;
	#flushedAt = 0;
	#frames = 0;

	/** Starts the clock the laps measure from. */
	start(): void {
		this.#last = this.#flushedAt = performance.now();
		this.#totals = {};
		this.#frames = 0;
	}

	/** Adds the time since the last lap (or `start`) to a bucket. */
	lap(bucket: PerfBucket): void {
		const now = performance.now();
		this.add(bucket, now - this.#last);
		this.#last = now;
	}

	add(key: PerfBucket | PerfCounter, amount: number): void {
		this.#totals[key] = (this.#totals[key] ?? 0) + amount;
	}

	/** One output frame is done: hands the totals to the status when a window has passed. */
	frameDone(status: RenderStatus): void {
		this.add('frames', 1);
		this.#frames++;
		if (this.#frames >= FLUSH_FRAMES || performance.now() - this.#flushedAt >= FLUSH_MS) {
			this.flush(status);
		}
	}

	/** Copies the totals (ms per bucket, counts) into the status and resets them. */
	flush(status: RenderStatus): void {
		const out: Record<string, number> = {};
		for (const [key, value] of Object.entries(this.#totals)) out[key] = Math.round(value);
		status.perf = out;
		this.#totals = {};
		this.#frames = 0;
		this.#flushedAt = performance.now();
	}
}

/** The render's one meter: the readers and the file source count into it without being handed it. */
export const perf = new RenderPerf();
