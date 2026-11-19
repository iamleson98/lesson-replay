/**
 * `vendor/sui` is a git submodule: the code here imports sui's button and `cn`
 * from it, so it has to be the component library and not a copy, and the commit
 * this repository pins has to be recorded (the superproject's index holds it).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');

describe('vendor/sui', () => {
	it('is declared as a submodule of the sui repository', () => {
		const modules = readFileSync(join(ROOT, '.gitmodules'), 'utf-8');
		expect(modules).toContain('path = vendor/sui');
		expect(modules).toContain('url = https://github.com/iamleson98/sui.git');
	});

	it('is a gitlink with a recorded commit', () => {
		const entry = execFileSync('git', ['ls-files', '--stage', 'vendor/sui'], {
			cwd: ROOT,
			encoding: 'utf-8'
		});
		expect(entry).toMatch(/^160000 [0-9a-f]{40} 0\tvendor\/sui\n$/);
	});

	it('is checked out, with what the replay imports', () => {
		expect(existsSync(join(ROOT, 'vendor/sui/src/lib/sui/button/index.ts'))).toBe(true);
		expect(existsSync(join(ROOT, 'vendor/sui/src/lib/utils.ts'))).toBe(true);
	});
});
