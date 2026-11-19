<script lang="ts" module>
	export type TileState = 'idle' | 'picked' | 'dim' | 'correct' | 'wrong';
</script>

<script lang="ts">
	/**
	 * One answer as a big chunky tile: its colour, a SHAPE of its own (never
	 * colour alone) and its number key. A player taps it; on the host's screen
	 * it is not a button and a shaded bar inside it grows with the count of players
	 * who chose it, so the class is seen answering in real time. At the reveal
	 * the right ones glow and the others turn grey.
	 */
	import CheckIcon from '@lucide/svelte/icons/check';
	import TriangleIcon from '@lucide/svelte/icons/triangle';
	import DiamondIcon from '@lucide/svelte/icons/diamond';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import SquareIcon from '@lucide/svelte/icons/square';
	import StarIcon from '@lucide/svelte/icons/star';
	import HexagonIcon from '@lucide/svelte/icons/hexagon';
	import { cn } from '#lib/utils.js';
	import { t } from '../../i18n/strings.svelte';
	import './quiz-motion.css';
	import { optionSize } from '../fit';

	const SHAPES = [TriangleIcon, DiamondIcon, CircleIcon, SquareIcon, StarIcon, HexagonIcon];
	// Six hues that stay apart, each a gentle two-stop gradient; white text on every
	// stop keeps its contrast in both themes.
	const TONES = [
		'bg-linear-to-br from-red-600 to-rose-700',
		'bg-linear-to-br from-blue-600 to-indigo-700',
		'bg-linear-to-br from-orange-700 to-amber-700',
		'bg-linear-to-br from-emerald-700 to-green-700',
		'bg-linear-to-br from-violet-600 to-purple-700',
		'bg-linear-to-br from-cyan-700 to-sky-700'
	];

	let {
		index,
		text,
		state = 'idle',
		pick,
		disabled = false,
		count,
		fraction = 0,
		masked = false
	}: {
		index: number;
		text: string;
		state?: TileState;
		/** Present on a player's screen: the tile is a button. */
		pick?: () => void;
		disabled?: boolean;
		/** The host's live count of players on this option. */
		count?: number;
		/** That count as a share of the biggest, for the bar. */
		fraction?: number;
		/** The teacher hides the live results: the count's place stays, with a dot in it, and the bar stays empty. */
		masked?: boolean;
	} = $props();

	const Shape = $derived(SHAPES[index % SHAPES.length]);
	const picked = $derived(state === 'picked');
	// A tile's box never changes: its states are a colour, a grey, a ring drawn
	// inside it and a check in a slot kept for it, nothing that
	// scales, moves or resizes it.
	const classes = $derived(
		cn(
			'relative flex min-h-14 w-full min-w-0 items-center gap-2 overflow-hidden rounded-2xl p-2 text-left text-white before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-b before:from-white/20 before:via-white/5 before:to-transparent sm:min-h-20 sm:gap-3 sm:p-3 [@media(min-height:700px)]:min-h-24 [@media(max-height:700px)]:min-h-12 [@media(max-height:700px)]:gap-1.5 [@media(max-height:700px)]:p-1.5 [@media(max-height:460px)]:min-h-11 [@media(max-height:460px)]:gap-1 [@media(max-height:460px)]:p-1',
			'transition-[filter] duration-200 motion-reduce:transition-none',
			state === 'idle' && 'inset-ring-1 inset-ring-white/25',
			TONES[index % TONES.length],
			pick && !disabled && 'cursor-pointer hover:brightness-110 active:brightness-95',
			pick &&
				'focus-visible:inset-ring-foreground focus-visible:inset-ring-4 focus-visible:outline-none',
			picked && 'inset-ring-4 inset-ring-white',
			// grey keeps the white text readable (a faded tile did not)
			(state === 'dim' || state === 'wrong') && 'grayscale',
			state === 'correct' && 'inset-ring-4 inset-ring-white',
			pick && disabled && state === 'idle' && 'cursor-not-allowed'
		)
	);
</script>

{#snippet content()}
	{#if count !== undefined}
		<span
			class="absolute inset-0 origin-left bg-black/20 transition-transform duration-500 ease-out motion-reduce:transition-none"
			style:transform={`scaleX(${masked ? 0 : fraction})`}
			aria-hidden="true"
		></span>
	{/if}
	{#if state === 'correct'}
		<span
			class="qz-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/35 opacity-0"
			aria-hidden="true"
		></span>
	{/if}
	<span
		class="relative flex shrink-0 flex-col items-center gap-0.5 rounded-xl bg-white/15 px-1.5 py-1 [@media(max-height:700px)]:py-0.5"
		aria-hidden="true"
	>
		<Shape
			class="size-6 fill-white/90 sm:size-7 [@media(max-height:700px)]:size-5"
			strokeWidth={2.5}
		/>
		<span class="text-[11px] leading-none font-bold text-white/90">{index + 1}</span>
	</span>
	<span
		class={cn(
			'relative min-w-0 flex-1 leading-snug font-bold [overflow-wrap:break-word] hyphens-auto',
			optionSize(text.length)
		)}>{text}</span
	>
	{#if count !== undefined}
		<span
			class="relative min-w-[3ch] shrink-0 text-right text-xl font-extrabold tabular-nums sm:text-3xl"
			>{masked ? '·' : count}</span
		>
	{/if}
	{#if state === 'correct'}
		<span class="sr-only">{t('quiz.option.correct')}</span>
	{/if}
	<span
		class={cn(
			'relative flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-black [@media(max-height:700px)]:size-6',
			state === 'correct' && 'qz-pop bg-green-500 text-white ring-2 ring-white',
			!(picked || state === 'correct') && 'opacity-0'
		)}
		aria-hidden="true"
	>
		<CheckIcon class="size-4" strokeWidth={3.5} />
	</span>
{/snippet}

{#if pick}
	<button
		type="button"
		aria-pressed={picked}
		aria-keyshortcuts={String(index + 1)}
		{disabled}
		onclick={pick}
		class={classes}
	>
		{@render content()}
	</button>
{:else}
	<div class={classes}>
		{@render content()}
	</div>
{/if}
