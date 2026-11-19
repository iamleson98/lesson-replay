/**
 * The exporter: renders the teacher's screen of a recording offline, faster
 * than real time, into a fragmented MP4 (H.264 + Opus) and sends it out in
 * exact 16 MiB parts. One loop, no timers: output frame `i` is the picture at
 * `t = i * 1000 / 30` ms; audio blocks of one second are fed before the first
 * frame of their second. Decoding (mediabunny on WebCodecs), painting, encoding
 * and uploading overlap through the encoder's queue, the muxer's queue and the
 * parts' double buffer; every queue is bounded, so memory stays flat.
 *
 * Loaded only by the render page (mediabunny is a large library nobody else
 * needs).
 */

import type {
	EncodedPacket,
	EncodedAudioPacketSource,
	EncodedVideoPacketSource,
	Input
} from 'mediabunny';
import { BoardReplay } from '../player/board-replay.svelte';
import { quizRecords } from '../player/quiz-replay.svelte';
import { manifestFiles, type RecordingFile } from '../player/timeline';
import { t } from '../i18n/strings.svelte';
import { mixBlock, silence } from './audio-mix';
import { countdownSeconds, type CardInputs } from './card';
import { CardPainter } from './card-painter';
import {
	BLOCK_SAMPLES,
	FPS,
	FRAME_DURATION_US,
	KEYFRAME_EVERY,
	SAMPLE_RATE,
	WIDTH,
	HEIGHT,
	frameTimeMs,
	frameTimestampUs,
	prerollFrames,
	startsBlock,
	totalFrames
} from './frame-clock';
import { PART_BYTES, PartSplitter } from './parts';
import { perf } from './perf';
import { BoardPainter, paintCamera, paintScreen, paintStrip } from './painters';
import { loadBrandMark } from './brand';
import { stageLayout } from './layout';
import { createQuizDom } from './quiz-dom.svelte';
import { QuizStageSource } from './quiz-stage.svelte';
import { AudioTrackReader, VideoTrackReader } from './readers';
import {
	deckPageLoader,
	fileSource,
	readBoard,
	readManifest,
	renderDeckPageUrl,
	type RecordingAccess
} from './recording-source';
import { RenderError, renderCode, within } from './render-error';
import type { RenderStatus } from './render-token';
import { createSink } from './sink';
import {
	cameraAt,
	hasCamera,
	chooseScreen,
	chooseStage,
	micsBetween,
	pickScreen,
	screenLayers,
	teacherFiles
} from './stage';
import { assertSupported, AUDIO_ENCODER_CONFIG, VIDEO_ENCODER_CONFIG } from './support';

type MB = typeof import('mediabunny');

export type RenderInputs = RecordingAccess & {
	/** The recording's render request (the driver's; the page does not use it). */
	request: string;
	/** Base URL the output goes to. */
	sink: string;
	/** The countdown card rendered before the lesson (none when its length is 0). */
	card: CardInputs;
};

/** Frames waiting in the encoder, and encoded packets waiting for the muxer, before the loop stops. */
const MAX_ENCODE_QUEUE = 6;
const MAX_PACKET_QUEUE = 60;

class Gate {
	#waiters: (() => void)[] = [];
	wait(): Promise<void> {
		return new Promise((resolve) => this.#waiters.push(resolve));
	}
	wake(): void {
		this.#waiters.splice(0).forEach((resolve) => resolve());
	}
}

/** A file's decoders, opened when it first has something to show and closed when it ends. */
class Tracks {
	readonly #MB: MB;
	readonly #access: RecordingAccess;
	readonly #open = new Map<
		number,
		{ input: Input; file: RecordingFile; video?: VideoTrackReader; audio?: AudioTrackReader }
	>();

	constructor(mb: MB, access: RecordingAccess) {
		this.#MB = mb;
		this.#access = access;
	}

	#entry(file: RecordingFile) {
		let entry = this.#open.get(file.index);
		if (!entry) {
			const input = new this.#MB.Input({
				formats: this.#MB.ALL_FORMATS,
				source: fileSource(this.#MB, this.#access, file)
			});
			entry = { input, file };
			this.#open.set(file.index, entry);
		}
		return entry;
	}

	async video(file: RecordingFile): Promise<VideoTrackReader> {
		const entry = this.#entry(file);
		if (!entry.video) {
			const track = await entry.input.getPrimaryVideoTrack();
			if (!track) throw new RenderError('decode_failed');
			entry.video = new VideoTrackReader(new this.#MB.VideoSampleSink(track));
		}
		return entry.video;
	}

	async audio(file: RecordingFile): Promise<AudioTrackReader | null> {
		const entry = this.#entry(file);
		if (!entry.audio) {
			const track = await entry.input.getPrimaryAudioTrack();
			if (!track) return null;
			entry.audio = new AudioTrackReader(new this.#MB.AudioSampleSink(track), file.start_ms);
		}
		return entry.audio;
	}

	/** Stops decoding every video that is not in `wanted` (a parked video costs nothing). */
	parkExcept(wanted: ReadonlySet<number>): void {
		for (const [index, entry] of this.#open) if (!wanted.has(index)) entry.video?.park();
	}

	/** Lets go of the files that ended before `ms`. */
	closeEnded(ms: number): void {
		for (const [index, entry] of this.#open) {
			if (entry.file.end_ms > ms) continue;
			entry.video?.park();
			entry.audio?.close();
			entry.input.dispose();
			this.#open.delete(index);
		}
	}

	closeAll(): void {
		this.closeEnded(Infinity);
	}
}

/**
 * Renders the recording and reports to the sink: `done` with the totals, or `error` with a code.
 * Never throws; the page's status mirrors what happens.
 */
export async function runRender(inputs: RenderInputs, status: RenderStatus): Promise<void> {
	const sink = createSink(inputs.sink);
	try {
		status.state = 'loading';
		await assertSupported();
		const MB = await within('render_failed', () => import('mediabunny'));
		const totals = await render(MB, inputs, sink, status);
		await sink.done(totals);
		status.progress = 1;
		status.state = 'done';
	} catch (err) {
		status.state = 'error';
		await sink.error(renderCode(err));
	}
}

async function render(
	MB: MB,
	inputs: RenderInputs,
	sink: ReturnType<typeof createSink>,
	status: RenderStatus
) {
	const manifest = await readManifest(inputs);
	const files = manifestFiles(manifest);
	const teacherId = manifest.teacher_id;
	const teacher = teacherFiles(files, teacherId);
	const records = await readBoard(
		inputs,
		manifest,
		files.find((f) => f.kind === 'board') ?? null
	);
	const board = new BoardReplay(records);
	const quiz = new QuizStageSource(quizRecords(records));
	const layout = stageLayout(hasCamera(teacher));
	const brandMark = await loadBrandMark();
	const boardPainter = new BoardPainter(layout.stage, {
		url: renderDeckPageUrl(inputs, manifest.class_id ?? ''),
		load: deckPageLoader(inputs)
	});
	// The game's stage: the player's own screens, mounted out of view (only a recording with a game needs them).
	const quizDom = quiz.has ? await createQuizDom(quiz, layout.stage) : null;
	const tracks = new Tracks(MB, inputs);

	const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
	const cardFrames = prerollFrames(inputs.card.prerollMs);
	const frames = totalFrames(manifest.duration_ms, inputs.card.prerollMs);
	const card =
		cardFrames > 0
			? new CardPainter(layout, brandMark, {
					title: inputs.card.title,
					teacher: inputs.card.teacher,
					startsIn: t('replay.card.startsIn')
				})
			: null;

	// Output: a fragmented MP4 cut into exact parts as it is written.
	const splitter = new PartSplitter((n, body) => sink.part(n, body), PART_BYTES);
	const output = new MB.Output({
		format: new MB.Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 2 }),
		target: new MB.StreamTarget(
			new WritableStream({
				write: (chunk: { position: number; data: Uint8Array }) =>
					splitter.write(chunk.position, chunk.data)
			}),
			{ chunked: true, chunkSize: PART_BYTES }
		)
	});
	const videoSource: EncodedVideoPacketSource = new MB.EncodedVideoPacketSource('avc');
	const audioSource: EncodedAudioPacketSource = new MB.EncodedAudioPacketSource('opus');
	output.addVideoTrack(videoSource, { frameRate: FPS });
	output.addAudioTrack(audioSource);

	// Encoders feed two queues the muxer drains; a failure anywhere stops the loop.
	const gate = new Gate();
	const videoQueue: [EncodedPacket, EncodedVideoChunkMetadata | undefined][] = [];
	const audioQueue: [EncodedPacket, EncodedAudioChunkMetadata | undefined][] = [];
	let failure: RenderError | null = null;
	let finished = false;
	const fail = (err: unknown) => {
		failure ??= err instanceof RenderError ? err : new RenderError('encode_failed', err);
		gate.wake();
	};
	const videoEncoder = new VideoEncoder({
		output: (chunk, meta) => {
			videoQueue.push([MB.EncodedPacket.fromEncodedChunk(chunk), meta]);
			gate.wake();
		},
		error: (e) => fail(e)
	});
	const audioEncoder = new AudioEncoder({
		output: (chunk, meta) => {
			audioQueue.push([MB.EncodedPacket.fromEncodedChunk(chunk), meta]);
			gate.wake();
		},
		error: (e) => fail(e)
	});
	const pump = async <T>(queue: T[], add: (item: T) => Promise<void>) => {
		try {
			for (;;) {
				const item = queue.shift();
				if (item === undefined) {
					if (finished || failure) return;
					await gate.wait();
					continue;
				}
				gate.wake();
				await add(item);
			}
		} catch (err) {
			fail(err);
		}
	};

	try {
		videoEncoder.configure(VIDEO_ENCODER_CONFIG);
		audioEncoder.configure(AUDIO_ENCODER_CONFIG);
		await within('encode_failed', () => output.start());
		const pumps = [
			pump(videoQueue, ([packet, meta]) => videoSource.add(packet, meta)),
			pump(audioQueue, ([packet, meta]) => audioSource.add(packet, meta))
		];

		status.state = 'rendering';
		perf.start();
		let held: number | null = null;
		let quizOn = false;
		let quizSince = 0;

		const encodeFrame = async (i: number) => {
			const frame = new VideoFrame(canvas, {
				timestamp: frameTimestampUs(i),
				duration: FRAME_DURATION_US
			});
			try {
				while (
					!failure &&
					(videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE ||
						videoQueue.length > MAX_PACKET_QUEUE)
				) {
					await Promise.race([
						new Promise((resolve) =>
							videoEncoder.addEventListener('dequeue', resolve, { once: true })
						),
						gate.wait()
					]);
				}
				if (failure) throw failure;
				perf.lap('encode_wait');
				videoEncoder.encode(frame, { keyFrame: i % KEYFRAME_EVERY === 0 });
				perf.lap('encode');
			} finally {
				frame.close();
			}
			if (i % FPS === 0) status.progress = i / frames;
			perf.frameDone(status);
		};

		for (let i = 0; i < frames; i++) {
			if (failure) throw failure;
			// The lesson's own clock: frame `i` of the video is frame `i - cardFrames` of the lesson.
			const lessonFrame = i - cardFrames;
			const t = frameTimeMs(lessonFrame);
			const onCard = lessonFrame < 0;

			if (startsBlock(i)) {
				const start = lessonFrame * (1000 / FPS);
				const sources: Float32Array[] = [];
				for (const file of onCard ? [] : micsBetween(teacher, start, start + 1000)) {
					const reader = await within('decode_failed', () => tracks.audio(file));
					if (reader) {
						sources.push(
							await within('decode_failed', () =>
								reader.readBlock(start, BLOCK_SAMPLES)
							)
						);
					}
				}
				const data = new AudioData({
					format: 'f32-planar',
					sampleRate: SAMPLE_RATE,
					numberOfFrames: BLOCK_SAMPLES,
					numberOfChannels: 1,
					timestamp: (i / FPS) * 1_000_000,
					data: (onCard
						? silence(BLOCK_SAMPLES)
						: mixBlock(sources, BLOCK_SAMPLES)) as Float32Array<ArrayBuffer>
				});
				audioEncoder.encode(data);
				data.close();
				perf.lap('audio');
			}

			if (card && onCard) {
				// The countdown card: nothing of the lesson is touched, and nothing is painted
				// again until the second changes.
				card.paint(ctx, countdownSeconds(i, cardFrames));
				perf.lap('card');
				await encodeFrame(i);
				continue;
			}

			board.seek(t);
			quizDom?.seek(t);
			perf.lap('board');
			if (quiz.on && !quizOn) quizSince = t;
			quizOn = quiz.on;

			// The stage: the teacher's screen, a game, or the board (the latest presentation to begin).
			const used = new Set<number>();
			const covering = screenLayers(teacher, t);
			let stage = chooseStage(
				chooseScreen(covering, t, () => true, null),
				quizOn,
				quizSince
			);
			let screen: import('mediabunny').VideoSample | null = null;
			if (stage === 'quiz') quizDom?.begin();
			if (stage === 'screen') {
				const pick = await within('decode_failed', () =>
					pickScreen(covering, t, held, async (file) => {
						const reader = await tracks.video(file);
						return reader.frameAt((t - file.start_ms) / 1000);
					})
				);
				for (const index of pick.asked) used.add(index);
				held = pick.shown?.index ?? null;
				screen = pick.picture;
				if (!screen) stage = quizOn ? 'quiz' : 'board';
				if (stage === 'quiz') quizDom?.begin();
			}
			perf.lap('screen_decode');
			if (stage === 'screen') {
				paintScreen(ctx, screen, layout.stage);
				perf.lap('screen_paint');
			} else if (stage === 'board') {
				await boardPainter.paint(ctx, board);
				perf.lap('board');
			}

			// The strip under the stage: the brand, and the camera tile while the camera is on.
			paintStrip(ctx, layout.strip, layout.brand, brandMark);
			const cameraFile = layout.tile ? cameraAt(teacher, t, teacherId) : null;
			if (cameraFile && layout.tile) {
				const tile = layout.tile;
				await within('decode_failed', async () => {
					const reader = await tracks.video(cameraFile);
					const sample = await reader.frameAt((t - cameraFile.start_ms) / 1000);
					if (sample) paintCamera(ctx, sample, tile);
				});
				used.add(cameraFile.index);
			}
			perf.lap('camera');
			// A game's image started loading above, beside the camera's decode; this frame waits for it here.
			if (stage === 'quiz') await quizDom?.painter.draw(ctx);
			perf.lap('quiz');
			tracks.parkExcept(used);
			tracks.closeEnded(t);

			await encodeFrame(i);
		}
		perf.flush(status);

		// Drain: encoders, then the muxer, then the last part.
		await within('encode_failed', () => videoEncoder.flush());
		await within('encode_failed', () => audioEncoder.flush());
		finished = true;
		gate.wake();
		await Promise.all(pumps);
		if (failure) throw failure;
		videoSource.close();
		audioSource.close();
		await within('encode_failed', () => output.finalize());
		const sent = await splitter.finish();
		return {
			parts: sent.parts,
			bytes: sent.bytes,
			durationMs: Math.round((frames * 1000) / FPS),
			frames
		};
	} finally {
		finished = true;
		gate.wake();
		if (videoEncoder.state !== 'closed') videoEncoder.close();
		if (audioEncoder.state !== 'closed') audioEncoder.close();
		tracks.closeAll();
		quizDom?.dispose();
		quiz.dispose();
	}
}
