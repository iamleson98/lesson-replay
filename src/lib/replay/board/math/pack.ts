/**
 * The maths pack's element half: graphs and solids. Registering them with the
 * board makes it read, measure, hit and draw them (see packs.ts). Nothing else
 * imports this module statically, so it is a chunk of its own.
 */

import { registerKind, type GraphElement, type SolidElement } from '../elements';
import { decodeGraph, graphBox } from './graph';
import { boxBounds } from './canvas';
import { drawGraph, graphHit } from './graph-draw';
import { decodeSolid } from './solids';
import { drawSolid, solidHit } from './solid-draw';

export function registerMath(): void {
	registerKind<GraphElement>('graph', {
		decode: decodeGraph,
		bounds: (el) => boxBounds(graphBox(el)),
		hit: graphHit,
		draw: drawGraph
	});
	registerKind<SolidElement>('solid', {
		decode: (d, common) => decodeSolid(d, common),
		bounds: (el) => boxBounds(graphBox(el)),
		hit: solidHit,
		draw: drawSolid
	});
}
