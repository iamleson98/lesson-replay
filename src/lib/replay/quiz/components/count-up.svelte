<script lang="ts">
	/**
	 * A number that counts to its value from wherever it is shown (a score
	 * earned, a total that grows live). Text only: tabular figures keep the
	 * width still. Without motion it just shows the value.
	 */
	let { value, from }: { value: number; from?: number } = $props();

	const MS = 800;
	// svelte-ignore state_referenced_locally
	let shown = $state(from ?? 0);
	$effect(() => {
		const target = value;
		if (
			typeof matchMedia === 'function' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			shown = target;
			return;
		}
		const start = shown;
		if (start === target) return;
		const t0 = performance.now();
		let frame = 0;
		const step = (t: number) => {
			const p = Math.min(1, (t - t0) / MS);
			shown = Math.round(start + (target - start) * (1 - (1 - p) ** 3));
			if (p < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	});
</script>

<span class="tabular-nums">{shown}</span>
