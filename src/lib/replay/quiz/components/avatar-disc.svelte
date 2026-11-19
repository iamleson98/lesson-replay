<script lang="ts">
	/** A player's avatar: an animal on a coloured disc, the same for a name everywhere. */
	import { cn } from '#lib/utils.js';
	import { avatarOf } from '../avatar';

	let {
		name,
		size = 'md',
		class: className = ''
	}: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; class?: string } = $props();

	const avatar = $derived(avatarOf(name));
	const SIZE = {
		sm: 'size-7 text-base',
		md: 'size-9 text-xl',
		lg: 'size-14 text-3xl',
		xl: 'size-24 text-6xl'
	};
</script>

<span
	class={cn(
		'inline-flex shrink-0 items-center justify-center rounded-full ring-2 select-none',
		SIZE[size],
		avatar.disc,
		className
	)}
	aria-hidden="true">{avatar.emoji}</span
>
