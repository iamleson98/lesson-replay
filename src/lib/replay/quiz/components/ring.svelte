<script lang="ts">
	/**
	 * A ring that fills or drains (the countdown, "answered N of M") with
	 * something written inside it. The stroke is a CSS transition, so two
	 * updates a second look continuous.
	 */
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	let {
		fraction,
		tone = 'text-primary',
		pulse = false,
		label,
		class: className = '',
		children
	}: {
		fraction: number;
		/** A text colour class: the ring draws in `currentColor`. */
		tone?: string;
		pulse?: boolean;
		/** Spoken in place of the drawing. */
		label: string;
		class?: string;
		children?: Snippet;
	} = $props();

	const R = 44;
	const C = 2 * Math.PI * R;
</script>

<div
	class={cn('relative size-16 shrink-0 sm:size-20', pulse && 'qz-ring-pulse', className)}
	role="img"
	aria-label={label}
>
	<svg viewBox="0 0 100 100" class="size-full -rotate-90" aria-hidden="true">
		<circle cx="50" cy="50" r={R} fill="none" stroke-width="9" class="stroke-muted" />
		<circle
			cx="50"
			cy="50"
			r={R}
			fill="none"
			stroke-width="9"
			stroke-linecap="round"
			stroke="currentColor"
			class={cn(
				'transition-[stroke-dashoffset,color] duration-300 ease-linear motion-reduce:transition-none',
				tone
			)}
			stroke-dasharray={C}
			stroke-dashoffset={C * (1 - Math.max(0, Math.min(1, fraction)))}
		/>
	</svg>
	<span
		class="absolute inset-0 flex items-center justify-center text-base font-extrabold tabular-nums sm:text-xl [@media(max-height:460px)]:text-sm"
		aria-hidden="true"
	>
		{@render children?.()}
	</span>
</div>
