/**
 * Physics symbols kept as what they are (a resistor, a spring of 8 coils, an
 * incline of 30°), never as drawn lines: a few dozen bytes to store and send,
 * redrawn exactly at any size and turned by quarter turns.
 *
 * Each kind is a small builder: given the room it has (width, height) and one
 * number (coils, an angle, a focal distance, open or closed) it returns lines,
 * dots and letters around the origin, y down. Circuit parts keep their leads
 * at the two ends so they join when placed in a row; round parts stay round
 * whatever box they are stretched to.
 */

import type { Common } from '../elements';

export const SYMBOL_GROUPS = {
	mechanics: ['block', 'spring', 'pulley', 'pendulum', 'incline'],
	electricity: [
		'battery',
		'resistor',
		'rheostat',
		'capacitor',
		'inductor',
		'switch',
		'bulb',
		'ammeter',
		'voltmeter',
		'acSource',
		'ground'
	],
	optics: ['convexLens', 'concaveLens', 'planeMirror', 'concaveMirror', 'convexMirror'],
	fields: ['positiveCharge', 'negativeCharge', 'magnet']
} as const;

export type SymbolGroup = keyof typeof SYMBOL_GROUPS;
export type SymbolKind = (typeof SYMBOL_GROUPS)[SymbolGroup][number];
export const SYMBOL_KINDS = Object.values(SYMBOL_GROUPS).flat() as SymbolKind[];

export const MIN_SYMBOL = 24;
export const MAX_LABEL = 40;

export type SymbolElement = Common & {
	type: 'symbol';
	kind: SymbolKind;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	/** Quarter turns clockwise. */
	turns: 0 | 1 | 2 | 3;
	label: string;
	/** What the kind has one number for (see VALUES); 0 for the others. */
	value: number;
};

/** The one number some kinds take: its range, and what it is called. */
type ValueSpec = { min: number; max: number; step: number; initial: number; name: string };

export const VALUES: Partial<Record<SymbolKind, ValueSpec>> = {
	spring: { min: 3, max: 16, step: 1, initial: 8, name: 'coils' },
	pendulum: { min: -80, max: 80, step: 1, initial: 30, name: 'angle' },
	incline: { min: 5, max: 80, step: 1, initial: 30, name: 'angle' },
	switch: { min: 0, max: 1, step: 1, initial: 1, name: 'closed' },
	convexLens: { min: 20, max: 90, step: 5, initial: 50, name: 'focal' },
	concaveLens: { min: 20, max: 90, step: 5, initial: 50, name: 'focal' }
};

/** How big a new symbol is, in board units. */
export const DEFAULT_SIZES: Record<SymbolKind, [number, number]> = {
	block: [90, 60],
	spring: [160, 50],
	pulley: [120, 120],
	pendulum: [150, 200],
	incline: [260, 180],
	battery: [100, 50],
	resistor: [120, 40],
	rheostat: [140, 50],
	capacitor: [100, 50],
	inductor: [140, 40],
	switch: [120, 50],
	bulb: [100, 60],
	ammeter: [100, 60],
	voltmeter: [100, 60],
	acSource: [100, 60],
	ground: [50, 60],
	convexLens: [300, 160],
	concaveLens: [300, 160],
	planeMirror: [100, 180],
	concaveMirror: [200, 180],
	convexMirror: [200, 180],
	positiveCharge: [60, 60],
	negativeCharge: [60, 60],
	magnet: [160, 50]
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function decodeSymbol(d: Record<string, unknown>, common: Common): SymbolElement | null {
	if (![d.x1, d.y1, d.x2, d.y2].every(finite)) return null;
	if (!(SYMBOL_KINDS as unknown[]).includes(d.kind)) return null;
	const kind = d.kind as SymbolKind;
	const spec = VALUES[kind];
	const value = spec
		? finite(d.value)
			? Math.min(spec.max, Math.max(spec.min, d.value))
			: spec.initial
		: 0;
	return {
		...common,
		type: 'symbol',
		kind,
		x1: d.x1 as number,
		y1: d.y1 as number,
		x2: d.x2 as number,
		y2: d.y2 as number,
		turns: (finite(d.turns) ? ((Math.round(d.turns) % 4) + 4) % 4 : 0) as 0 | 1 | 2 | 3,
		label: typeof d.label === 'string' ? d.label.slice(0, MAX_LABEL) : '',
		value
	};
}

// ─── Drawing primitives ────────────────────────────────────────────────

type Prim = { points: number[]; fill?: boolean; dashed?: boolean };
export type Drawing = {
	lines: Prim[];
	/** Filled dots: x, y, radius. */
	dots: [number, number, number][];
	texts: { text: string; x: number; y: number; size: number }[];
};

const line = (...points: number[]): Prim => ({ points });
const rect = (x0: number, y0: number, x1: number, y1: number, fill = false): Prim => ({
	points: [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0],
	fill
});
const STEPS = 40;
const arcPoints = (cx: number, cy: number, r: number, from: number, to: number, steps = STEPS) =>
	Array.from({ length: steps + 1 }, (_, i) => {
		const a = from + ((to - from) * i) / steps;
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
	}).flat();
const circle = (cx: number, cy: number, r: number, fill = false): Prim => ({
	points: arcPoints(cx, cy, r, 0, 2 * Math.PI),
	fill
});
const empty = (): Drawing => ({ lines: [], dots: [], texts: [] });
const rad = (deg: number) => (deg * Math.PI) / 180;

/** An arrowhead at `tip` for a line coming from `from`. */
function head(tipX: number, tipY: number, fromX: number, fromY: number, size: number): Prim {
	const a = Math.atan2(tipY - fromY, tipX - fromX);
	const spread = rad(28);
	return line(
		tipX - size * Math.cos(a - spread),
		tipY - size * Math.sin(a - spread),
		tipX,
		tipY,
		tipX - size * Math.cos(a + spread),
		tipY - size * Math.sin(a + spread)
	);
}

type Builder = (w: number, h: number, value: number) => Drawing;

/** Leads from both ends to a part `span` wide in the middle. */
const leads = (hw: number, span: number): Prim[] => [
	line(-hw, 0, -span / 2, 0),
	line(span / 2, 0, hw, 0)
];

const meter =
	(letter: string): Builder =>
	(w, h) => {
		const r = Math.min(h * 0.5, w * 0.3);
		return {
			lines: [circle(0, 0, r), ...leads(w / 2, 2 * r)],
			dots: [],
			texts: [{ text: letter, x: 0, y: 0, size: r * 1.2 }]
		};
	};

const charge =
	(sign: '+' | '−'): Builder =>
	(w, h) => {
		const r = Math.min(w, h) * 0.45;
		const lines = [circle(0, 0, r), line(-r * 0.5, 0, r * 0.5, 0)];
		if (sign === '+') lines.push(line(0, -r * 0.5, 0, r * 0.5));
		return { ...empty(), lines };
	};

const BUILDERS: Record<SymbolKind, Builder> = {
	block: (w, h) => ({ ...empty(), lines: [rect(-w / 2, -h / 2, w / 2, h / 2, true)] }),

	spring: (w, h, value) => {
		const hw = w / 2;
		const lead = Math.min(w * 0.12, 16);
		const coils = Math.round(value);
		const amp = h * 0.4;
		const points = [-hw, 0, -hw + lead, 0];
		for (let i = 0; i < coils * 2; i++) {
			points.push(
				-hw + lead + ((w - 2 * lead) * (i + 0.5)) / (coils * 2),
				i % 2 === 0 ? -amp : amp
			);
		}
		points.push(hw - lead, 0, hw, 0);
		return { ...empty(), lines: [line(...points)] };
	},

	pulley: (w, h) => {
		const r = Math.min(w, h) * 0.4;
		return {
			lines: [
				circle(0, 0, r),
				line(0, 0, 0, -h / 2),
				line(-r, 0, -r, h / 2),
				line(r, 0, r, h / 2)
			],
			dots: [[0, 0, Math.max(3, r * 0.1)]],
			texts: []
		};
	},

	pendulum: (w, h, value) => {
		const angle = rad(value);
		const top = -h / 2;
		const length = h * 0.85;
		const bob = Math.max(6, Math.min(w, h) * 0.07);
		const bx = length * Math.sin(angle);
		const by = top + length * Math.cos(angle);
		const arcR = length * 0.3;
		const arc =
			angle === 0 ? [] : arcPoints(0, top, arcR, Math.PI / 2, Math.PI / 2 - angle, 24);
		return {
			lines: [
				line(-w * 0.25, top, w * 0.25, top),
				{ points: [0, top, 0, top + length], dashed: true },
				line(0, top, bx, by),
				circle(bx, by, bob, true),
				...(arc.length ? [line(...arc)] : [])
			],
			dots: [],
			texts:
				angle === 0
					? []
					: [
							{
								text: 'θ',
								x: arcR * 1.4 * Math.sin(angle / 2),
								y: top + arcR * 1.4 * Math.cos(angle / 2),
								size: 15
							}
						]
		};
	},

	incline: (w, h, value) => {
		const angle = rad(value);
		const base = Math.min(w, h / Math.tan(angle));
		const rise = base * Math.tan(angle);
		// A at the left, B the right angle, C the top; y down, A and B on the ground.
		const [ax, ay, bx, by, cx, cy] = [
			-base / 2,
			rise / 2,
			base / 2,
			rise / 2,
			base / 2,
			-rise / 2
		];
		const slope = [Math.cos(angle), -Math.sin(angle)];
		const up = [-Math.sin(angle), -Math.cos(angle)];
		const size = base * 0.14;
		const px = ax + (cx - ax) * 0.55;
		const py = ay + (cy - ay) * 0.55;
		const corner = (s: number, n: number) => [
			px + slope[0] * s + up[0] * n,
			py + slope[1] * s + up[1] * n
		];
		const block = [
			corner(-size / 2, 0),
			corner(size / 2, 0),
			corner(size / 2, size),
			corner(-size / 2, size),
			corner(-size / 2, 0)
		].flat();
		const r = base * 0.18;
		const sq = base * 0.05;
		return {
			lines: [
				{ points: [ax, ay, bx, by, cx, cy, ax, ay], fill: true },
				{ points: block, fill: true },
				line(...arcPoints(ax, ay, r, 0, -angle, 20)),
				line(bx - sq, by, bx - sq, by - sq, bx, by - sq)
			],
			dots: [],
			texts: [
				{
					text: 'θ',
					x: ax + r * 1.55 * Math.cos(angle / 2),
					y: ay - r * 1.55 * Math.sin(angle / 2),
					size: 15
				}
			]
		};
	},

	battery: (w, h) => {
		const gap = Math.max(4, w * 0.07);
		return {
			lines: [
				line(-w / 2, 0, -gap, 0),
				line(-gap, -h * 0.45, -gap, h * 0.45),
				rect(gap - 2, -h * 0.25, gap + 2, h * 0.25, true),
				line(gap, 0, w / 2, 0)
			],
			dots: [],
			texts: [
				{ text: '+', x: -gap - 9, y: -h * 0.4, size: 13 },
				{ text: '−', x: gap + 9, y: -h * 0.4, size: 13 }
			]
		};
	},

	resistor: (w, h) => {
		const bw = w * 0.5;
		const bh = Math.min(h * 0.55, bw * 0.45);
		return { ...empty(), lines: [...leads(w / 2, bw), rect(-bw / 2, -bh / 2, bw / 2, bh / 2)] };
	},

	rheostat: (w, h) => {
		const bw = w * 0.5;
		const bh = Math.min(h * 0.5, bw * 0.4);
		const [x0, y0, x1, y1] = [-bw * 0.4, bh * 0.9, bw * 0.4, -bh * 0.9];
		return {
			...empty(),
			lines: [
				...leads(w / 2, bw),
				rect(-bw / 2, -bh / 2, bw / 2, bh / 2),
				line(x0, y0, x1, y1),
				head(x1, y1, x0, y0, 9)
			]
		};
	},

	capacitor: (w, h) => {
		const gap = Math.max(4, w * 0.06);
		return {
			...empty(),
			lines: [
				line(-w / 2, 0, -gap, 0),
				line(gap, 0, w / 2, 0),
				line(-gap, -h * 0.4, -gap, h * 0.4),
				line(gap, -h * 0.4, gap, h * 0.4)
			]
		};
	},

	inductor: (w, h) => {
		const span = w * 0.7;
		const loops = 4;
		const r = Math.min(span / (loops * 2), h * 0.5);
		const lead = (w - r * 2 * loops) / 2;
		const points = [-w / 2, 0, -w / 2 + lead, 0];
		for (let i = 0; i < loops; i++) {
			const cx = -w / 2 + lead + r + i * 2 * r;
			points.push(...arcPoints(cx, 0, r, Math.PI, 2 * Math.PI, 12));
		}
		points.push(w / 2 - lead, 0, w / 2, 0);
		return { ...empty(), lines: [line(...points)] };
	},

	switch: (w, h, value) => {
		const ends = w * 0.3;
		const closed = value >= 0.5;
		// An open lever is raised 30°, short enough to stay in the room.
		const length = Math.min(w * 0.6, h * 0.9);
		const lever = closed
			? [ends, 0]
			: [-ends + length * Math.cos(rad(30)), -length * Math.sin(rad(30))];
		return {
			lines: [
				line(-w / 2, 0, -ends, 0),
				line(ends, 0, w / 2, 0),
				line(-ends, 0, lever[0], lever[1])
			],
			dots: [
				[-ends, 0, 3],
				[ends, 0, 3]
			],
			texts: []
		};
	},

	bulb: (w, h) => {
		const r = Math.min(h * 0.5, w * 0.3);
		const d = r * Math.SQRT1_2;
		return {
			...empty(),
			lines: [circle(0, 0, r), line(-d, -d, d, d), line(-d, d, d, -d), ...leads(w / 2, 2 * r)]
		};
	},

	ammeter: meter('A'),
	voltmeter: meter('V'),

	acSource: (w, h) => {
		const r = Math.min(h * 0.5, w * 0.3);
		const wave = Array.from({ length: 21 }, (_, i) => [
			-r * 0.6 + (r * 1.2 * i) / 20,
			-r * 0.3 * Math.sin((2 * Math.PI * i) / 20)
		]).flat();
		return { ...empty(), lines: [circle(0, 0, r), line(...wave), ...leads(w / 2, 2 * r)] };
	},

	ground: (w, h) => ({
		...empty(),
		lines: [
			line(0, -h / 2, 0, -h * 0.1),
			line(-w / 2, -h * 0.1, w / 2, -h * 0.1),
			line(-w * 0.3, h * 0.2, w * 0.3, h * 0.2),
			line(-w * 0.12, h * 0.5, w * 0.12, h * 0.5)
		]
	}),

	convexLens: (w, h, value) => lens(w, h, value, true),
	concaveLens: (w, h, value) => lens(w, h, value, false),

	planeMirror: (w, h) => {
		const hatches = Array.from({ length: Math.max(2, Math.floor(h / 14)) }, (_, i) => {
			const y = -h / 2 + (h * i) / Math.max(2, Math.floor(h / 14));
			return line(0, y, Math.min(w * 0.25, 12), y + Math.min(w * 0.25, 12));
		});
		return { ...empty(), lines: [line(0, -h / 2, 0, h / 2), ...hatches] };
	},

	concaveMirror: (w, h) => mirror(w, h, true),
	convexMirror: (w, h) => mirror(w, h, false),

	positiveCharge: charge('+'),
	negativeCharge: charge('−'),

	magnet: (w, h) => ({
		lines: [
			rect(-w / 2, -h / 2, w / 2, h / 2),
			line(0, -h / 2, 0, h / 2),
			{
				points: [-w / 2, -h / 2, 0, -h / 2, 0, h / 2, -w / 2, h / 2, -w / 2, -h / 2],
				fill: true
			}
		],
		dots: [],
		texts: [
			{ text: 'N', x: -w / 4, y: 0, size: Math.min(h * 0.55, w * 0.22) },
			{ text: 'S', x: w / 4, y: 0, size: Math.min(h * 0.55, w * 0.22) }
		]
	})
};

/** A thin lens on its axis: arrowheads out for converging, in for diverging, F on both sides. */
function lens(w: number, h: number, value: number, converging: boolean): Drawing {
	const hw = w / 2;
	const hh = h / 2;
	const f = (value / 100) * hw;
	const s = Math.min(10, hh * 0.15);
	const ends: Prim[] = converging
		? [line(-s, -hh + s, 0, -hh, s, -hh + s), line(-s, hh - s, 0, hh, s, hh - s)]
		: [line(-s, -hh, 0, -hh + s, s, -hh), line(-s, hh, 0, hh - s, s, hh)];
	return {
		lines: [line(-hw, 0, hw, 0), line(0, -hh, 0, hh), ...ends],
		dots: [
			[f, 0, 3],
			[-f, 0, 3]
		],
		texts: [
			{ text: 'F', x: f, y: 15, size: 13 },
			{ text: "F'", x: -f, y: 15, size: 13 }
		]
	};
}

/**
 * A spherical mirror seen from the side it reflects on (the right): the arc
 * with hatching behind it, and the principal axis. A concave one curves like
 * "(", its centre of curvature on the reflecting side; a convex one like ")".
 */
function mirror(w: number, h: number, concave: boolean): Drawing {
	const hw = w / 2;
	const hh = h / 2;
	// How far the arc bulges is limited by the width it has.
	const sag = Math.min(hh * 0.38, hw * 0.6);
	const r = (hh * hh + sag * sag) / (2 * sag);
	const reach = Math.asin(Math.min(1, hh / r));
	// Concave: the hatching on the left has room beside the arc; convex: the arc sits at the right.
	const vertex = concave ? -hw + Math.min(12, hw * 0.4) : hw - 2;
	const centre = vertex + (concave ? r : -r);
	const arc = Array.from({ length: 31 }, (_, i) => {
		const a = -reach + (2 * reach * i) / 30;
		return [centre + (concave ? -r : r) * Math.cos(a), r * Math.sin(a)];
	});
	const hatches = arc
		.filter((_, i) => i % 3 === 0)
		.map(([x, y]) =>
			line(x, y, x - Math.min(10, hw * 0.4), Math.min(hh, y + Math.min(10, hw * 0.4)))
		);
	return { lines: [line(-hw, 0, hw, 0), line(...arc.flat()), ...hatches], dots: [], texts: [] };
}

/** Whether a kind's label sits inside the symbol (a block's mass) rather than below it. */
export const LABEL_INSIDE: ReadonlySet<SymbolKind> = new Set(['block']);
/** Kinds drawn to fit the room whatever angle they show (they have no leads to join). */
export const FITTED: ReadonlySet<SymbolKind> = new Set(['pendulum', 'incline', 'pulley']);

export function buildSymbol(kind: SymbolKind, w: number, h: number, value: number): Drawing {
	return BUILDERS[kind](w, h, value);
}
