import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Same harness as lms-web: Svelte compiled with runes, the browser build of
// svelte (otherwise $state and mount() resolve to the SSR runtime), jsdom.
export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				runes: true,
				dev: true
			}
		})
	],
	resolve: {
		conditions: ['browser'],
		dedupe: ['@lucide/svelte', 'bits-ui', 'cn', 'tailwind-variants']
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		include: ['tests/unit/**/*.test.ts'],
		css: false,
		mockReset: true
	}
});
