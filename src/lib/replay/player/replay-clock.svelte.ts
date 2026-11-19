/**
 * The player's clock: where the recording is, whether it plays and how
 * fast. Every stream follows it (replay-media.svelte), and the board is
 * drawn at its time, so they stay together however the viewer seeks.
 *
 * A stream that is seeking or has run out of data holds the clock, as a
 * video player waits while it buffers: a clock that ran on would leave the
 * stream behind, and moving the stream to catch up costs it another seek
 * (a video decodes from the keyframe before the target), which a large
 * shared screen never wins.
 */

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

/** A stream that waits this long with nothing arriving stops holding the
 * clock, so a file that never loads cannot stop the whole recording. One
 * that is still receiving is waited for: on a slow line, a seek far from a
 * keyframe takes a while, and letting the clock go would start the chase. */
export const MAX_WAIT_MS = 15_000;

export class ReplayClock {
	readonly duration: number;
	/** Position in ms. */
	time = $state(0);
	/** The viewer's choice: playing, even while a stream holds the clock. */
	playing = $state(false);
	rate = $state(1);
	/** A stream the clock covers is loading: the clock stands still. */
	waiting = $state(false);
	/** Counts the viewer's seeks, so a stream tells a jump from a drift. */
	seeks = $state(0);

	/** performance.now() and `time` when the clock last (re)started. */
	#startedAt = 0;
	#startedFrom = 0;
	#frame = 0;
	/** The streams holding the clock, and since when they last received data. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not rendered; `waiting` mirrors it
	#holds = new Map<object, number>();

	constructor(duration: number) {
		this.duration = Math.max(0, duration);
	}

	/** Whether time moves: the viewer plays and no stream holds the clock. */
	get running(): boolean {
		return this.playing && !this.waiting;
	}

	play(): void {
		if (this.playing) return;
		if (this.time >= this.duration) this.time = 0;
		this.playing = true;
		this.#restart();
		this.#frame = requestAnimationFrame(this.#tick);
	}

	pause(): void {
		if (!this.playing) return;
		this.#advance();
		this.playing = false;
		cancelAnimationFrame(this.#frame);
	}

	toggle(): void {
		if (this.playing) this.pause();
		else this.play();
	}

	seek(ms: number): void {
		this.time = Math.min(this.duration, Math.max(0, ms));
		this.seeks += 1;
		this.#restart();
	}

	setRate(rate: number): void {
		this.#advance();
		this.rate = rate;
		this.#restart();
	}

	/** A stream (`who`) is loading (`loading`), or no longer. */
	hold(who: object, loading: boolean): void {
		if (loading === this.#holds.has(who)) return;
		if (loading) this.#holds.set(who, performance.now());
		else this.#holds.delete(who);
		this.#update();
	}

	/** Data arrived for a stream that holds the clock: it is still loading,
	 * not stuck, so its wait starts again. */
	progressed(who: object): void {
		if (this.#holds.has(who)) this.#holds.set(who, performance.now());
	}

	/** Stops the clock for good (the player closed). */
	destroy(): void {
		this.pause();
		this.#holds.clear();
	}

	#update() {
		const now = performance.now();
		let waiting = false;
		for (const since of this.#holds.values()) {
			if (now - since < MAX_WAIT_MS) {
				waiting = true;
				break;
			}
		}
		if (waiting === this.waiting) return;
		// Up to now at the old state, then on from here at the new one.
		this.#advance();
		this.waiting = waiting;
		this.#restart();
	}

	#restart() {
		this.#startedAt = performance.now();
		this.#startedFrom = this.time;
	}

	#advance() {
		if (!this.running) return;
		const t = this.#startedFrom + (performance.now() - this.#startedAt) * this.rate;
		this.time = Math.min(this.duration, t);
	}

	#tick = () => {
		if (!this.playing) return;
		// A hold that ran out lets the clock go.
		if (this.waiting) this.#update();
		this.#advance();
		if (this.time >= this.duration) {
			this.playing = false;
			return;
		}
		this.#frame = requestAnimationFrame(this.#tick);
	};
}
