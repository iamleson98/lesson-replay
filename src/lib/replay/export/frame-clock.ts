/**
 * The export's clock. A render is not played: output frame `i` is the picture
 * at `t = i * 1000 / 30` ms of the recording, however long it takes to make,
 * and audio is cut in blocks of one second on the same timeline.
 */

export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 30;
export const SAMPLE_RATE = 48_000;
/** One audio block (samples per channel). */
export const BLOCK_SAMPLES = SAMPLE_RATE;
/** A keyframe every 2 s. */
export const KEYFRAME_EVERY = 2 * FPS;

/** Where output frame `i` falls on the recording's timeline (ms). */
export const frameTimeMs = (i: number): number => (i * 1000) / FPS;

/** The frame's timestamp in the output (whole microseconds, so no drift builds up). */
export const frameTimestampUs = (i: number): number => Math.round((i * 1_000_000) / FPS);

export const FRAME_DURATION_US = Math.round(1_000_000 / FPS);

/** How many frames a recording of `durationMs` makes. */
export const frameCount = (durationMs: number): number =>
	Math.max(0, Math.floor((durationMs * FPS) / 1000));

/**
 * How many card frames come before the lesson's first one: `prerollMs` of them at the fixed rate
 * (the lengths offered are whole seconds, so this is a whole number of audio blocks too). The
 * lesson's t=0 is output frame `prerollFrames(prerollMs)`; with no card it is frame 0, as ever.
 */
export const prerollFrames = (prerollMs: number): number =>
	Math.max(0, Math.round((prerollMs * FPS) / 1000));

/** How many frames the whole video makes: the card, then the lesson. */
export const totalFrames = (durationMs: number, prerollMs: number): number =>
	prerollFrames(prerollMs) + frameCount(durationMs);

/** How many one-second audio blocks cover `durationMs`. */
export const blockCount = (durationMs: number): number => Math.max(0, Math.ceil(durationMs / 1000));

/** Whether frame `i` is the first of its second (the audio block that starts there is due). */
export const startsBlock = (i: number): boolean => i % FPS === 0;

/** A decoded frame is shown while its timestamp is at or before the frame's time (plus this much, in seconds). */
export const SAMPLE_TOLERANCE_S = 0.0005;
