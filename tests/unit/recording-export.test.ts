import { afterEach, describe, expect, it, vi } from 'vitest';
import { limit, mixBlock, LIMITER_KNEE } from '#lib/replay/export/audio-mix.js';
import { drawWithPictures, PICTURE_WAIT_MS } from '#lib/replay/export/board-pictures.js';
import { deckPageLoader, renderDeckPageUrl } from '#lib/replay/export/recording-source.js';
import { deckPageUrl } from '#lib/replay/board/pictures.js';
import {
	blockCount,
	frameCount,
	frameTimeMs,
	frameTimestampUs,
	startsBlock
} from '#lib/replay/export/frame-clock.js';
import { PartSplitter } from '#lib/replay/export/parts.js';
import {
	RENDER_ERROR_CODES,
	RenderError,
	renderCode,
	within
} from '#lib/replay/export/render-error.js';
import { createTokenHolder, exposeToDriver } from '#lib/replay/export/render-token.js';
import { fragmentSink, parseFragment } from '#lib/replay/export/start.js';

describe('deck pictures on the rendered board', () => {
	const access = (api = 'https://app.test/api/v4') => ({
		api,
		recording: 'rec1',
		token: createTokenHolder('hvr1.first')
	});

	afterEach(() => vi.unstubAllGlobals());

	it('names a page the way the player does, under the render page API base', () => {
		const url = renderDeckPageUrl(access(), 'class1');
		expect(url('deckA', 3)).toBe(
			'https://app.test/api/v4/lms/classes/class1/decks/deckA/pages/3'
		);
		expect(url('deckA', 3)).toBe(deckPageUrl('https://app.test/api/v4', 'class1', 'deckA', 3));
	});

	it('reads a page with the bearer token and no cookies, and sends a 401 once more with the new token', async () => {
		const a = access();
		const bitmap = { width: 4, height: 3 };
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(async () => {
				a.token.set('hvr1.second');
				return new Response(null, { status: 401 });
			})
			.mockResolvedValueOnce(new Response(new Blob(['x']), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

		const picture = await deckPageLoader(a)(
			'https://app.test/api/v4/lms/classes/c/decks/d/pages/1'
		);
		expect(picture).toBe(bitmap);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			credentials: 'omit',
			headers: { Authorization: 'Bearer hvr1.first' }
		});
		expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer hvr1.second');
	});

	it('does not take a page that cannot be read, nor retry it more than once', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(deckPageLoader(access())('/x')).rejects.toThrow('deck page 401');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(deckPageLoader(access())('/x')).rejects.toThrow('deck page 404');
	});

	it('draws once when nothing was still loading, and again when pictures arrived meanwhile', async () => {
		const draw = vi.fn();
		await drawWithPictures({ settled: async () => false }, draw);
		expect(draw).toHaveBeenCalledTimes(1);
		draw.mockClear();
		await drawWithPictures({ settled: async () => true }, draw);
		expect(draw).toHaveBeenCalledTimes(2);
	});

	it('takes no frame before the pictures are in, and gives up after the wait it is given', async () => {
		const order: string[] = [];
		let arrive: () => void = () => undefined;
		const pictures = {
			settled: vi.fn(
				(ms: number) =>
					new Promise<boolean>((resolve) => {
						order.push(`wait ${ms}`);
						arrive = () => resolve(true);
					})
			)
		};
		const drawing = drawWithPictures(pictures, () => order.push('draw'), 1234);
		await Promise.resolve();
		expect(order).toEqual(['draw', 'wait 1234']);
		arrive();
		await drawing;
		expect(order).toEqual(['draw', 'wait 1234', 'draw']);
		expect(PICTURE_WAIT_MS).toBeGreaterThan(0);
	});
});

describe('frame clock', () => {
	it('puts frame i at i * 1000 / 30 ms and counts whole frames', () => {
		expect(frameTimeMs(0)).toBe(0);
		expect(frameTimeMs(30)).toBe(1000);
		expect(frameTimeMs(1)).toBeCloseTo(33.3333, 3);
		expect(frameCount(1000)).toBe(30);
		expect(frameCount(1999)).toBe(59);
		expect(frameCount(-5)).toBe(0);
	});

	it('stamps frames in whole microseconds without drift', () => {
		expect(frameTimestampUs(0)).toBe(0);
		expect(frameTimestampUs(1)).toBe(33_333);
		expect(frameTimestampUs(3)).toBe(100_000);
		expect(frameTimestampUs(30 * 3600 * 4)).toBe(4 * 3600 * 1_000_000);
	});

	it('starts an audio block on every thirtieth frame and covers the whole duration', () => {
		expect([0, 1, 29, 30, 60].map(startsBlock)).toEqual([true, false, false, true, true]);
		expect(blockCount(1000)).toBe(1);
		expect(blockCount(1001)).toBe(2);
		expect(blockCount(0)).toBe(0);
	});
});

describe('part splitter', () => {
	const collect = () => {
		const sent: { n: number; body: Uint8Array }[] = [];
		const send = async (n: number, body: Uint8Array) => {
			await Promise.resolve();
			// the buffer is reused once the part has arrived: keep a copy
			sent.push({ n, body: body.slice() });
		};
		return { sent, send };
	};

	it('cuts the stream into exact parts, the last one shorter, whatever the chunking', async () => {
		const { sent, send } = collect();
		const splitter = new PartSplitter(send, 16);
		const all = Uint8Array.from({ length: 50 }, (_, i) => i);
		let at = 0;
		for (const size of [3, 20, 1, 7, 19]) {
			await splitter.write(at, all.subarray(at, at + size));
			at += size;
		}
		const done = await splitter.finish();
		expect(sent.map((p) => [p.n, p.body.length])).toEqual([
			[1, 16],
			[2, 16],
			[3, 16],
			[4, 2]
		]);
		expect(done).toEqual({ parts: 4, bytes: 50 });
		const joined = new Uint8Array(50);
		let o = 0;
		for (const p of sent) {
			joined.set(p.body, o);
			o += p.body.length;
		}
		expect(joined).toEqual(all);
	});

	it('sends no empty last part when the stream ends on a boundary', async () => {
		const { sent, send } = collect();
		const splitter = new PartSplitter(send, 8);
		await splitter.write(0, new Uint8Array(16));
		expect(await splitter.finish()).toEqual({ parts: 2, bytes: 16 });
		expect(sent.map((p) => p.body.length)).toEqual([8, 8]);
	});

	it('sends nothing for an empty stream', async () => {
		const { sent, send } = collect();
		expect(await new PartSplitter(send, 8).finish()).toEqual({ parts: 0, bytes: 0 });
		expect(sent).toEqual([]);
	});

	it('waits for a part before sending the next (backpressure)', async () => {
		let inflight = 0;
		let overlap = 0;
		const send = async () => {
			inflight++;
			overlap = Math.max(overlap, inflight);
			await new Promise((r) => setTimeout(r, 5));
			inflight--;
		};
		const splitter = new PartSplitter(send, 4);
		for (let i = 0; i < 5; i++) await splitter.write(i * 4, new Uint8Array(4));
		await splitter.finish();
		expect(overlap).toBe(1);
	});

	it('refuses a write that is not an append and surfaces a failed part', async () => {
		const splitter = new PartSplitter(async () => undefined, 8);
		await splitter.write(0, new Uint8Array(4));
		await expect(splitter.write(0, new Uint8Array(4))).rejects.toMatchObject({
			code: 'encode_failed'
		});
		const failing = new PartSplitter(async () => {
			throw new RenderError('sink_failed');
		}, 4);
		await failing.write(0, new Uint8Array(4));
		await expect(failing.finish()).rejects.toMatchObject({ code: 'sink_failed' });
	});
});

describe('audio block mixer', () => {
	it('leaves a quiet sample alone and keeps a sum under full scale', () => {
		expect(limit(0.5)).toBe(0.5);
		expect(limit(-LIMITER_KNEE)).toBe(-LIMITER_KNEE);
		for (const x of [0.95, 1, 1.5, 4, -3]) {
			expect(Math.abs(limit(x))).toBeLessThanOrEqual(1);
			expect(Math.sign(limit(x))).toBe(Math.sign(x));
		}
		expect(limit(1.2)).toBeGreaterThan(limit(1));
	});

	it('is silence with no microphone and the limited sum with several', () => {
		expect(Array.from(mixBlock([], 4))).toEqual([0, 0, 0, 0]);
		const a = Float32Array.from([0.2, 0.9, -0.9, 0]);
		const b = Float32Array.from([0.3, 0.9, -0.9, 0]);
		const out = mixBlock([a, b], 4);
		expect(out[0]).toBeCloseTo(0.5, 6);
		expect(out[1]).toBeLessThanOrEqual(1);
		expect(out[1]).toBeGreaterThan(0.9);
		expect(out[2]).toBeCloseTo(-out[1], 6);
		expect(out[3]).toBe(0);
	});

	it('pads a short source with silence', () => {
		const out = mixBlock([Float32Array.from([0.1, 0.1])], 4);
		expect(Array.from(out).map((x) => Math.round(x * 10))).toEqual([1, 1, 0, 0]);
	});
});

describe('render token and the driver handles', () => {
	it('holds the latest token and ignores an empty one', () => {
		const holder = createTokenHolder('a');
		holder.set('b');
		expect(holder.get()).toBe('b');
		holder.set('');
		expect(holder.get()).toBe('b');
	});

	it('gives the driver __setRenderToken and __render', () => {
		const win = {} as Window;
		const holder = createTokenHolder('a');
		const status = { state: 'idle' as const, progress: 0 };
		exposeToDriver(win, holder, status);
		win.__setRenderToken?.('fresh');
		expect(holder.get()).toBe('fresh');
		expect(win.__render).toBe(status);
	});
});

describe('error codes', () => {
	it('only ever reports a code of the contract', () => {
		expect([...RENDER_ERROR_CODES]).toEqual([
			'recording_unreadable',
			'unsupported_browser',
			'decode_failed',
			'encode_failed',
			'sink_failed',
			'render_failed'
		]);
	});

	it('keeps a RenderError code, maps anything else to the fallback', async () => {
		expect(renderCode(new RenderError('sink_failed'))).toBe('sink_failed');
		expect(renderCode(new Error('secret'))).toBe('render_failed');
		expect(renderCode('x', 'decode_failed')).toBe('decode_failed');
		await expect(
			within('decode_failed', () => {
				throw new TypeError('x');
			})
		).rejects.toMatchObject({ code: 'decode_failed' });
		await expect(
			within('decode_failed', () => {
				throw new RenderError('recording_unreadable');
			})
		).rejects.toMatchObject({ code: 'recording_unreadable' });
		expect(new RenderError('encode_failed', new Error('token=abc')).message).toBe(
			'encode_failed'
		);
	});
});

describe('the page fragment', () => {
	it('reads the inputs and applies the defaults', () => {
		expect(parseFragment('#token=t&recording=r1&request=q1')).toEqual({
			api: '/api/v4',
			token: 't',
			recording: 'r1',
			request: 'q1',
			sink: '/__sink',
			card: { prerollMs: 0, title: '', teacher: '' }
		});
		expect(
			parseFragment(
				'token=t&recording=r1&api=https%3A%2F%2Fx.test%2Fapi%2Fv4%2F&sink=http%3A%2F%2F127.0.0.1%3A9%2F'
			)
		).toMatchObject({ api: 'https://x.test/api/v4', sink: 'http://127.0.0.1:9/' });
	});

	it('needs a token and a recording, and still finds the sink to say so', () => {
		expect(parseFragment('')).toBeNull();
		expect(parseFragment('#recording=r')).toBeNull();
		expect(parseFragment('#token=t')).toBeNull();
		expect(fragmentSink('#sink=http%3A%2F%2Fs')).toBe('http://s');
		expect(fragmentSink('')).toBe('/__sink');
	});
});
