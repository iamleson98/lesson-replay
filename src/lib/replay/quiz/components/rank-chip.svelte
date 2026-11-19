<script lang="ts">
	/**
	 * A player's standing as of the last reveal: rank of the class and total
	 * score. It stays on screen through the next question. It only changes at a
	 * reveal: players are not sent a moving ranking, which would show who has
	 * the right option before they answered.
	 */
	import { t } from '../../i18n/strings.svelte';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import type { StageRoom } from '../stage-room';

	let { room }: { room: StageRoom } = $props();

	const game = $derived(room.game);
</script>

{#if game.rank > 0}
	{#key game.rank}
		<span
			class="qz-pop bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold tabular-nums"
		>
			<TrophyIcon class="size-4" aria-hidden="true" />
			{game.players > 0
				? t('quiz.rankOf', { rank: game.rank, total: game.players })
				: t('quiz.rank', { n: game.rank })}
			· {t('quiz.points', { n: game.score })}
		</span>
	{/key}
{/if}
