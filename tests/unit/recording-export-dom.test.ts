import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { replayStrings } from '#lib/replay/i18n/strings.svelte.js';
import {
	CssPruner,
	forTree,
	stillCss,
	svgDataUrl,
	svgShell,
	svgText,
	treeMatcher,
	type RuleLike
} from '#lib/replay/export/dom-css.js';
import { DomPainter, quantiseRings } from '#lib/replay/export/dom-painter.js';
import {
	assertReducedMotion,
	cutPartialRows,
	wholeRows
} from '#lib/replay/export/quiz-dom.svelte.js';
import { SCAN_TIMES, scanRecords } from '#lib/replay/export/quiz-scan.js';
import { RenderError } from '#lib/replay/export/render-error.js';
import { renderLocale } from '#lib/replay/export/start.js';
import { QuestReplay } from '#lib/replay/player/quest-replay.svelte.js';
import { QuizReplay } from '#lib/replay/player/quiz-replay.svelte.js';

const style = (selector: string, body = 'color:red'): RuleLike => ({
	selectorText: selector,
	cssText: `${selector}{${body}}`
});
const group = (head: string, rules: RuleLike[]): RuleLike => ({
	cssText: `${head} {${rules.map((r) => r.cssText).join('')}}`,
	cssRules: rules
});
const tree = (html: string) => {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
};

describe('the style rules a still image needs', () => {
	const stylesheet = [
		style(':root', '--background:#fff'),
		style('.dark', '--background:#000'),
		style('html'),
		style('.used'),
		style('.unused'),
		style('.sm\\:p-5', 'padding:1.25rem'),
		style('.used::before', 'content:""'),
		style('.hover\\:x:hover'),
		{ cssText: '@font-face{font-family:Inter}' },
		{ cssText: '@keyframes spin{from{opacity:0}}', cssRules: [style('from')] },
		group('@media (min-width: 640px)', [style('.sm\\:p-5'), style('.gone')]),
		group('@media (min-width: 1024px)', [style('.gone')]),
		group('@layer base', [style('.used'), style('.gone')])
	];

	it('keeps what the screens use, escaped class names included, and drops the rest', () => {
		const pruner = new CssPruner(stylesheet);
		pruner.scan(treeMatcher(tree('<p class="used sm:p-5">x</p>')));
		const css = pruner.text();
		expect(css).toContain('.used{');
		expect(css).toContain('.sm\\:p-5{padding:1.25rem}');
		expect(css).toContain('.used::before{');
		expect(css).not.toContain('.unused');
		expect(css).not.toContain('.gone');
		expect(css).not.toContain('.hover\\:x:hover');
		// a group keeps its head and only the rules inside it that are used
		expect(css).toContain('@media (min-width: 640px) {.sm\\:p-5{color:red}}');
		expect(css).toContain('@layer base {.used{color:red}}');
		expect(css).not.toContain('1024px');
	});

	it('always keeps the variables, the theme class, fonts and keyframes', () => {
		const pruner = new CssPruner(stylesheet);
		pruner.scan(treeMatcher(tree('<p>nothing</p>')));
		const css = pruner.text();
		for (const kept of [':root{', '.dark{', 'html{', '@font-face{', '@keyframes spin']) {
			expect(css).toContain(kept);
		}
		expect(css).not.toContain('.used');
	});

	it('collects the rules of every screen it is shown, and counts only new ones', () => {
		const pruner = new CssPruner(stylesheet);
		pruner.scan(treeMatcher(tree('<p class="used">a</p>')));
		const first = pruner.size;
		pruner.scan(treeMatcher(tree('<p class="used">a</p>')));
		expect(pruner.size).toBe(first);
		pruner.scan(treeMatcher(tree('<p class="unused">b</p>')));
		expect(pruner.size).toBe(first + 1);
		expect(pruner.text()).toContain('.unused{');
	});

	it('tests a selector without its pseudo-elements and keeps an escaped colon', () => {
		expect(forTree('.a::before, .b::after')).toBe('.a, .b');
		expect(forTree('.a:before')).toBe('.a');
		expect(forTree('.sm\\:p-5')).toBe('.sm\\:p-5');
		expect(forTree('.a:not(.b)::placeholder')).toBe('.a:not(.b)');
		// a selector the browser cannot parse is kept rather than lost
		expect(treeMatcher(tree('<p></p>'))('::::')).toBe(true);
	});
});

describe('the CSS as a still image reads it', () => {
	it('pins the reduced-motion queries, hides scrollbars and inlines the fonts', () => {
		const css = stillCss(
			'@font-face{src:url("/fonts/a.woff2") format(\'woff2-variations\')}' +
				'@media (prefers-reduced-motion: reduce){.a{transition:none}}' +
				'@media (prefers-reduced-motion:no-preference){.b{animation:x 1s}}',
			new Map([['/fonts/a.woff2', 'data:font/woff2;base64,AQID']])
		);
		expect(css).toContain('url("data:font/woff2;base64,AQID")');
		expect(css).toContain('@media all{.a{');
		expect(css).toContain('@media not all{.b{');
		expect(css).not.toContain('prefers-reduced-motion');
		expect(css.endsWith('*{scrollbar-width:none}')).toBe(true);
	});

	it('leaves a font it has no bytes for as written', () => {
		expect(stillCss('@font-face{src:url(/fonts/b.woff2)}', new Map())).toContain(
			'url(/fonts/b.woff2)'
		);
	});
});

describe('the serialised SVG', () => {
	const shell = svgShell({ w: 1280, h: 624 }, '.a>.b{content:"<&>"}');
	const markup = '<div xmlns="http://www.w3.org/1999/xhtml" class="a">é &amp; ú</div>';

	it('holds the stage in a foreignObject of the stage size, with the CSS escaped', () => {
		const svg = svgText(shell, markup);
		expect(
			svg.startsWith(
				'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="624" viewBox="0 0 1280 624"><foreignObject width="1280" height="624">'
			)
		).toBe(true);
		expect(svg.endsWith('</foreignObject></svg>')).toBe(true);
		expect(svg).toContain('<style>.a>.b{content:"&lt;&amp;>"}</style>' + markup);
		const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
		expect(parsed.querySelector('parsererror')).toBeNull();
		expect(parsed.querySelector('style')?.textContent).toBe('.a>.b{content:"<&>"}');
	});

	it('is the same text as a data URL, with the shell encoded once', () => {
		const url = svgDataUrl(shell, markup);
		expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
		expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(svgText(shell, markup));
	});
});

describe('the countdown ring in steps', () => {
	const ring = (offset: string) =>
		`<circle stroke-dasharray="276" stroke-dashoffset="${offset}"/>`;

	it('rounds a ring offset to a step so a second of frames is one picture', () => {
		expect(quantiseRings(ring('100'))).toBe(quantiseRings(ring('100.5')));
		expect(quantiseRings(ring('100'))).not.toBe(quantiseRings(ring('120')));
		expect(quantiseRings(ring('0'))).toContain('stroke-dashoffset="0.00"');
	});
});

describe('painting a mounted tree only when it changes', () => {
	const box = { x: 0, y: 0, w: 1280, h: 624 };
	const rules = [
		style(':root'),
		style('.a', 'color:red'),
		style('.b', 'color:blue'),
		{ cssText: '@font-face{src:url("/fonts/a.woff2")}' }
	];

	function setup() {
		const host = document.createElement('div');
		host.innerHTML = '<p class="a">1</p><svg><circle stroke-dashoffset="100"></circle></svg>';
		document.body.append(host);
		const urls: string[] = [];
		const resolvers: ((image: CanvasImageSource) => void)[] = [];
		const loadImage = (url: string) =>
			new Promise<CanvasImageSource>((resolve) => {
				urls.push(url);
				resolvers.push(resolve);
			});
		const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
		return { host, urls, resolvers, loadImage, ctx };
	}
	const create = (s: ReturnType<typeof setup>) =>
		DomPainter.create({
			host: s.host,
			box,
			screens: [() => undefined],
			rules,
			readFont: async () => new Uint8Array([1, 2, 3]),
			loadImage: s.loadImage
		});
	afterEach(() => document.body.replaceChildren());

	it('loads one image for any number of frames of the same content', async () => {
		const s = setup();
		const painter = await create(s);
		painter.begin();
		painter.begin();
		painter.begin();
		expect(s.urls).toHaveLength(1);
		s.resolvers[0]({} as CanvasImageSource);
		await painter.draw(s.ctx);
		painter.begin();
		await painter.draw(s.ctx);
		expect(s.urls).toHaveLength(1);
		expect(s.ctx.drawImage).toHaveBeenCalledTimes(2);
	});

	it('loads again when the text changes, and when the ring moves a step, not within one', async () => {
		const s = setup();
		const painter = await create(s);
		painter.begin();
		const circle = s.host.querySelector('circle') as SVGCircleElement;
		circle.setAttribute('stroke-dashoffset', '100.5');
		painter.begin();
		expect(s.urls).toHaveLength(1);
		circle.setAttribute('stroke-dashoffset', '120');
		painter.begin();
		expect(s.urls).toHaveLength(2);
		(s.host.querySelector('p') as HTMLElement).textContent = '2';
		painter.begin();
		expect(s.urls).toHaveLength(3);
	});

	it('makes the frame that needs a new image wait for exactly that image', async () => {
		const s = setup();
		const painter = await create(s);
		painter.begin();
		const first = {} as CanvasImageSource;
		s.resolvers[0](first);
		await painter.draw(s.ctx);

		(s.host.querySelector('p') as HTMLElement).textContent = '2';
		painter.begin();
		let drawn = false;
		const waiting = painter.draw(s.ctx).then(() => (drawn = true));
		await Promise.resolve();
		await Promise.resolve();
		expect(drawn).toBe(false);
		const second = {} as CanvasImageSource;
		s.resolvers[1](second);
		await waiting;
		expect(s.ctx.drawImage).toHaveBeenLastCalledWith(second, 0, 0, 1280, 624);
	});

	it('paints with the CSS the screens use, the font inlined and the page unchanged', async () => {
		const s = setup();
		const painter = await create(s);
		painter.begin();
		const svg = decodeURIComponent(s.urls[0].slice(s.urls[0].indexOf(',') + 1));
		expect(svg).toContain('.a{color:red}');
		expect(svg).not.toContain('.b{');
		expect(svg).toContain('url("data:font/woff2;base64,AQID")');
		expect(svg).toContain('width:1280px;height:624px');
		expect(svg).toContain('font-family:var(--font-sans)');
	});

	it('collects the rules of a class no screen of the scan had, and repaints', async () => {
		const s = setup();
		const painter = await create(s);
		painter.begin();
		(s.host.querySelector('p') as HTMLElement).className = 'a b';
		painter.begin();
		expect(s.urls).toHaveLength(2);
		expect(decodeURIComponent(s.urls[1])).toContain('.b{color:blue}');
	});

	it('fails the render, with its code, when a frame is drawn that was never begun or cannot load', async () => {
		const s = setup();
		const painter = await create(s);
		await expect(painter.draw(s.ctx)).rejects.toMatchObject({ code: 'render_failed' });
		const failing = await DomPainter.create({
			host: s.host,
			box,
			screens: [],
			rules,
			readFont: async () => new Uint8Array(),
			loadImage: () => Promise.reject(new Error('decode'))
		});
		failing.begin();
		await expect(failing.draw(s.ctx)).rejects.toMatchObject({ code: 'render_failed' });
	});
});

describe('the made-up game that shows every screen', () => {
	beforeAll(() => replayStrings.use('en'));

	it('reaches the race screens and every Quest screen in order', () => {
		let clock = 0;
		const replay = new QuizReplay(scanRecords(), () => clock);
		const quest = new QuestReplay(replay.records);
		const seen: string[] = [];
		for (const time of SCAN_TIMES) {
			clock = time;
			replay.seek(time);
			if (replay.mode === 'quest') {
				quest.seek(time);
				const game = quest.game;
				seen.push(
					game.phase === 'running'
						? `quest running ${game.board.top.length > 0 ? 'board' : 'empty'}`
						: `quest ${game.phase}`
				);
			} else seen.push(replay.game.active ? replay.game.phase : 'none');
		}
		expect(seen).toEqual([
			'none',
			'lobby',
			'question',
			'question',
			'reveal',
			'podium',
			'none',
			'quest lobby',
			'quest running empty',
			'quest running board',
			'quest running board',
			'quest podium'
		]);
		replay.game.dispose();
		quest.game.dispose();
	});
});

describe('what the render page needs from the browser and its address', () => {
	it('asks for the language in the address, English by default', () => {
		expect(renderLocale('?lang=vi')).toBe('vi');
		expect(renderLocale('?lang=en')).toBe('en');
		expect(renderLocale('')).toBe('en');
		expect(renderLocale('?lang=fr')).toBe('en');
	});

	it('fails with render_failed unless the browser emulates reduced motion', () => {
		const original = window.matchMedia;
		const media = (matches: boolean) => {
			window.matchMedia = ((query: string) => ({
				matches,
				media: query
			})) as typeof matchMedia;
		};
		try {
			media(false);
			expect(() => assertReducedMotion()).toThrowError(RenderError);
			expect(() => assertReducedMotion()).toThrowError('render_failed');
			media(true);
			expect(() => assertReducedMotion()).not.toThrow();
		} finally {
			window.matchMedia = original;
		}
	});
});

describe('what the render leaves out of the stage', () => {
	it('counts the rows a container shows whole', () => {
		const rows = [{ bottom: 40 }, { bottom: 80 }, { bottom: 120 }, { bottom: 160 }];
		expect(wholeRows(rows, 100)).toBe(2);
		expect(wholeRows(rows, 120)).toBe(3);
		expect(wholeRows(rows, 500)).toBe(4);
		expect(wholeRows(rows, 10)).toBe(0);
		expect(wholeRows([], 10)).toBe(0);
	});

	it('hides the rows a scrolling list cuts and shows them again on undo', () => {
		const box = document.createElement('div');
		box.style.overflowY = 'auto';
		const list = document.createElement('ul');
		const items = [0, 1, 2, 3].map(() => document.createElement('li'));
		list.append(...items);
		box.append(list);
		document.body.append(box);
		const rect = (bottom: number) => ({ top: bottom - 40, bottom }) as DOMRect;
		box.getBoundingClientRect = () => rect(100);
		list.getBoundingClientRect = () => ({ top: 0, bottom: 160 }) as DOMRect;
		items.forEach((li, i) => (li.getBoundingClientRect = () => rect(40 * (i + 1))));
		Object.defineProperty(box, 'scrollHeight', { value: 160 });
		Object.defineProperty(box, 'clientHeight', { value: 100 });
		try {
			const undo = cutPartialRows(document.body);
			expect(items.map((li) => li.style.display)).toEqual(['', '', 'none', 'none']);
			undo();
			expect(items.map((li) => li.style.display)).toEqual(['', '', '', '']);
		} finally {
			box.remove();
		}
	});

	it('cuts each column of a grid on its own, never the whole stage', () => {
		// The host's question: the question and tiles in a left column, ten standings rows in a right one that
		// is taller than the scrolling box; a grid stretches the left column to the right one's height.
		const box = document.createElement('div');
		box.style.overflowY = 'auto';
		const grid = document.createElement('div');
		const left = document.createElement('div');
		const right = document.createElement('div');
		const list = document.createElement('ol');
		const rows = Array.from({ length: 10 }, () => document.createElement('li'));
		list.append(...rows);
		right.append(list);
		left.append(document.createElement('h2'));
		grid.append(left, right);
		box.append(grid);
		document.body.append(box);
		const rect = (top: number, bottom: number) => () => ({ top, bottom }) as DOMRect;
		box.getBoundingClientRect = rect(0, 400);
		grid.getBoundingClientRect = rect(0, 500);
		left.getBoundingClientRect = rect(0, 500);
		right.getBoundingClientRect = rect(0, 500);
		list.getBoundingClientRect = rect(0, 500);
		rows.forEach((li, i) => (li.getBoundingClientRect = rect(i * 50, (i + 1) * 50)));
		Object.defineProperty(box, 'scrollHeight', { value: 500 });
		Object.defineProperty(box, 'clientHeight', { value: 400 });
		try {
			const undo = cutPartialRows(document.body);
			expect(left.style.display).toBe('');
			expect(rows.map((li) => li.style.display)).toEqual([
				...Array(8).fill(''),
				'none',
				'none'
			]);
			undo();
		} finally {
			box.remove();
		}
	});

	it('hides the host controls (buttons and switches) in the render frame only', () => {
		const source = readFileSync('src/lib/replay/export/quiz-frame.svelte', 'utf8');
		expect(source).toMatch(
			/\[data-render-frame\] button\)[^{]*\[data-render-frame\] \[role='switch'\]\)\s*\{\s*visibility: hidden/
		);
	});
});
