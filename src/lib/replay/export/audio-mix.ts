/**
 * The teacher's microphone as one-second blocks of mono Float32 at 48 kHz. A
 * microphone can be several files over a lesson (a reconnect starts a new
 * one), and two can overlap for a moment: the block is their sum, held below
 * full scale by a soft limiter so a sum never clips into the encoder.
 */

/** Below this level the limiter leaves a sample alone. */
export const LIMITER_KNEE = 0.9;

/** One sample through the limiter: unchanged under the knee, rounded off towards 1 above it. */
export function limit(x: number): number {
	const a = Math.abs(x);
	if (a <= LIMITER_KNEE) return x;
	const room = 1 - LIMITER_KNEE;
	return Math.sign(x) * (LIMITER_KNEE + room * Math.tanh((a - LIMITER_KNEE) / room));
}

/** A block of `n` samples of silence. */
export const silence = (n: number): Float32Array => new Float32Array(n);

/** Mixes the sources (each `n` samples, aligned to the block) into one block, limited. */
export function mixBlock(sources: readonly Float32Array[], n: number): Float32Array {
	const out = new Float32Array(n);
	for (const source of sources) {
		const len = Math.min(n, source.length);
		for (let i = 0; i < len; i++) out[i] += source[i];
	}
	if (sources.length > 0) for (let i = 0; i < n; i++) out[i] = limit(out[i]);
	return out;
}
