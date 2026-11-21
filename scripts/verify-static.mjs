#!/usr/bin/env node
/**
 * verify-static.mjs: post-build gate for the contract the render worker relies
 * on. A green `vite build` is not enough: the worker serves `build/` as a
 * static site and opens `/render`, so the fallback page that serves it, the
 * client bundle it loads and the font the brand card draws with must be there.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = new URL('../build/', import.meta.url).pathname;
const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

const fallback = join(BUILD, '200.html');
check(existsSync(fallback), 'build/200.html (the fallback that serves /render) is missing');

if (existsSync(fallback)) {
	const html = readFileSync(fallback, 'utf-8');
	check(/<meta name="robots" content="noindex, nofollow"/.test(html), '200.html is indexable');
	check(/_app\/immutable\/entry\/start\.[\w-]+\.js/.test(html), '200.html does not load the app');
}

const app = join(BUILD, '_app', 'immutable');
check(existsSync(app), 'build/_app/immutable (the client bundle) is missing');
if (existsSync(app)) {
	const chunks = readdirSync(join(app, 'nodes'));
	const page = chunks
		.map((name) => readFileSync(join(app, 'nodes', name), 'utf-8'))
		.some((source) => source.includes('startRender') || source.includes('Render'));
	check(chunks.length >= 2 && page, 'the /render page is not in the client bundle');
}

// The page's own font and the board's whole stack (static/fonts/README.md): the render waits for
// every board font, so a missing one fails the render.
for (const font of [
	'inter-5.3.0-latin-var-wght.woff2',
	'inter-5.3.0-vietnamese-var-wght.woff2',
	'inter-4.1-board-var-wght.woff2',
	'noto-sans-2.015-superscripts.woff2',
	'noto-sans-math-3.000-symbols.woff2',
	'noto-sans-symbols-2-2.008-symbols.woff2'
]) {
	check(existsSync(join(BUILD, 'fonts', font)), `build/fonts/${font} is missing`);
}

if (failures.length > 0) {
	console.error(failures.map((message) => `verify-static: ${message}`).join('\n'));
	process.exit(1);
}
console.log('verify-static: build/ serves /render from 200.html');
