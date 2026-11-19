/**
 * The codecs the render needs, and the check that the browser has them: the
 * recording's streams are VP8 and Opus (decoded), the video is H.264 Main
 * level 3.1 (encoded) with Opus audio.
 */

import { FPS, HEIGHT, SAMPLE_RATE, WIDTH } from './frame-clock';
import { RenderError } from './render-error';

export const VIDEO_BITRATE = 2_500_000;
export const AUDIO_BITRATE = 64_000;

export const VIDEO_ENCODER_CONFIG: VideoEncoderConfig = {
	codec: 'avc1.4d401f',
	width: WIDTH,
	height: HEIGHT,
	bitrate: VIDEO_BITRATE,
	bitrateMode: 'constant',
	framerate: FPS,
	latencyMode: 'quality',
	avc: { format: 'avc' }
};

export const AUDIO_ENCODER_CONFIG: AudioEncoderConfig = {
	codec: 'opus',
	sampleRate: SAMPLE_RATE,
	numberOfChannels: 1,
	bitrate: AUDIO_BITRATE
};

/** Throws `unsupported_browser` unless every codec the render uses is there. */
export async function assertSupported(): Promise<void> {
	if (
		typeof VideoEncoder === 'undefined' ||
		typeof VideoDecoder === 'undefined' ||
		typeof AudioEncoder === 'undefined' ||
		typeof AudioDecoder === 'undefined' ||
		typeof OffscreenCanvas === 'undefined'
	) {
		throw new RenderError('unsupported_browser');
	}
	try {
		const checks = await Promise.all([
			VideoDecoder.isConfigSupported({
				codec: 'vp8',
				codedWidth: WIDTH,
				codedHeight: HEIGHT
			}),
			AudioDecoder.isConfigSupported({
				codec: 'opus',
				sampleRate: SAMPLE_RATE,
				numberOfChannels: 1
			}),
			VideoEncoder.isConfigSupported(VIDEO_ENCODER_CONFIG),
			AudioEncoder.isConfigSupported(AUDIO_ENCODER_CONFIG)
		]);
		if (checks.some((c) => !c.supported)) throw new RenderError('unsupported_browser');
	} catch (err) {
		throw err instanceof RenderError ? err : new RenderError('unsupported_browser', err);
	}
}
