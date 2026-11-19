/**
 * The physics pack's element half: symbols. Registering them with the board
 * makes it read, measure, hit and draw them (see packs.ts). Nothing else
 * imports this module statically, so it is a chunk of its own.
 */

import { registerKind, type SymbolElement } from '../elements';
import { boxBounds } from '../math/canvas';
import { drawSymbol, symbolBox, symbolHit } from './symbol-draw';
import { decodeSymbol } from './symbols';

export function registerPhysics(): void {
	registerKind<SymbolElement>('symbol', {
		decode: (d, common) => decodeSymbol(d, common),
		bounds: (el) => boxBounds(symbolBox(el)),
		hit: symbolHit,
		draw: drawSymbol
	});
}
