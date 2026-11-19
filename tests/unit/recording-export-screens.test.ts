import { afterEach, describe, expect, it, vi } from 'vitest';
import { perf, RenderPerf } from '#lib/replay/export/perf.js';
import { paintCamera, paintScreen } from '#lib/replay/export/painters.js';
import { VideoTrackReader } from '#lib/replay/export/readers.js';
import { fileSource } from '#lib/replay/export/recording-source.js';
import { createTokenHolder, type RenderStatus } from '#lib/replay/export/render-token.js';
import { pickScreen } from '#lib/replay/export/stage.js';
import type { RecordingFile } from '#lib/replay/player/timeline.js';

const FRAME_MS = 1000 / 30;

type Fake = { timestamp: number; close: () => void };

/** A screen file whose frames start at `firstS` and come every 0.5 s; counts how often the sink is opened. */
function fakeScreen(index: number, firstS: number) {
	const sink = {
		opens: 0,
		decoded: 0,
		async *samples(start: number): AsyncGenerator<Fake, void, unknown> {
			sink.opens++;
			for (let ts = firstS; ts < 60; ts += 0.5) {
				if (ts + 0.5 <= start) continue;
				sink.decoded++;
				yield { timestamp: ts, close: () => undefined };
			}
		}
	};
	const file = { index, start_ms: 0, end_ms: 60_000, kind: 'screen' } as unknown as RecordingFile;
	const reader = new VideoTrackReader(sink as never);
	return { sink, file, reader };
}

/** What the exporter does per frame: ask the screens, then park every video that was not asked. */
async function runFrames(
	screens: ReturnType<typeof fakeScreen>[],
	from: number,
	to: number
): Promise<(Fake | null)[]> {
	const out: (Fake | null)[] = [];
	let held: number | null = null;
	for (let i = from; i < to; i++) {
		const t = i * FRAME_MS;
		const byIndex = new Map(screens.map((s) => [s.file.index, s]));
		const pick: Awaited<ReturnType<typeof pickScreen<Fake>>> = await pickScreen<Fake>(
			screens.map((s) => s.file),
			t,
			held,
			(file) => byIndex.get(file.index)!.reader.frameAt(t / 1000) as Promise<Fake | null>
		);
		held = pick.shown?.index ?? null;
		for (const s of screens) if (!pick.asked.includes(s.file.index)) s.reader.park();
		out.push(pick.picture);
	}
	return out;
}

describe('screens in the render loop', () => {
	it('opens a file once while it waits for its first frame', async () => {
		const screen = fakeScreen(0, 2);
		const pictures = await runFrames([screen], 0, 90);
		expect(screen.sink.opens).toBe(1);
		expect(pictures.slice(0, 60).every((p) => p === null)).toBe(true);
		expect(pictures[61]?.timestamp).toBe(2);
	});

	it('does not decode a screen that a newer one with a picture covers', async () => {
		const older = fakeScreen(0, 0);
		const newer = fakeScreen(1, 0);
		const pictures = await runFrames([older, newer], 0, 60);
		expect(newer.sink.opens).toBe(1);
		expect(older.sink.opens).toBe(0);
		expect(pictures.every((p) => p !== null)).toBe(true);
	});

	it('shows the older screen until the newer one has its first frame, then leaves it parked', async () => {
		const older = fakeScreen(0, 0);
		const newer = fakeScreen(1, 2);
		const pictures = await runFrames([older, newer], 0, 90);
		expect(newer.sink.opens).toBe(1);
		expect(pictures.every((p) => p !== null)).toBe(true);
		expect(pictures[89]?.timestamp).toBe(2.5);
		const olderOpens = older.sink.opens;
		// Once the newer one shows, the older one is parked and decodes nothing more.
		await runFrames([older, newer], 90, 120);
		expect(older.sink.opens).toBe(olderOpens);
	});
});

describe('the screen file source', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('keeps a whole screen cluster cached and reads ahead, and counts what it reads', async () => {
		let options: Record<string, unknown> = {};
		const MB = {
			StreamSource: class {
				constructor(o: Record<string, unknown>) {
					options = o;
				}
			}
		};
		const file = { index: 3, size: 100 } as RecordingFile;
		const access = { api: '/api/v4', recording: 'r', token: createTokenHolder('t') };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(new Uint8Array(10), { status: 206 }))
		);
		fileSource(MB as never, access, file);
		expect(options.prefetchProfile).toBe('network');
		expect(options.maxCacheSize).toBe(32 * 2 ** 20);
		perf.start();
		const bytes = await (options.read as (a: number, b: number) => Promise<Uint8Array>)(0, 10);
		expect(bytes.length).toBe(10);
		const status: RenderStatus = { state: 'rendering', progress: 0 };
		perf.flush(status);
		expect(status.perf).toMatchObject({ reads: 1, bytes: 10 });
	});
});

describe('smoothing', () => {
	it('draws the screen and the camera with medium smoothing', () => {
		const qualities: string[] = [];
		const ctx = {
			setTransform: () => undefined,
			fillRect: () => undefined,
			save: () => undefined,
			restore: () => undefined,
			beginPath: () => undefined,
			roundRect: () => undefined,
			clip: () => undefined,
			stroke: () => undefined,
			set imageSmoothingQuality(v: string) {
				qualities.push(v);
			}
		};
		const sample = { displayWidth: 1920, displayHeight: 1200, draw: () => undefined };
		const box = { x: 0, y: 0, w: 100, h: 100 };
		paintScreen(ctx as never, sample as never, box);
		paintCamera(ctx as never, sample as never, box);
		expect(qualities).toEqual(['medium', 'medium']);
	});
});

describe('the render meter', () => {
	it('copies the totals into the status every 150 frames and starts again', () => {
		const meter = new RenderPerf();
		meter.start();
		const status: RenderStatus = { state: 'rendering', progress: 0 };
		meter.add('reopens', 2);
		for (let i = 0; i < 149; i++) meter.frameDone(status);
		expect(status.perf).toBeUndefined();
		meter.frameDone(status);
		expect(status.perf?.frames).toBe(150);
		expect(status.perf?.reopens).toBe(2);
		meter.frameDone(status);
		meter.flush(status);
		expect(status.perf).toEqual({ frames: 1 });
	});
});
