<script lang="ts">
	/** The top five as of the last reveal, in one compact strip (it changes at reveals only). */
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import type { StageRoom } from '../stage-room';
	import AvatarDisc from './avatar-disc.svelte';

	let { room }: { room: StageRoom } = $props();

	const game = $derived(room.game);
</script>

{#if game.standings.length > 0}
	<ol class="flex min-w-0 flex-wrap gap-1.5" aria-label={t('quiz.topFive')}>
		{#each game.standings as line, i (i)}
			<li
				class={cn(
					'bg-card flex min-w-0 max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs font-bold',
					game.rank === i + 1 && 'border-primary'
				)}
			>
				<span class="text-muted-foreground w-4 text-center tabular-nums">{i + 1}</span>
				<AvatarDisc name={line.name} size="sm" class="size-5 text-xs" />
				<span class="max-w-24 truncate">{line.name}</span>
				<span class="tabular-nums">{line.score}</span>
			</li>
		{/each}
	</ol>
{/if}
