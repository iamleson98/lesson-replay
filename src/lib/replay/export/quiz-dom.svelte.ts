/**
 * The game stage of a render: the player's own screens (`quiz-frame.svelte`)
 * mounted out of view and followed by the render's clock, and the painter that
 * puts them into the frame when they change. Before the first frame the stage
 * is shown once on every screen a game can have (`quiz-scan.ts`), so the
 * painter's style sheets hold what each of them uses.
 *
 * The render browser emulates reduced motion, and the screens depend on it (a
 * count-up, a row that slides and the ring's easing all read it, so nothing
 * waits on a wall clock); a render without it fails instead of drawing a
 * video that differs from run to run.
 */

import { flushSync, mount, unmount } from 'svelte';
import { QuizReplay } from '../player/quiz-replay.svelte';
import { DomPainter } from './dom-painter';
import type { Box } from './layout';
import { RenderError } from './render-error';
import { scanRecords, SCAN_TIMES } from './quiz-scan';
import QuizFrame from './quiz-frame.svelte';
import type { QuizStageSource } from './quiz-stage.svelte';

export type QuizDom = {
	painter: DomPainter;
	/** Moves the game to `time` (ms): cheap, done for every frame of a recording that has a game. */
	seek(time: number): void;
	/**
	 * Brings the mounted screens up to date and starts the paint of what changed. Only the frames
	 * that show the game call it: updating and measuring the tree costs more than the seek.
	 */
	begin(): void;
	dispose(): void;
};

/** The render browser emulates reduced motion; without it the frames would depend on the clock. */
export function assertReducedMotion(): void {
	if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
		throw new RenderError('render_failed');
}

/** How many of the rows (top and bottom, in order) end above `bound`: the rows the container shows whole. */
export function wholeRows(rows: readonly { bottom: number }[], bound: number): number {
	const first = rows.findIndex((row) => row.bottom > bound + 0.5);
	return first === -1 ? rows.length : first;
}

/** A list's rows: two or more children of one kind (items of a list, cards of a board). */
function rowsOf(el: Element): Element[] {
	const kids = Array.from(el.children).filter((kid) => getComputedStyle(kid).display !== 'none');
	return kids.length > 1 && kids.every((kid) => kid.tagName === kids[0].tagName) ? kids : [];
}

/**
 * Hides what a scrolling container cuts at its bottom edge, so the video never
 * shows half a row: the rows that do not end inside it are taken out (the
 * player would scroll to them). Returns the undo, to run before the next look.
 */
export function cutPartialRows(root: Element): () => void {
	const cut: [HTMLElement, string][] = [];
	const hide = (el: Element) => {
		const node = el as HTMLElement;
		cut.push([node, node.style.display]);
		node.style.display = 'none';
	};
	for (const box of root.querySelectorAll<HTMLElement>('*')) {
		const overflow = getComputedStyle(box).overflowY;
		if (
			(overflow !== 'auto' && overflow !== 'scroll') ||
			box.scrollHeight <= box.clientHeight + 1
		)
			continue;
		const bound = box.getBoundingClientRect().bottom;
		const visit = (parent: Element) => {
			const kids = Array.from(parent.children);
			const rows = rowsOf(parent);
			const items = rows.length > 0 ? rows : kids;
			const whole = wholeRows(
				items.map((el) => el.getBoundingClientRect()),
				bound
			);
			const straddling = items[whole];
			if (straddling && !rows.length) {
				// A wrapper around the list: look inside the child that crosses the edge.
				if (straddling.getBoundingClientRect().top < bound) visit(straddling);
				items.slice(whole + 1).forEach(hide);
				return;
			}
			items.slice(whole).forEach(hide);
		};
		visit(box);
	}
	return () => {
		for (const [el, display] of cut.reverse()) el.style.display = display;
	};
}

export async function createQuizDom(source: QuizStageSource, stage: Box): Promise<QuizDom> {
	assertReducedMotion();
	const host = document.createElement('div');
	host.setAttribute(
		'style',
		`position:fixed;top:0;left:-10000px;width:${stage.w}px;height:${stage.h}px;pointer-events:none;`
	);
	if (document.documentElement.classList.contains('dark')) host.classList.add('dark');
	document.body.append(host);

	let clock = $state(0);
	const scan = new QuizReplay(scanRecords(), () => clock);
	let shown = $state.raw(scan);
	const app = mount(QuizFrame, {
		target: host,
		props: {
			get replay() {
				return shown;
			}
		}
	});

	// What the scrolling lists cut is hidden after each flush and shown again before the next.
	let uncut = () => {};
	const settle = () => {
		uncut();
		flushSync();
		uncut = cutPartialRows(host);
	};

	const dispose = () => {
		uncut();
		void unmount(app);
		host.remove();
	};
	try {
		const painter = await DomPainter.create({
			host,
			box: stage,
			screens: SCAN_TIMES.map((time) => () => {
				clock = time;
				scan.seek(time);
				settle();
			})
		});
		scan.game.dispose();
		shown = source.replay;
		settle();
		return {
			painter,
			seek(time) {
				source.seek(time);
			},
			begin() {
				settle();
				painter.begin();
			},
			dispose
		};
	} catch (err) {
		dispose();
		throw err;
	}
}
