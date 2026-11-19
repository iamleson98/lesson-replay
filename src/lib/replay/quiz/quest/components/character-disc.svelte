<script lang="ts">
	/** A character on a round plate whose ring has a hue of its own; the plate is neutral so every drawing reads in both themes. */
	import { cn } from '#lib/utils.js';
	import { CHARACTER_RINGS } from '../characters';
	import CharacterArt from './character-art.svelte';

	let {
		id,
		size = 'md',
		class: className = ''
	}: { id: number; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; class?: string } = $props();

	const SIZE = { xs: 'size-6', sm: 'size-8', md: 'size-10', lg: 'size-14', xl: 'size-20' };
</script>

<span
	class={cn(
		'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 ring-2 select-none dark:bg-slate-200',
		SIZE[size],
		CHARACTER_RINGS[id % CHARACTER_RINGS.length],
		className
	)}
	aria-hidden="true"
>
	<CharacterArt {id} class="size-[84%]" />
</span>
