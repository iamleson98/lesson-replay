import { describe, expect, it } from 'vitest';
import { optionSize, questionSize, tileColumns } from '#lib/replay/quiz/fit.js';

describe('tileColumns', () => {
	it('keeps two columns while the longest option fits in three lines of a half-width tile', () => {
		expect(tileColumns(0, 500)).toBe(2); // not measured yet
		expect(tileColumns(900, 88)).toBe(2); // a laptop
		expect(tileColumns(278, 12)).toBe(2); // a 320 px phone, short options
		expect(tileColumns(278, 5)).toBe(2);
	});

	it('goes to one column when a half-width tile would cut the longest option into more than three lines', () => {
		expect(tileColumns(278, 60)).toBe(1); // a 320 px phone, a 60-character option
		expect(tileColumns(348, 60)).toBe(1); // 390 px
		expect(tileColumns(388, 120)).toBe(1);
	});
});

describe('text sizes', () => {
	it('never go below 14 px (text-sm), however long the text is', () => {
		for (const length of [10, 80, 150, 300, 5000]) {
			expect(questionSize(length)).not.toMatch(/text-xs/);
			expect(optionSize(length)).not.toMatch(/text-xs/);
		}
		expect(questionSize(150)).toContain('text-base');
		expect(questionSize(300)).toContain('text-sm');
	});
});
