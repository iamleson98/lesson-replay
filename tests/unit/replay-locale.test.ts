/**
 * The replay speaks with its own dictionary (`src/lib/replay/i18n`): both
 * languages carry the same keys and placeholders, every key its code uses is
 * there, and each of its languages has a dictionary.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '#lib/replay/i18n/en.js';
import { REPLAY_DICTIONARIES, REPLAY_LOCALES } from '#lib/replay/i18n/strings.svelte.js';
import { vi } from '#lib/replay/i18n/vi.js';
import { CHARACTER_KEYS } from '#lib/replay/quiz/quest/characters.js';

const ROOT = join(import.meta.dirname, '../../src/lib/replay');
const placeholders = (text: string) =>
	[...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path);
		return /\.(svelte|ts)$/.test(name) ? [path] : [];
	});
}

describe('the replay dictionaries', () => {
	it('have the same keys in both languages', () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
	});

	it('keep the same {placeholders} on every key', () => {
		const differing = Object.keys(vi).filter(
			(key) => placeholders(vi[key]).join() !== placeholders(en[key] ?? '').join()
		);
		expect(differing).toEqual([]);
	});

	it('have no empty string', () => {
		for (const dictionary of [en, vi]) {
			expect(Object.keys(dictionary).filter((key) => dictionary[key].trim() === '')).toEqual(
				[]
			);
		}
	});

	it('cover every language the replay speaks', () => {
		expect(REPLAY_LOCALES).toEqual(['vi', 'en']);
		expect(Object.keys(REPLAY_DICTIONARIES).sort()).toEqual([...REPLAY_LOCALES].sort());
	});

	it('hold every key the replay code uses', () => {
		const pattern = /\bt\(\s*['"`]([a-zA-Z][\w.-]*)['"`]/g;
		const missing: string[] = [];
		for (const file of sources(ROOT)) {
			for (const [, key] of readFileSync(file, 'utf-8').matchAll(pattern)) {
				if (!(key in vi) || !(key in en)) missing.push(`${key} (${relative(ROOT, file)})`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('hold the keys the code picks by name', () => {
		// The Quest characters' names, and the rank arrow's label (a ternary the scan cannot read).
		const keys = [...CHARACTER_KEYS, 'quiz.moved.up', 'quiz.moved.down'];
		expect(keys.filter((key) => !(key in vi) || !(key in en))).toEqual([]);
	});
});
