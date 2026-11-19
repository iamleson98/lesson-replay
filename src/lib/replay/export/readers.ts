/**
 * Reading a recorded stream by time, forwards: the picture a video shows at a
 * moment, and a microphone's samples in one-second blocks. Both sit on
 * mediabunny's sample sinks (WebCodecs decode); frames and audio data are
 * closed as soon as they are passed, so memory stays flat however long the
 * lesson is.
 */

import type { AudioSampleSink, VideoSample, VideoSampleSink } from 'mediabunny';
import { SAMPLE_RATE, SAMPLE_TOLERANCE_S } from './frame-clock';
import { perf } from './perf';

type Samples<T> = AsyncGenerator<T, void, unknown>;

/** The frame a video shows at a time (seconds from the file's start), read forwards. */
export class VideoTrackReader {
	readonly #sink: VideoSampleSink;
	#it: Samples<VideoSample> | null = null;
	#cur: VideoSample | null = null;
	#next: VideoSample | null | undefined;

	constructor(sink: VideoSampleSink) {
		this.#sink = sink;
	}

	/**
	 * The latest decoded frame at or before `t` (kept until the next call), or null while the
	 * file has none yet. A call after `park` decodes again from the keyframe before `t`.
	 */
	async frameAt(t: number): Promise<VideoSample | null> {
		if (!this.#it) {
			this.#it = this.#sink.samples(Math.max(0, t));
			perf.add('reopens', 1);
			this.#cur = null;
			this.#next = undefined;
		}
		if (this.#next === undefined) {
			this.#cur = (await this.#it.next()).value ?? null;
			this.#next = (await this.#it.next()).value ?? null;
			perf.add('decoded', (this.#cur ? 1 : 0) + (this.#next ? 1 : 0));
		}
		while (this.#next && this.#next.timestamp <= t + SAMPLE_TOLERANCE_S) {
			this.#cur?.close();
			this.#cur = this.#next;
			this.#next = (await this.#it.next()).value ?? null;
			if (this.#next) perf.add('decoded', 1);
		}
		return this.#cur && this.#cur.timestamp <= t + SAMPLE_TOLERANCE_S ? this.#cur : null;
	}

	/** Stops decoding (the stream is not on the stage); the next `frameAt` starts again where asked. */
	park(): void {
		this.#cur?.close();
		this.#next?.close();
		this.#cur = null;
		this.#next = undefined;
		const it = this.#it;
		this.#it = null;
		it?.return(undefined).catch(() => undefined);
	}
}

/** One decoded run of microphone samples placed on the file's own sample timeline. */
type Run = { start: number; data: Float32Array };

/** A microphone, read in blocks of the recording's timeline (mono; several channels are averaged). */
export class AudioTrackReader {
	readonly #sink: AudioSampleSink;
	/** Where the file starts on the recording's timeline (ms). */
	readonly #startMs: number;
	#it: Samples<import('mediabunny').AudioSample> | null = null;
	/** The first run not yet used up: it may reach into this block or only into a later one. */
	#held: Run | null = null;
	#done = false;

	constructor(sink: AudioSampleSink, startMs: number) {
		this.#sink = sink;
		this.#startMs = startMs;
	}

	/**
	 * `n` samples from `blockStartMs` of the recording, silence where the file has none. Blocks
	 * must be asked for in time order.
	 */
	async readBlock(blockStartMs: number, n: number): Promise<Float32Array> {
		const lo = Math.round(((blockStartMs - this.#startMs) / 1000) * SAMPLE_RATE);
		const hi = lo + n;
		const out = new Float32Array(n);
		if (!this.#it) this.#it = this.#sink.samples(Math.max(0, lo / SAMPLE_RATE));
		this.#held ??= await this.#pull();
		while (this.#held) {
			const run = this.#held;
			const end = run.start + run.data.length;
			if (run.start >= hi) break;
			const from = Math.max(lo, run.start);
			const to = Math.min(hi, end);
			if (to > from) out.set(run.data.subarray(from - run.start, to - run.start), from - lo);
			if (end > hi) break;
			this.#held = await this.#pull();
		}
		return out;
	}

	async #pull(): Promise<Run | null> {
		if (this.#done || !this.#it) return null;
		const next = await this.#it.next();
		if (next.done) {
			this.#done = true;
			return null;
		}
		const sample = next.value;
		try {
			const frames = sample.numberOfFrames;
			const channels = sample.numberOfChannels;
			const data = new Float32Array(frames);
			const plane = new Float32Array(frames);
			for (let c = 0; c < channels; c++) {
				sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
				for (let i = 0; i < frames; i++) data[i] += plane[i] / channels;
			}
			return { start: Math.round(sample.timestamp * SAMPLE_RATE), data };
		} finally {
			sample.close();
		}
	}

	close(): void {
		this.#held = null;
		this.#done = true;
		const it = this.#it;
		this.#it = null;
		it?.return(undefined).catch(() => undefined);
	}
}
