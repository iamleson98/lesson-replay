/**
 * Cuts the muxer's output into the parts the sink takes: every part exactly
 * `PART_BYTES` long, the last one shorter. Two buffers take turns, so one part
 * is on its way while the next fills; a part is sent only when the one before
 * it has arrived (backpressure reaches the muxer and, through it, the encoder).
 */

import { RenderError } from './render-error';

export const PART_BYTES = 16 * 1024 * 1024;

export type SendPart = (n: number, body: Uint8Array) => Promise<void>;

export class PartSplitter {
	readonly #send: SendPart;
	readonly #size: number;
	#buffers: Uint8Array[] = [];
	#active = 0;
	#fill = 0;
	#position = 0;
	#sent = 0;
	#bytes = 0;
	#inflight: Promise<void> = Promise.resolve();

	constructor(send: SendPart, size = PART_BYTES) {
		this.#send = send;
		this.#size = size;
	}

	/** Parts sent so far. */
	get parts(): number {
		return this.#sent;
	}

	/** Bytes written so far. */
	get bytes(): number {
		return this.#bytes + this.#fill;
	}

	/** The muxer's next chunk. A fragmented MP4 only ever appends; anything else is a failure. */
	async write(position: number, data: Uint8Array): Promise<void> {
		if (position !== this.#position) throw new RenderError('encode_failed');
		this.#position += data.length;
		let off = 0;
		while (off < data.length) {
			const buffer = (this.#buffers[this.#active] ??= new Uint8Array(this.#size));
			const take = Math.min(this.#size - this.#fill, data.length - off);
			buffer.set(data.subarray(off, off + take), this.#fill);
			this.#fill += take;
			off += take;
			if (this.#fill === this.#size) await this.#flush();
		}
	}

	/** Sends the last, shorter part and waits until every part has arrived. */
	async finish(): Promise<{ parts: number; bytes: number }> {
		if (this.#fill > 0) await this.#flush();
		await this.#inflight;
		return { parts: this.#sent, bytes: this.#bytes };
	}

	async #flush(): Promise<void> {
		// The other buffer's part must have arrived before this one starts.
		await this.#inflight;
		const body = this.#buffers[this.#active].subarray(0, this.#fill);
		const n = ++this.#sent;
		this.#bytes += this.#fill;
		this.#inflight = this.#send(n, body);
		// A failed part must stop the run at the next write, not be forgotten.
		this.#inflight.catch(() => undefined);
		this.#active = 1 - this.#active;
		this.#fill = 0;
	}
}
