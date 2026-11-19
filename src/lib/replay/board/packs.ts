/**
 * Feature packs: heavy features that load on demand, so a board used for a
 * language class carries none of the maths code.
 *
 * A pack has two halves. The element half (reading, measuring and drawing its
 * element types) loads when a teacher turns the pack on, and also when an
 * element of its types shows up on a board (a student must see what the
 * teacher drew); it registers its types with `registerKind`. The tools half
 * (menus, inspectors, presets) loads only for the teacher who asks for it.
 */

export type PackId = 'math' | 'physics';

export const PACK_IDS: readonly PackId[] = ['math', 'physics'];

const loaders: Record<PackId, () => Promise<void>> = {
	math: async () => (await import('./math/pack')).registerMath(),
	physics: async () => (await import('./physics/pack')).registerPhysics()
};

const loaded = new Set<PackId>();
const loading = new Map<PackId, Promise<void>>();

export function packLoaded(id: PackId): boolean {
	return loaded.has(id);
}

/** Loads a pack's element half once; a failed load can be asked for again. */
export function loadPack(id: PackId): Promise<void> {
	let load = loading.get(id);
	if (!load) {
		load = loaders[id]().then(
			() => {
				loaded.add(id);
			},
			(err: unknown) => {
				loading.delete(id);
				throw err;
			}
		);
		loading.set(id, load);
	}
	return load;
}

/**
 * Runs `load` until it succeeds, a few tries a few seconds apart: a pack is
 * only code, and a bad stretch of network should not leave the board without
 * its tools. Returns a function that stops the retries.
 */
export function loadWithRetries(
	load: () => Promise<unknown>,
	tries = 3,
	delayMs = 4000
): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	const attempt = (left: number) => {
		load().catch(() => {
			if (stopped || left <= 1) return;
			timer = setTimeout(() => attempt(left - 1), delayMs);
		});
	};
	attempt(tries);
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
