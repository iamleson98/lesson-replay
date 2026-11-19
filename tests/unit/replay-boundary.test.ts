/**
 * `src/lib/replay` is the code that reads and draws a recorded lesson, kept
 * self-contained so it can live in a repository of its own (the render image is
 * built from it). It may import itself, `svelte`, the sui button and `cn`
 * (`#lib/sui/*`, `#lib/utils.js`) and npm packages: nothing of the app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../src/lib/replay');
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(svelte|ts|css)$/.test(name) ? [path] : [];
	});
}

/** Why an import leaves the folder, or null when it is allowed. */
function violation(file: string, specifier: string): string | null {
	if (specifier.startsWith('.')) {
		const target = normalize(join(dirname(file), specifier));
		return relative(ROOT, target).startsWith('..') ? 'a relative path out of the folder' : null;
	}
	if (specifier === '#lib/utils.js' || specifier.startsWith('#lib/sui/')) return null;
	if (specifier.startsWith('#') || specifier.startsWith('$')) return 'an app alias';
	return null;
}

describe('the replay folder', () => {
	const sources = files(ROOT);

	it('has sources to check', () => {
		expect(sources.length).toBeGreaterThan(50);
	});

	it('imports nothing outside itself', () => {
		const offending: string[] = [];
		for (const file of sources) {
			for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(SPECIFIER)) {
				const why = violation(file, specifier);
				if (why) offending.push(`${relative(ROOT, file)}: ${specifier} (${why})`);
			}
		}
		expect(offending).toEqual([]);
	});

	it('tells an import of the app from one of its own', () => {
		const file = join(ROOT, 'quiz/game.svelte.ts');
		expect(violation(file, './protocol')).toBeNull();
		expect(violation(file, '../i18n/strings.svelte')).toBeNull();
		expect(violation(file, 'svelte/reactivity')).toBeNull();
		expect(violation(file, '#lib/sui/button/index.js')).toBeNull();
		expect(violation(file, '#lib/i18n/index.js')).toBe('an app alias');
		expect(violation(file, '#lib/api/generated/types.gen.js')).toBe('an app alias');
		expect(violation(file, '../../features/quiz/game-socket')).toBe(
			'a relative path out of the folder'
		);
	});
});
