import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// Graphs are read once the maths pack has registered them.
import { registerMath } from '#lib/replay/board/math/pack.js';

registerMath();
import { compile, MAX_EXPRESSION_LENGTH, parseNumber } from '#lib/replay/board/math/expression.js';
import {
	formatNumber,
	paramNames,
	plotSpace,
	sliderRange,
	withEqualScale,
	withParams,
	type GraphElement
} from '#lib/replay/board/math/graph.js';
import {
	axisTicks,
	drawGraph,
	graphHit,
	niceStep,
	piLabel,
	sampleCount
} from '#lib/replay/board/math/graph-draw.js';
import { decodeElement, elementBounds, hitTest, translate } from '#lib/replay/board/elements.js';

function evalAt(src: string, x: number, params: Record<string, number> = {}, degrees = false) {
	const e = compile(src, { variable: 'x', degrees });
	if (!e.ok) throw new Error(`${src}: ${e.error}`);
	return e.eval(x, params);
}

describe('expression', () => {
	it.each([
		['x^2', 3, 9],
		['-x^2', 3, -9],
		['2x', 4, 8],
		['2x+1', 4, 9],
		['2^-x', 1, 0.5],
		['2^3^2', 0, 512],
		['(x+1)(x-1)', 3, 8],
		['x(x+1)', 2, 6],
		['sin(0)', 0, 0],
		['sqrt(x)', 16, 4],
		['abs(x-5)', 2, 3],
		['ln(e)', 0, 1],
		['log(1000)', 0, 3],
		['max(x, 2)', 5, 5],
		['x/4', 6, 1.5],
		['1/x', 4, 0.25],
		['3 × x', 2, 6],
		['x − 1', 5, 4],
		['pi', 0, Math.PI],
		['2π', 0, 2 * Math.PI],
		['sin x', 0, 0],
		['cos 0', 0, 1],
		['sin x^2', Math.sqrt(Math.PI / 2), 1],
		['arctan(1)', 0, Math.PI / 4]
	])('%s at %d is %d', (src, x, want) => {
		expect(evalAt(src, x)).toBeCloseTo(want, 9);
	});

	it('reads letters as parameters, also run together', () => {
		const e = compile('a(x-h)^2+k', { variable: 'x' });
		expect(e).toMatchObject({ ok: true, params: ['a', 'h', 'k'] });
		expect(evalAt('a(x-h)^2+k', 3, { a: 2, h: 1, k: 5 })).toBe(13);
		expect(evalAt('ax+b', 2, { a: 3, b: 1 })).toBe(7);
		const sine = compile('A sin(B(x-C))+D', { variable: 'x' });
		expect(sine).toMatchObject({ ok: true, params: ['A', 'B', 'C', 'D'] });
		const wave = compile('A*sin(ω*t+φ)', { variable: 't' });
		expect(wave).toMatchObject({ ok: true, params: ['A', 'ω', 'φ'] });
	});

	it('does not treat the variable, e or pi as parameters', () => {
		expect(compile('e^x+pi*x', { variable: 'x' })).toMatchObject({ ok: true, params: [] });
		expect(compile('x', { variable: 't' })).toMatchObject({ ok: true, params: ['x'] });
	});

	it('uses 1 for a parameter it was not given', () => {
		expect(evalAt('a*x', 3)).toBe(3);
	});

	it('reads angles in degrees when asked', () => {
		expect(evalAt('sin(30)', 0, {}, true)).toBeCloseTo(0.5, 12);
		expect(evalAt('sin(30)', 0, {}, false)).not.toBeCloseTo(0.5, 2);
		expect(evalAt('asin(1)', 0, {}, true)).toBeCloseTo(90, 9);
	});

	it('returns an error with a position, never throws', () => {
		expect(compile('', { variable: 'x' })).toMatchObject({ ok: false, error: 'empty' });
		expect(compile('   ', { variable: 'x' })).toMatchObject({ ok: false, error: 'empty' });
		expect(compile('2+', { variable: 'x' })).toMatchObject({ ok: false });
		expect(compile('(2+3', { variable: 'x' })).toMatchObject({ ok: false, error: 'unclosed' });
		expect(compile('2+3)', { variable: 'x' })).toMatchObject({ ok: false });
		expect(compile('2 # 3', { variable: 'x' })).toMatchObject({
			ok: false,
			error: 'unexpected',
			at: 2
		});
		expect(compile('sin(1,2)', { variable: 'x' })).toMatchObject({ ok: false });
		expect(compile('x'.repeat(MAX_EXPRESSION_LENGTH + 1), { variable: 'x' })).toMatchObject({
			ok: false,
			error: 'too_long'
		});
	});

	it('refuses a formula too deep or too large instead of overflowing the stack', () => {
		expect(compile('('.repeat(5000) + 'x' + ')'.repeat(5000), { variable: 'x' }).ok).toBe(
			false
		);
		expect(compile('1+'.repeat(70) + '1', { variable: 'x' })).toMatchObject({
			ok: false,
			error: 'too_complex'
		});
		expect(compile('-'.repeat(190) + 'x', { variable: 'x' }).ok).toBe(false);
	});

	it('survives random text', () => {
		const alphabet = 'x t a1234567890.+-*/^()  ,sincoqrtlge×π|\\"\'{}[]#';
		let seed = 12345;
		const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
		for (let i = 0; i < 3000; i++) {
			let src = '';
			for (let n = next() % 30; n > 0; n--) src += alphabet[next() % alphabet.length];
			expect(() => compile(src, { variable: 'x' })).not.toThrow();
		}
	});

	it('does not evaluate anything outside its grammar', () => {
		for (const src of [
			'constructor',
			'process.exit()',
			'__proto__',
			'alert(1)',
			'x=1',
			'a.b'
		]) {
			const e = compile(src, { variable: 'x' });
			if (e.ok)
				expect(Number.isFinite(e.eval(1, {})) || Number.isNaN(e.eval(1, {}))).toBe(true);
		}
	});

	it('parses numbers typed in the inspector', () => {
		expect(parseNumber('2pi')).toBeCloseTo(2 * Math.PI, 12);
		expect(parseNumber('-1/2')).toBe(-0.5);
		expect(parseNumber('0.25')).toBe(0.25);
		expect(parseNumber('x')).toBeNull();
		expect(parseNumber('a+1')).toBeNull();
		expect(parseNumber('1/0')).toBeNull();
		expect(parseNumber('')).toBeNull();
	});
});

const graph = (over: Partial<GraphElement> = {}): GraphElement => ({
	type: 'graph',
	color: 'ink',
	size: 3,
	z: 1,
	x1: 0,
	y1: 0,
	x2: 400,
	y2: 300,
	view: [-5, 5, -3, 7],
	grid: true,
	axes: true,
	degrees: false,
	piTicks: false,
	params: {},
	series: [{ kind: 'fn', expr: 'x^2', color: 'red', dash: false, shade: null, marks: [] }],
	...over
});

describe('graph element', () => {
	it('survives a round trip through the wire format', () => {
		const g = graph({
			params: { a: 2 },
			series: [
				{
					kind: 'fn',
					expr: 'a*x',
					color: 'blue',
					dash: true,
					shade: [0, 2],
					marks: ['roots', 'extrema']
				},
				{
					kind: 'param',
					x: 'cos(t)',
					y: 'sin(t)',
					t: [0, 6.28],
					color: 'green',
					dash: false
				},
				{ kind: 'point', x: 1, y: 2, label: 'A', color: 'violet' }
			]
		});
		expect(decodeElement(JSON.parse(JSON.stringify(g)))).toEqual(g);
	});

	it('drops what another client could send wrong', () => {
		const base = JSON.parse(JSON.stringify(graph()));
		const bad = (over: Record<string, unknown>) => decodeElement({ ...base, ...over });
		expect(bad({ view: [0, 0, 0, 1] })).toBeNull();
		expect(bad({ view: [5, -5, 0, 1] })).toBeNull();
		expect(bad({ view: [0, 1, 0] })).toBeNull();
		expect(bad({ view: [0, NaN, 0, 1] })).toBeNull();
		expect(bad({ x2: 'a' })).toBeNull();
		expect(bad({ series: 'x' })).toBeNull();
		expect(bad({ color: 'pink' })).toBeNull();
	});

	it('keeps at most eight series and drops malformed ones', () => {
		const fn = { kind: 'fn', expr: 'x', color: 'ink' };
		const many = decodeElement({ ...graph(), series: Array.from({ length: 20 }, () => fn) });
		expect(many?.type === 'graph' && many.series.length).toBe(8);
		const mixed = decodeElement({
			...graph(),
			series: [
				fn,
				null,
				{ kind: 'fn', expr: 5, color: 'ink' },
				{ kind: 'fn', expr: 'x'.repeat(300), color: 'ink' },
				{ kind: 'fn', expr: 'x', color: 'nope' },
				{ kind: 'param', x: 't', y: 't', t: [1, 1], color: 'ink' },
				{ kind: 'wat' }
			]
		});
		expect(mixed?.type === 'graph' && mixed.series).toHaveLength(1);
	});

	it('clamps parameters and refuses odd names', () => {
		const d = decodeElement({
			...graph(),
			params: {
				a: 1e30,
				b: 2,
				__proto__: 3,
				xx: 4,
				c: 'z',
				...Object.fromEntries('defghijkl'.split('').map((k) => [k, 1]))
			}
		});
		const params = d?.type === 'graph' ? d.params : {};
		expect(params.a).toBe(1e9);
		expect(params.xx).toBeUndefined();
		expect(Object.keys(params).length).toBeLessThanOrEqual(8);
	});

	it('finds the letters its formulas use', () => {
		const g = graph({
			series: [
				{ kind: 'fn', expr: 'a*x+b', color: 'ink', dash: false, shade: null, marks: [] },
				{
					kind: 'param',
					x: 'r*cos(t)',
					y: 'r*sin(t)',
					t: [0, 1],
					color: 'ink',
					dash: false
				}
			]
		});
		expect(paramNames(g)).toEqual(['a', 'b', 'r']);
		const kept = withParams({ ...g, params: { a: 5, zz: 1, q: 2 } });
		expect(kept.params).toEqual({ a: 5, b: 1, r: 1 });
	});

	it('maps between the plane and the board', () => {
		const s = plotSpace(graph({ x1: 100, y1: 50, x2: 500, y2: 350 }));
		expect(s.px(-5)).toBe(100);
		expect(s.px(5)).toBe(500);
		expect(s.py(7)).toBe(50);
		expect(s.py(-3)).toBe(350);
		expect(s.mx(s.px(1.25))).toBeCloseTo(1.25, 12);
		expect(s.my(s.py(-1.5))).toBeCloseTo(-1.5, 12);
	});

	it('makes a circle round with equal scale', () => {
		const g = withEqualScale(graph());
		const s = plotSpace(g);
		expect((s.px(1) - s.px(0)) / (s.py(0) - s.py(1))).toBeCloseTo(1, 12);
		expect((g.view[2] + g.view[3]) / 2).toBeCloseTo(2, 12);
	});

	it('picks slider ranges that contain the value', () => {
		expect(sliderRange(2)).toEqual([-10, 10]);
		expect(sliderRange(-37)[1]).toBeGreaterThanOrEqual(37);
		expect(sliderRange(2500)[1]).toBeGreaterThanOrEqual(2500);
	});

	it('formats numbers without float noise', () => {
		expect(formatNumber(0.1 + 0.2)).toBe('0.3');
		expect(formatNumber(1e-15)).toBe('0');
		expect(formatNumber(-2.5)).toBe('-2.5');
		expect(formatNumber(1234567)).toBe('1.23e6');
	});

	it('has bounds, moves and is hit on its curve but not its blank inside', () => {
		const g = graph({ axes: false, grid: false });
		const measure = () => 10;
		const b = elementBounds(g, measure);
		expect(b.minX).toBeLessThanOrEqual(0);
		expect(b.maxX).toBeGreaterThanOrEqual(400);
		const s = plotSpace(g);
		expect(hitTest(g, { x: s.px(2), y: s.py(4) }, 4, measure)).toBe(true);
		expect(hitTest(g, { x: s.px(-4), y: s.py(-2) }, 4, measure)).toBe(false);
		expect(hitTest(g, { x: 0, y: 150 }, 4, measure)).toBe(true);
		const moved = translate(g, 10, -5);
		expect(moved).toMatchObject({ x1: 10, y1: -5, x2: 410, y2: 295 });
	});

	it('is hit on its axes', () => {
		const g = graph();
		const s = plotSpace(g);
		expect(graphHit(g, { x: s.px(0), y: s.py(5) }, 4)).toBe(true);
		expect(graphHit(g, { x: s.px(3), y: s.py(0) }, 4)).toBe(true);
	});
});

describe('ticks', () => {
	it('uses 1, 2 and 5 steps', () => {
		expect(niceStep(10, 5)).toBe(2);
		expect(niceStep(12, 6)).toBe(2);
		expect(niceStep(100, 4)).toBe(20);
		expect(niceStep(0.3, 6)).toBe(0.05);
	});

	it('labels the ticks in range, zero exactly', () => {
		const t = axisTicks(-5, 5, 400, false);
		expect(t.map((x) => x.value)).toContain(0);
		expect(t.every((x) => x.value >= -5 && x.value <= 5)).toBe(true);
		expect(t.find((x) => x.value === 0)?.label).toBe('0');
		expect(t.length).toBeGreaterThan(3);
	});

	it('writes multiples of π as fractions', () => {
		expect(piLabel(0, 4)).toBe('0');
		expect(piLabel(4, 4)).toBe('π');
		expect(piLabel(2, 4)).toBe('π/2');
		expect(piLabel(3, 4)).toBe('3π/4');
		expect(piLabel(-6, 4)).toBe('-3π/2');
		expect(piLabel(8, 4)).toBe('2π');
		const t = axisTicks(-2 * Math.PI, 2 * Math.PI, 480, true);
		expect(t.map((x) => x.label)).toContain('π');
		expect(t.map((x) => x.label)).toContain('-π');
		expect(t.map((x) => x.label)).toContain('2π');
	});

	it('samples about once per two pixels, within bounds', () => {
		expect(sampleCount(10)).toBe(64);
		expect(sampleCount(400)).toBe(224);
		expect(sampleCount(1e6)).toBe(800);
	});
});

/** Records what a Path2D was asked to draw. */
class FakePath {
	runs = 0;
	points = 0;
	closed = 0;
	moveTo() {
		this.runs++;
		this.points++;
	}
	lineTo() {
		this.points++;
	}
	closePath() {
		this.closed++;
	}
}

function fakeCtx(scale = 1) {
	const paths: FakePath[] = [];
	const texts: string[] = [];
	const noop = () => {};
	const ctx = {
		paths,
		texts,
		getTransform: () => ({ a: scale, b: 0 }),
		fill: (p?: FakePath) => p && paths.push(p),
		stroke: (p?: FakePath) => p && paths.push(p),
		fillText: (t: string) => texts.push(t),
		strokeText: noop,
		save: noop,
		restore: noop,
		beginPath: noop,
		rect: noop,
		clip: noop,
		moveTo: noop,
		lineTo: noop,
		arc: noop,
		strokeRect: noop,
		setLineDash: noop
	};
	return ctx as unknown as CanvasRenderingContext2D & { paths: FakePath[]; texts: string[] };
}

const style = { ink: () => '#000', muted: '#555', font: 'sans-serif', dark: false };

describe('drawing a graph', () => {
	beforeAll(() => {
		vi.stubGlobal('Path2D', FakePath);
	});
	afterEach(() => vi.clearAllMocks());

	it('draws a smooth curve as one run', () => {
		const ctx = fakeCtx();
		drawGraph(ctx, graph(), style);
		expect(ctx.paths).toHaveLength(1);
		expect(ctx.paths[0].runs).toBe(1);
		expect(ctx.paths[0].points).toBeGreaterThan(64);
	});

	it('breaks tan(x) and 1/x at their asymptotes', () => {
		const tan = graph({
			view: [-6, 6, -4, 4],
			series: [
				{ kind: 'fn', expr: 'tan(x)', color: 'ink', dash: false, shade: null, marks: [] }
			]
		});
		const ctx = fakeCtx();
		drawGraph(ctx, tan, style);
		expect(ctx.paths[0].runs).toBeGreaterThanOrEqual(3);

		const inv = graph({
			series: [{ kind: 'fn', expr: '1/x', color: 'ink', dash: false, shade: null, marks: [] }]
		});
		const ctx2 = fakeCtx();
		drawGraph(ctx2, inv, style);
		expect(ctx2.paths[0].runs).toBe(2);
	});

	it('leaves out what cannot be read and draws the rest', () => {
		const g = graph({
			series: [
				{ kind: 'fn', expr: '2+', color: 'ink', dash: false, shade: null, marks: [] },
				{ kind: 'fn', expr: 'x', color: 'ink', dash: false, shade: null, marks: [] }
			]
		});
		const ctx = fakeCtx();
		expect(() => drawGraph(ctx, g, style)).not.toThrow();
		expect(ctx.paths).toHaveLength(1);
	});

	it('draws a parametric circle and the labelled point', () => {
		const g = graph({
			series: [
				{
					kind: 'param',
					x: '2cos(t)',
					y: '2sin(t)',
					t: [0, 2 * Math.PI],
					color: 'blue',
					dash: false
				},
				{ kind: 'point', x: 1, y: 1, label: 'M', color: 'red' }
			]
		});
		const ctx = fakeCtx();
		drawGraph(ctx, g, style);
		expect(ctx.paths[0].runs).toBe(1);
		expect(ctx.texts).toContain('M');
	});

	it('marks the roots, the vertex and the intercept of a parabola', () => {
		const g = graph({
			view: [-6, 6, -6, 10],
			series: [
				{
					kind: 'fn',
					expr: 'x^2-4',
					color: 'red',
					dash: false,
					shade: null,
					marks: ['roots', 'extrema', 'intercept']
				}
			]
		});
		const ctx = fakeCtx();
		drawGraph(ctx, g, style);
		expect(ctx.texts).toContain('(-2, 0)');
		expect(ctx.texts).toContain('(2, 0)');
		expect(ctx.texts).toContain('(0, -4)');
	});

	it('shades the area under a curve and reads its value', () => {
		const g = graph({
			view: [-1, 4, -1, 10],
			series: [
				{ kind: 'fn', expr: 'x^2', color: 'green', dash: false, shade: [0, 3], marks: [] }
			]
		});
		const ctx = fakeCtx();
		drawGraph(ctx, g, style);
		expect(ctx.texts.some((t) => t === 'S = 9')).toBe(true);
	});

	it('only frames a graph too small to read', () => {
		const ctx = fakeCtx(0.05);
		drawGraph(ctx, graph(), style);
		expect(ctx.paths).toHaveLength(0);
	});

	it('draws the same element from the cache', () => {
		const g = graph();
		const first = fakeCtx();
		drawGraph(first, g, style);
		const second = fakeCtx();
		drawGraph(second, g, style);
		expect(second.paths[0]).toBe(first.paths[0]);
	});
});
