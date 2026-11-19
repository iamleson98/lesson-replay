<script lang="ts">
	/**
	 * One row of the standings: it sits at its rank's place and slides (a
	 * transform) when the rank changes, its score counts to the new total, and
	 * a mover is lit for a moment. A row starts where it stood before (`from`),
	 * so on first showing it slides into place. With reduced motion none of that
	 * happens: the row is where it belongs at once and nothing waits on a clock.
	 */
	import { onMount } from 'svelte';
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import AvatarDisc from './avatar-disc.svelte';
	import CountUp from './count-up.svelte';

	let {
		index,
		startIndex,
		name,
		score,
		startScore,
		row
	}: {
		index: number;
		startIndex: number;
		name: string;
		score: number;
		startScore: number;
		row: number;
	} = $props();

	const reducedMotion = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const still = reducedMotion();
	let ready = $state(still);
	let lit = $state(false);
	let arrow = $state<'up' | 'down' | null>(null);
	// svelte-ignore state_referenced_locally
	let last = startIndex;
	let timer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		if (still) return;
		// Two frames, so the row is painted where it stood before it moves.
		let second = 0;
		const first = requestAnimationFrame(
			() => (second = requestAnimationFrame(() => (ready = true)))
		);
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
			clearTimeout(timer);
		};
	});

	$effect(() => {
		const now = index;
		if (!ready || now === last) return;
		const up = now < last;
		last = now;
		if (still) return;
		arrow = up ? 'up' : 'down';
		lit = true;
		clearTimeout(timer);
		timer = setTimeout(() => ((lit = false), (arrow = null)), 1400);
	});

	const shownIndex = $derived(ready ? index : startIndex);
	const moved = $derived(startIndex !== index);
</script>

<li
	class={cn(
		'bg-card absolute inset-x-0 top-0 flex items-center gap-2 rounded-xl border px-2 transition-transform duration-700 ease-[cubic-bezier(0.34,1.2,0.64,1)] motion-reduce:transition-none sm:gap-3 sm:px-3',
		(lit || (moved && !ready)) && 'border-primary',
		lit && 'qz-mover'
	)}
	style:height={`${row - 8}px`}
	style:transform={`translateY(${shownIndex * row}px)`}
>
	<span
		class="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold tabular-nums"
		>{index + 1}</span
	>
	<AvatarDisc {name} size="sm" />
	<span class="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
	{#if arrow}
		<span
			class={arrow === 'up'
				? 'text-green-800 dark:text-green-400'
				: 'text-red-700 dark:text-red-400'}
		>
			{#if arrow === 'up'}<ArrowUpIcon class="size-4" strokeWidth={3} />{:else}<ArrowDownIcon
					class="size-4"
					strokeWidth={3}
				/>{/if}
			<span class="sr-only">{t(arrow === 'up' ? 'quiz.moved.up' : 'quiz.moved.down')}</span>
		</span>
	{/if}
	<span class="w-16 shrink-0 text-right text-base font-extrabold">
		<CountUp value={score} from={startScore} />
	</span>
</li>
