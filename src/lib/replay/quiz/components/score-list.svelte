<script lang="ts">
	/** A scoreboard: avatars, names and points, best first, with the player's own line marked. */
	import type { Snippet } from 'svelte';
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import type { ScoreLine } from '../protocol';
	import AvatarDisc from './avatar-disc.svelte';

	let {
		lines,
		label,
		mine,
		avatar,
		points,
		class: className = ''
	}: {
		lines: ScoreLine[];
		label: string;
		mine?: number;
		/** Draws a line's picture in place of the animal avatar (Quest's characters). */
		avatar?: Snippet<[string, 'sm' | 'md', string]>;
		/** Writes a line's score in place of "n pts". */
		points?: (n: number) => string;
		class?: string;
	} = $props();
</script>

<ol class={cn('space-y-1.5', className)} aria-label={label}>
	{#each lines as line, i (i)}
		<li
			class={cn(
				'bg-card flex min-w-0 [contain-intrinsic-size:auto_44px] [content-visibility:auto] items-center gap-3 rounded-xl border px-3 py-2 text-sm',
				mine === i + 1 && 'border-primary ring-primary/30 ring-2'
			)}
		>
			<span
				class="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg font-bold tabular-nums"
				>{i + 1}</span
			>
			{#if avatar}
				{@render avatar(line.name, 'sm', '')}
			{:else}
				<AvatarDisc name={line.name} size="sm" />
			{/if}
			<span class="min-w-0 flex-1 truncate font-medium">{line.name}</span>
			<span class="font-bold tabular-nums"
				>{points ? points(line.score) : t('quiz.points', { n: line.score })}</span
			>
		</li>
	{/each}
</ol>
