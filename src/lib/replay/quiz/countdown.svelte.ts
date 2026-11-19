/**
 * The question's countdown as numbers the screens draw: seconds left, the
 * fraction of the time limit, and whether the last five seconds have begun.
 * The deadline is the server's (`endsAt`); the local clock is corrected by the
 * offset the socket measured. Call it while a component is being set up.
 * A replay passes its own clock (`clock`, read reactively): the deadline is then
 * on that clock and nothing ticks here.
 */
import { remainingMs } from './clock';

type Deadline = { endsAt: number; limitMs: number; offset: number };

const URGENT_SECONDS = 5;

export function createCountdown(get: () => Deadline | null, clock?: () => number) {
	let ticked = $state(Date.now());
	$effect(() => {
		if (clock) return;
		const tick = setInterval(() => (ticked = Date.now()), 250);
		return () => clearInterval(tick);
	});
	const left = $derived.by(() => {
		const d = get();
		return d ? remainingMs(d.endsAt, clock ? clock() : ticked, d.offset) : 0;
	});
	const seconds = $derived(Math.ceil(left / 1000));
	return {
		get left() {
			return left;
		},
		get seconds() {
			return seconds;
		},
		get fraction() {
			const d = get();
			return d && d.limitMs > 0 ? Math.min(1, left / d.limitMs) : 0;
		},
		get urgent() {
			return left > 0 && seconds <= URGENT_SECONDS;
		},
		get over() {
			return get() !== null && left === 0;
		}
	};
}
