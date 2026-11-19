/**
 * A 3D solid kept as its parameters (a pyramid with a square base of side 4
 * and height 5), never as drawn lines: a few hundred bytes to store and send,
 * redrawn exactly at any size.
 *
 * One view, the textbook one: cavalier (oblique) projection, the front face
 * true, depth drawn at 45° and halved, hidden edges dashed, vertices lettered
 * S.ABCD or ABC.A'B'C'. Hidden edges are exact for convex solids: an edge is
 * hidden when every face that owns it faces away from the viewer. Round solids
 * draw their outlines and the back half of their base circle dashed.
 */

import type { Common } from '../elements';

export const SOLID_SHAPES = [
	'cube',
	'cuboid',
	'prism',
	'pyramid',
	'cylinder',
	'cone',
	'sphere'
] as const;
export type SolidShape = (typeof SOLID_SHAPES)[number];

export const MAX_POINTS = 8;
export const MAX_SEGMENTS = 12;
export const MAX_NAME = 3;
export const MIN_SIDES = 3;
export const MAX_SIDES = 12;
const MAX_DIM = 1e6;

/**
 * A point the teacher adds to a polyhedron: on the segment between two
 * points that exist (vertices, or points added before it) at `t` (0 to 1; 0.5
 * is the midpoint), or at the centre of the base (or of the top of a prism).
 */
export type SolidPoint = { name: string } & (
	{ from: string; to: string; t: number } | { centre: 'base' | 'top' }
);

/** A segment between two points; `dashed` null lets the drawing decide. */
export type SolidSegment = { from: string; to: string; dashed: boolean | null };

export type SolidElement = Common & {
	type: 'solid';
	shape: SolidShape;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	/** Edge or radius, depth and height; what a shape does not use is ignored. */
	a: number;
	b: number;
	h: number;
	/** Sides of a prism's or pyramid's base. */
	n: number;
	/** Letters on the vertices. */
	labels: boolean;
	/** Hidden edges drawn dashed (otherwise left out). */
	hidden: boolean;
	/** The faces lightly filled. */
	tint: boolean;
	/** Points added on a polyhedron (the heights, midpoints and sections a lesson draws). */
	points: SolidPoint[];
	/** Segments between its vertices and those points. */
	segments: SolidSegment[];
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown, fallback: number) =>
	finite(v) && v > 0 ? Math.min(v, MAX_DIM) : fallback;

function decodePoints(raw: unknown): SolidPoint[] {
	if (!Array.isArray(raw)) return [];
	const out: SolidPoint[] = [];
	for (const p of raw.slice(0, MAX_POINTS)) {
		if (!p || typeof p !== 'object') continue;
		const d = p as Record<string, unknown>;
		const name = typeof d.name === 'string' ? d.name.trim().slice(0, MAX_NAME) : '';
		if (!name || out.some((q) => q.name === name)) continue;
		if (d.centre === 'base' || d.centre === 'top') {
			out.push({ name, centre: d.centre });
		} else if (typeof d.from === 'string' && typeof d.to === 'string' && finite(d.t)) {
			out.push({ name, from: d.from, to: d.to, t: Math.min(1, Math.max(0, d.t)) });
		}
	}
	return out;
}

function decodeSegments(raw: unknown): SolidSegment[] {
	if (!Array.isArray(raw)) return [];
	const out: SolidSegment[] = [];
	for (const s of raw.slice(0, MAX_SEGMENTS)) {
		if (!s || typeof s !== 'object') continue;
		const d = s as Record<string, unknown>;
		if (typeof d.from !== 'string' || typeof d.to !== 'string' || d.from === d.to) continue;
		out.push({
			from: d.from,
			to: d.to,
			dashed: typeof d.dashed === 'boolean' ? d.dashed : null
		});
	}
	return out;
}

export function decodeSolid(d: Record<string, unknown>, common: Common): SolidElement | null {
	if (![d.x1, d.y1, d.x2, d.y2].every(finite)) return null;
	if (!(SOLID_SHAPES as readonly unknown[]).includes(d.shape)) return null;
	return {
		...common,
		type: 'solid',
		shape: d.shape as SolidShape,
		x1: d.x1 as number,
		y1: d.y1 as number,
		x2: d.x2 as number,
		y2: d.y2 as number,
		a: positive(d.a, 4),
		b: positive(d.b, 4),
		h: positive(d.h, 4),
		n: finite(d.n) ? Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(d.n))) : 4,
		labels: d.labels !== false,
		hidden: d.hidden !== false,
		tint: d.tint === true,
		points: decodePoints(d.points),
		segments: decodeSegments(d.segments)
	};
}

type Vec = [number, number, number];

/** A convex polyhedron: lettered vertices and faces (vertex index cycles). */
type Mesh = { vertices: Vec[]; names: string[]; faces: number[][] };

const LETTERS = 'ABCDEFGHIJKL';

function prismMesh(n: number, edge: number, h: number): Mesh {
	const radius = edge / (2 * Math.sin(Math.PI / n));
	const base: Vec[] = [];
	for (let i = 0; i < n; i++) {
		// The first edge faces the viewer: A front left, B front right, then round.
		const t = -Math.PI / 2 - Math.PI / n + (2 * Math.PI * i) / n;
		base.push([radius * Math.cos(t), radius * Math.sin(t), 0]);
	}
	const vertices = [...base, ...base.map(([x, y]): Vec => [x, y, h])];
	const faces = [
		Array.from({ length: n }, (_, i) => i),
		Array.from({ length: n }, (_, i) => n + i)
	];
	for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
	const names = [...LETTERS.slice(0, n)];
	return { vertices, names: [...names, ...names.map((c) => `${c}'`)], faces };
}

function pyramidMesh(n: number, edge: number, h: number): Mesh {
	const base = prismMesh(n, edge, 0).vertices.slice(0, n);
	const faces = [Array.from({ length: n }, (_, i) => i)];
	for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n]);
	return { vertices: [...base, [0, 0, h]], names: [...LETTERS.slice(0, n), 'S'], faces };
}

function cuboidMesh(a: number, b: number, h: number): Mesh {
	return {
		vertices: [
			[0, 0, 0],
			[a, 0, 0],
			[a, b, 0],
			[0, b, 0],
			[0, 0, h],
			[a, 0, h],
			[a, b, h],
			[0, b, h]
		],
		names: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"],
		faces: [
			[0, 1, 2, 3],
			[4, 5, 6, 7],
			[0, 1, 5, 4],
			[1, 2, 6, 5],
			[2, 3, 7, 6],
			[3, 0, 4, 7]
		]
	};
}

function meshOf(el: SolidElement): Mesh | null {
	switch (el.shape) {
		case 'cube':
			return cuboidMesh(el.a, el.a, el.a);
		case 'cuboid':
			return cuboidMesh(el.a, el.b, el.h);
		case 'prism':
			return prismMesh(el.n, el.a, el.h);
		case 'pyramid':
			return pyramidMesh(el.n, el.a, el.h);
		default:
			return null;
	}
}

// ─── The view ──────────────────────────────────────────────────────────

/** Depth drawn at 45°, halved. */
const K = 0.5;
const DX = K * Math.cos(Math.PI / 4);
const DZ = K * Math.sin(Math.PI / 4);
/** From the viewer into the scene: a face is seen when its outward normal opposes this. */
const LOOK: Vec = [-DX, 1, -DZ];

/** x to the right, z up, depth up and to the right (the plane's y is up). */
const project = ([x, y, z]: Vec): [number, number] => [x + DX * y, z + DZ * y];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type Primitive = {
	/** Flat [x, y, x, y…] in the plane (y up). */
	points: number[];
	hidden: boolean;
};

export type Flat = {
	lines: Primitive[];
	/** Visible faces and outlines to tint, as flat polygons. */
	fills: number[][];
	labels: { text: string; x: number; y: number }[];
	/** Points to mark (a centre). */
	dots: [number, number][];
};

const mean = (v: Vec[], ids: number[]): Vec => {
	const sum = ids.reduce<Vec>(
		(s, i) => [s[0] + v[i][0], s[1] + v[i][1], s[2] + v[i][2]],
		[0, 0, 0]
	);
	return [sum[0] / ids.length, sum[1] / ids.length, sum[2] / ids.length];
};

/** Which faces of a convex polyhedron the viewer sees. */
function facingFaces(mesh: Mesh): boolean[] {
	const v = mesh.vertices;
	const centre = mean(
		v,
		v.map((_, i) => i)
	);
	return mesh.faces.map((face) => {
		let n = cross(sub(v[face[1]], v[face[0]]), sub(v[face[2]], v[face[0]]));
		// Outward: away from the middle of the solid (it is convex).
		if (dot(n, sub(mean(v, face), centre)) < 0) n = [-n[0], -n[1], -n[2]];
		return dot(n, LOOK) < 0;
	});
}

/**
 * The points and segments the teacher added. A segment is seen when it lies in
 * a face the viewer sees (both ends belong to it); one that crosses the inside
 * of the solid, or lies in a face turned away, is dashed.
 */
function construct(
	el: SolidElement,
	mesh: Mesh,
	facing: boolean[]
): Pick<Flat, 'lines' | 'labels' | 'dots'> {
	const where = new Map<string, Vec>();
	const faces = new Map<string, Set<number>>();
	mesh.names.forEach((name, i) => {
		where.set(name, mesh.vertices[i]);
		faces.set(name, new Set(mesh.faces.flatMap((f, fi) => (f.includes(i) ? [fi] : []))));
	});
	const labels: Flat['labels'] = [];
	const dots: Flat['dots'] = [];
	for (const p of el.points) {
		if (where.has(p.name)) continue;
		let at: Vec;
		let on: Set<number>;
		if ('centre' in p) {
			// A prism's or cuboid's top is face 1; a pyramid has only its base.
			const face = p.centre === 'base' ? 0 : 1;
			if (p.centre === 'top' && el.shape === 'pyramid') continue;
			at = mean(mesh.vertices, mesh.faces[face]);
			on = new Set([face]);
		} else {
			const a = where.get(p.from);
			const b = where.get(p.to);
			if (!a || !b) continue;
			at = [
				a[0] + (b[0] - a[0]) * p.t,
				a[1] + (b[1] - a[1]) * p.t,
				a[2] + (b[2] - a[2]) * p.t
			];
			on = new Set([...faces.get(p.from)!].filter((f) => faces.get(p.to)!.has(f)));
		}
		where.set(p.name, at);
		faces.set(p.name, on);
		const [x, y] = project(at);
		labels.push({ text: p.name, x, y });
		dots.push([x, y]);
	}
	const lines: Primitive[] = [];
	for (const s of el.segments) {
		const a = where.get(s.from);
		const b = where.get(s.to);
		if (!a || !b) continue;
		const shared = [...faces.get(s.from)!].filter((f) => faces.get(s.to)!.has(f));
		const hidden = s.dashed ?? !shared.some((f) => facing[f]);
		lines.push({ points: [...project(a), ...project(b)], hidden });
	}
	return { lines, labels, dots };
}

/** A polyhedron: its edges (hidden ones flagged) and the faces the viewer sees. */
function flattenMesh(el: SolidElement, mesh: Mesh, withHidden: boolean): Flat {
	const v = mesh.vertices;
	const facing = facingFaces(mesh);
	const owners = new Map<string, number[]>();
	mesh.faces.forEach((f, fi) => {
		f.forEach((a, k) => {
			const b = f[(k + 1) % f.length];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			owners.set(key, [...(owners.get(key) ?? []), fi]);
		});
	});
	const lines: Primitive[] = [];
	for (const [key, faces] of owners) {
		const [a, b] = key.split('-').map(Number);
		const hidden = !faces.some((fi) => facing[fi]);
		if (hidden && !withHidden) continue;
		lines.push({ points: [...project(v[a]), ...project(v[b])], hidden });
	}
	const added = construct(el, mesh, facing);
	return {
		lines: [...lines, ...added.lines],
		fills: mesh.faces.filter((_, i) => facing[i]).map((f) => f.flatMap((i) => project(v[i]))),
		labels: [
			...mesh.names.map((text, i) => {
				const [x, y] = project(v[i]);
				return { text, x, y };
			}),
			...added.labels
		],
		dots: added.dots
	};
}

const CIRCLE_STEPS = 96;

/** A horizontal circle at height z: its points, and which of them face the viewer. */
function circle(r: number, z: number) {
	return Array.from({ length: CIRCLE_STEPS }, (_, i) => {
		const t = (2 * Math.PI * i) / CIRCLE_STEPS;
		return {
			xy: project([r * Math.cos(t), r * Math.sin(t), z]),
			// The side of a round solid is seen where its outward normal opposes the look.
			front: dot([Math.cos(t), Math.sin(t), 0], LOOK) < 0
		};
	});
}

/** The circle split into its visible and hidden arcs (each a run of points). */
function arcs(points: ReturnType<typeof circle>, whole: boolean): Primitive[] {
	const out: Primitive[] = [];
	const n = points.length;
	// Start where the visibility changes so no arc wraps around the start.
	let start = points.findIndex((p, i) => p.front !== points[(i + n - 1) % n].front);
	if (start < 0) start = 0;
	let run: number[] = [];
	let hidden = !(whole || points[start].front);
	for (let k = 0; k <= n; k++) {
		const p = points[(start + k) % n];
		const h = !(whole || p.front);
		if (k > 0 && h !== hidden) {
			out.push({ points: run, hidden });
			run = run.slice(-2);
			hidden = h;
		}
		run.push(...p.xy);
	}
	out.push({ points: run, hidden });
	return out.filter((a) => a.points.length >= 4);
}

const SPHERE_SQUASH = 0.35;

function flattenSphere(r: number, withHidden: boolean): Flat {
	const outline: number[] = [];
	const near: number[] = [];
	const far: number[] = [];
	for (let i = 0; i <= CIRCLE_STEPS; i++) {
		const t = (2 * Math.PI * i) / CIRCLE_STEPS;
		outline.push(r * Math.cos(t), r * Math.sin(t));
		// The equator seen from above: the near half is the lower one.
		const at = [r * Math.cos(t), r * SPHERE_SQUASH * Math.sin(t)];
		(t <= Math.PI ? far : near).push(...at);
	}
	far.push(-r, 0);
	near.unshift(r, 0);
	const lines: Primitive[] = [
		{ points: outline, hidden: false },
		{ points: near, hidden: false },
		{ points: far, hidden: true },
		{ points: [0, 0, r, 0], hidden: true }
	];
	return {
		lines: withHidden ? lines : lines.filter((l) => !l.hidden),
		fills: [outline],
		labels: [{ text: 'O', x: 0, y: 0 }],
		dots: [[0, 0]]
	};
}

function flattenRound(el: SolidElement, withHidden: boolean): Flat {
	const r = el.a;
	const bottom = circle(r, 0);
	const apex = project([0, 0, el.h]);
	const centreLow = project([0, 0, 0]);
	const centreHigh = project([0, 0, el.h]);
	const lines: Primitive[] = [...arcs(bottom, false)];
	let minI = 0;
	let maxI = 0;
	bottom.forEach((p, i) => {
		if (p.xy[0] < bottom[minI].xy[0]) minI = i;
		if (p.xy[0] > bottom[maxI].xy[0]) maxI = i;
	});
	const fills: number[][] = [];
	const labels: Flat['labels'] = [{ text: 'O', x: centreLow[0], y: centreLow[1] }];
	const dots: Flat['dots'] = [centreLow];

	if (el.shape === 'cylinder') {
		const top = circle(r, el.h);
		// The top is seen from above: all of its circle is drawn.
		lines.push(...arcs(top, true));
		lines.push({ points: [...top[minI].xy, ...bottom[minI].xy], hidden: false });
		lines.push({ points: [...top[maxI].xy, ...bottom[maxI].xy], hidden: false });
		lines.push({ points: [...centreLow, ...centreHigh], hidden: true });
		fills.push(top.flatMap((p) => p.xy));
		labels.push({ text: "O'", x: centreHigh[0], y: centreHigh[1] });
		dots.push(centreHigh);
	} else {
		// Tangents from the apex to the base: the extreme directions as seen from it.
		const rel = (i: number) => {
			const a =
				Math.atan2(bottom[i].xy[1] - apex[1], bottom[i].xy[0] - apex[0]) + Math.PI / 2;
			return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;
		};
		let lo = 0;
		let hi = 0;
		bottom.forEach((_, i) => {
			if (rel(i) < rel(lo)) lo = i;
			if (rel(i) > rel(hi)) hi = i;
		});
		lines.push({ points: [...apex, ...bottom[lo].xy], hidden: false });
		lines.push({ points: [...apex, ...bottom[hi].xy], hidden: false });
		lines.push({ points: [...apex, ...centreLow], hidden: true });
		fills.push([...apex, ...bottom[lo].xy, ...bottom.flatMap((p) => p.xy), ...bottom[hi].xy]);
		labels.push({ text: 'S', x: apex[0], y: apex[1] });
	}
	return { lines: withHidden ? lines : lines.filter((l) => !l.hidden), fills, labels, dots };
}

/** The solid as flat drawing primitives in the plane (y up, units of its dimensions). */
export function flattenSolid(el: SolidElement): Flat {
	const mesh = meshOf(el);
	if (mesh) return flattenMesh(el, mesh, el.hidden);
	return el.shape === 'sphere' ? flattenSphere(el.a, el.hidden) : flattenRound(el, el.hidden);
}

/** The box around everything the solid draws (plane units). */
export function flatBounds(flat: Flat): [number, number, number, number] {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const l of flat.lines) {
		for (let i = 0; i < l.points.length; i += 2) {
			minX = Math.min(minX, l.points[i]);
			maxX = Math.max(maxX, l.points[i]);
			minY = Math.min(minY, l.points[i + 1]);
			maxY = Math.max(maxY, l.points[i + 1]);
		}
	}
	return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : [0, 0, 1, 1];
}

/** The names a segment or a point can start from: the vertices and the points added so far. */
export function solidNames(el: SolidElement): string[] {
	const mesh = meshOf(el);
	if (!mesh) return [];
	const names = [...mesh.names];
	for (const p of el.points) if (!names.includes(p.name)) names.push(p.name);
	return names;
}
