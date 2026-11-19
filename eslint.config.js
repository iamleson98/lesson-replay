import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Build output, kit internals and the vendored sui submodule (sui enforces
	// its own quality).
	{ ignores: ['build/', 'coverage/', '.svelte-kit/', 'node_modules/', 'vendor/**'] },
	js.configs.recommended,
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
				svelteFeatures: { experimentalRunes: true, experimentalGenerics: false }
			}
		}
	},
	// Same rules as lms-web, whose code this is.
	{
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'svelte/no-unused-svelte-ignore': 'error',
			'svelte/require-event-prefix': 'error',
			'svelte/no-top-level-browser-globals': 'error',
			'svelte/prefer-derived-over-derived-by': 'error',
			'no-console': ['warn', { allow: ['warn', 'error'] }]
		}
	},
	{ files: ['scripts/**', 'vite.config.ts', 'tests/**'], rules: { 'no-console': 'off' } },
	prettier
);
