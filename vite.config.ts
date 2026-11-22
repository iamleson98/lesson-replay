import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

// lesson-replay is a source library: no page and no build. SvelteKit stays for
// `svelte-kit sync` (the tsconfig of `check`), and the plugins for the parity
// bundle of streamer-rs, which builds with this folder's Vite.
//
// sui lives in vendor/sui and is consumed as SOURCE: the `imports` of
// package.json send #lib/sui, #lib/components/ui, #lib/hooks and #lib/utils.js
// there, for vite, vitest and TypeScript alike. Its imports of shared packages
// must load this app's copy (two copies of a stateful package break silently).
export default defineConfig({
	resolve: {
		dedupe: ['@lucide/svelte', 'bits-ui', 'cn', 'tailwind-variants']
	},
	// Pin the TS transform's tsconfig to THIS app's config: without it, rolldown
	// finds vendor/sui/tsconfig.json, whose `extends` target only exists after
	// sui's own `svelte-kit sync`.
	tsconfig: './tsconfig.json',
	optimizeDeps: {
		rolldownOptions: { tsconfig: path.resolve('./tsconfig.json') }
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries.
				// Can be removed in svelte 6. Same as sui and lms-web.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	]
});
